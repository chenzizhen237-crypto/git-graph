/** The Changes view: conflicts, staged, unstaged and untracked files, the diff, and the commit composer. */
import { ArrowUp, Check, ChevronDown, ChevronRight, Minus, Plus, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { DiffView } from '../components/Diff'
import { Button, caps, Count, Empty, FilePath, fileRowClass, IconButton, LineStats, StatusBadge, splitPath } from '../components/ui'
import { cx } from '../lib/cx'
import { actions, git, workFileDiff, workStats } from '../lib/git'
import { isConflict, isStaged, isUnstaged } from '../lib/parse'
import type { FileChange } from '../lib/types'
import { useApp } from '../state'

type Kind = 'conflict' | 'staged' | 'unstaged' | 'untracked'
type Sel = { path: string; kind: Kind }
type Counts = Map<string, { added?: number; deleted?: number }>

const LETTER: Record<Kind, (c: FileChange) => string> = {
  conflict: () => 'U',
  staged: c => c.x,
  unstaged: c => c.y,
  untracked: () => 'A',
}

/** The list column shared by Changes and Stashes. */
export const listColumn = 'flex min-h-0 w-95 shrink-0 flex-col border-r border-subtle'

export function PaneHead({ title, count, children }: { title: string; count: number; children?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle pr-2.5 pl-3.5">
      <span className="text-lg font-bold">{title}</span>
      <Count>{count}</Count>
      <span className="flex-1" />
      {children}
    </div>
  )
}

export function ChangesView() {
  const { root, repo, act, ask, busy } = useApp()
  const [sel, setSel] = useState<Sel | null>(null)
  const [diff, setDiff] = useState({ text: '', loading: false })
  const [counts, setCounts] = useState<{ staged: Counts; unstaged: Counts }>({ staged: new Map(), unstaged: new Map() })

  const groups = useMemo(() => {
    const ch = repo?.changes ?? []
    return {
      conflict: ch.filter(isConflict),
      staged: ch.filter(isStaged),
      unstaged: ch.filter(c => isUnstaged(c) && c.x !== '?' && !isConflict(c)),
      untracked: ch.filter(c => c.x === '?'),
    }
  }, [repo?.changes])

  // Line counts, and keep a valid selection as files move between groups.
  useEffect(() => {
    void workStats(root).then(setCounts).catch(() => {})
    const all = (Object.keys(groups) as Kind[]).flatMap(k => groups[k].map(c => ({ path: c.path, kind: k })))
    setSel(s => (s && all.some(a => a.path === s.path && a.kind === s.kind) ? s : (all.find(a => a.path === s?.path) ?? all[0] ?? null)))
  }, [root, groups])

  useEffect(() => {
    if (!sel) return setDiff({ text: '', loading: false })
    let live = true
    setDiff(d => ({ ...d, loading: true }))
    workFileDiff(root, sel.path, sel.kind)
      .then(text => live && setDiff({ text, loading: false }))
      .catch(() => live && setDiff({ text: '', loading: false }))
    return () => {
      live = false
    }
  }, [root, sel, repo])

  if (!repo) return null
  const total = repo.changes.length

  const discard = async (c: FileChange, kind: Kind) => {
    const untracked = kind === 'untracked'
    if (
      await ask({
        title: `Discard changes to ${splitPath(c.path).name}?`,
        text: untracked ? 'The file is deleted. This cannot be undone.' : 'Your edits to this file are lost. This cannot be undone.',
        confirm: untracked ? 'Delete file' : 'Discard',
        danger: true,
      })
    )
      await act('Discard', untracked ? actions.clean([c.path]) : actions.discard([c.path]))
  }
  const resolveWith = async (c: FileChange, side: 'ours' | 'theirs') => {
    if (await act(`Use ${side}`, ['checkout', `--${side}`, '--', c.path])) await act('Mark resolved', actions.stage([c.path]))
  }

  const rowActions = (c: FileChange, kind: Kind) => {
    if (kind === 'conflict')
      return (
        <>
          <Button small onClick={() => void resolveWith(c, 'ours')}>
            Ours
          </Button>
          <Button small onClick={() => void resolveWith(c, 'theirs')}>
            Theirs
          </Button>
          <IconButton icon={Check} small title="Mark resolved (stage)" onClick={() => void act('Mark resolved', actions.stage([c.path]))} />
        </>
      )
    if (kind === 'staged') return <IconButton icon={Minus} small title="Unstage" onClick={() => void act('Unstage', actions.unstage([c.path]))} />
    return (
      <>
        <IconButton icon={Undo2} small title="Discard" onClick={() => void discard(c, kind)} />
        <IconButton icon={Plus} small title="Stage" onClick={() => void act('Stage', actions.stage([c.path]))} />
      </>
    )
  }

  const section = (kind: Kind, label: string, action: { label: string; run: () => void }) => {
    const files = groups[kind]
    if (!files.length && kind === 'conflict') return null
    return (
      <Group label={label} count={files.length} conflict={kind === 'conflict'} action={files.length ? action : undefined}>
        {files.map(c => {
          const { name, dir } = splitPath(c.path)
          const n = (kind === 'staged' ? counts.staged : counts.unstaged).get(c.path)
          const toggle = kind === 'staged' ? actions.unstage([c.path]) : actions.stage([c.path])
          return (
            <div
              key={kind + c.path}
              className={fileRowClass(sel?.path === c.path && sel.kind === kind)}
              onClick={() => setSel({ path: c.path, kind })}
              onDoubleClick={() => kind !== 'conflict' && void act(kind === 'staged' ? 'Unstage' : 'Stage', toggle)}
              title={c.orig ? `${c.orig} → ${c.path}` : c.path}
            >
              <StatusBadge letter={LETTER[kind](c)} />
              <FilePath name={name} dir={kind === 'conflict' ? 'both modified' : dir} />
              <span className="group-hover:hidden">
                {kind === 'conflict' ? <span className="font-mono text-sm text-status-conflict">conflict</span> : n?.added !== undefined && <LineStats added={n.added} deleted={n.deleted} />}
              </span>
              <span className="hidden gap-0.5 group-hover:flex" onClick={e => e.stopPropagation()}>
                {rowActions(c, kind)}
              </span>
            </div>
          )
        })}
      </Group>
    )
  }

  return (
    <>
      <div className={listColumn}>
        <PaneHead title="Changes" count={total} />
        <div className="flex-1 overflow-y-auto p-1.5">
          {section('conflict', 'UNMERGED', { label: 'Mark all resolved', run: () => void act('Mark resolved', actions.stage(groups.conflict.map(c => c.path))) })}
          {section('staged', 'STAGED', { label: 'Unstage all', run: () => void act('Unstage all', actions.unstageAll()) })}
          {section('unstaged', 'UNSTAGED', { label: 'Stage all', run: () => void act('Stage all', actions.stage(groups.unstaged.map(c => c.path))) })}
          {section('untracked', 'UNTRACKED', { label: 'Stage all', run: () => void act('Stage all', actions.stage(groups.untracked.map(c => c.path))) })}
          {!total && <Empty>Nothing to commit — working tree clean</Empty>}
        </div>
        <Composer staged={groups.staged.length} conflicts={groups.conflict.length} busy={!!busy} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {sel ? <DiffView path={sel.path} text={diff.text} loading={diff.loading} empty={sel.kind === 'untracked' ? 'Empty file' : undefined} /> : <Empty>Select a file to see its changes</Empty>}
      </div>
    </>
  )
}

function Group({ label, count, conflict, action, children }: { label: string; count: number; conflict?: boolean; action?: { label: string; run: () => void }; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <div className={cx('flex h-7.5 items-center gap-1.5 pr-2.5 pl-1.5', caps)}>
        <button type="button" onClick={() => setOpen(!open)} className="flex">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className={cx(conflict && 'text-status-conflict')}>{label}</span>
        <Count>{count}</Count>
        {action && (
          <button type="button" className="ml-auto text-sm font-medium tracking-normal text-link hover:underline" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
      {open && children}
    </>
  )
}

const field = 'w-full rounded-md border border-strong bg-app outline-none focus:border-focus focus:ring-1 focus:ring-focus'

function Composer({ staged, conflicts, busy }: { staged: number; conflicts: number; busy: boolean }) {
  const { root, repo, act } = useApp()
  const key = `draft:${root}`
  const [summary, setSummary] = useState(() => localStorage.getItem(key + ':s') ?? '')
  const [body, setBody] = useState(() => localStorage.getItem(key + ':b') ?? '')
  const [amend, setAmend] = useState(false)
  const [signoff, setSignoff] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(key + ':s', summary)
      localStorage.setItem(key + ':b', body)
    } catch {}
  }, [key, summary, body])

  // A merge comes with its message; offer it when the box is empty.
  useEffect(() => {
    if (repo?.operation === 'merge' && repo.operationTitle) setSummary(s => s || repo.operationTitle!)
  }, [repo?.operation, repo?.operationTitle])

  const toggleAmend = async (on: boolean) => {
    setAmend(on)
    if (on && !summary && !body) {
      const msg = await git(root, ['log', '-1', '--format=%B'])
      const [s = '', ...rest] = msg.trim().split('\n')
      setSummary(s)
      setBody(rest.join('\n').trim())
    }
  }

  const all = !staged && !amend && (repo?.changes.length ?? 0) > 0
  const canCommit = !busy && !conflicts && summary.trim().length > 0 && (staged > 0 || amend || all)
  const commit = async (push: boolean) => {
    if (all && !(await act('Stage all', actions.stageAll()))) return
    const message = body.trim() ? `${summary.trim()}\n\n${body.trim()}` : summary.trim()
    const ok = await act(amend ? 'Amend' : 'Commit', actions.commit(amend, signoff), { stdin: message + '\n', done: amend ? 'Commit amended' : 'Committed' })
    if (!ok) return
    setSummary('')
    setBody('')
    setAmend(false)
    if (push && repo) await act('Push', amend ? [...actions.push(repo), '--force-with-lease'] : actions.push(repo), { done: 'Pushed' })
  }
  const submitOnCmdEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCommit && void commit(false)

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-subtle bg-sidebar p-3">
      <input className={cx(field, 'h-8 px-2.5 font-medium')} placeholder="Summary (required)" value={summary} onChange={e => setSummary(e.target.value)} onKeyDown={submitOnCmdEnter} />
      <textarea className={cx(field, 'h-21 resize-none px-2.5 py-2 leading-normal text-secondary')} placeholder="Description" value={body} onChange={e => setBody(e.target.value)} onKeyDown={submitOnCmdEnter} />
      <div className="flex items-center gap-3.5 text-sm text-secondary">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="m-0 accent-accent" checked={amend} onChange={e => void toggleAmend(e.target.checked)} />
          Amend
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="m-0 accent-accent" checked={signoff} onChange={e => setSignoff(e.target.checked)} />
          Sign-off
        </label>
        <span className="flex-1" />
        <span className="text-faint">{summary.length || ''}</span>
      </div>
      <div className="flex gap-2">
        <Button kind="primary" icon={Check} className="flex-1" disabled={!canCommit} onClick={() => void commit(false)} title="⌘↩">
          {conflicts ? `Resolve ${conflicts} first` : amend ? 'Amend commit' : all ? `Commit all ${repo?.changes.length}` : `Commit ${staged}`}
        </Button>
        <Button icon={ArrowUp} disabled={!canCommit} onClick={() => void commit(true)}>
          Commit & Push
        </Button>
      </div>
    </div>
  )
}
