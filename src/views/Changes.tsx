/** The Changes view: conflicts, staged, unstaged and untracked files, the diff, and the commit composer. */
import { ArrowUp, Check, ChevronDown, ChevronRight, GitMerge, Minus, Plus, Undo2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { DiffView } from '../components/Diff'
import { type Hunk, hunkPatch } from '../lib/diff'
import { Resizer, usePanelSize } from '../components/Split'
import { Button, Count, caps, Empty, FilePath, fileRowClass, IconButton, LineStats, StatusBadge, splitPath } from '../components/ui'
import { cx } from '../lib/cx'
import { useMenus } from '../components/menus'
import { actions, git, run, workFileDiff, workStats } from '../lib/git'
import { t } from '../lib/i18n'
import { isConflict, isStaged, isUnstaged } from '../lib/parse'
import { openSheet } from '../lib/sheets'
import { getSettings, useSettings } from '../lib/settings'
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
export const listColumn = 'flex min-h-0 shrink-0 flex-col border-r border-subtle'

export function PaneHead({ title, count, children }: { title: string; count: number; children?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle pr-2.5 pl-3.5">
      <span className="text-lg font-bold">{title}</span>
      <Count>{count}</Count>
      <span className="min-w-4 flex-1" />
      {children}
    </div>
  )
}

export function ChangesView() {
  const { root, repo, act, ask, busy, openMenu } = useApp()
  const menus = useMenus()
  const [sel, setSel] = useState<Sel | null>(null)
  const [diff, setDiff] = useState({ text: '', loading: false })
  const [counts, setCounts] = useState<{ staged: Counts; unstaged: Counts }>({ staged: new Map(), unstaged: new Map() })
  const list = usePanelSize('changes-list', 380, 260, 900)
  const composer = usePanelSize('composer', 84, 36, 520)

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
    void workStats(root)
      .then(setCounts)
      .catch(() => {})
    const all = (Object.keys(groups) as Kind[]).flatMap(k => groups[k].map(c => ({ path: c.path, kind: k })))
    setSel(s => (s && all.some(a => a.path === s.path && a.kind === s.kind) ? s : (all.find(a => a.path === s?.path) ?? all[0] ?? null)))
  }, [root, groups])

  const { diffWhitespace } = useSettings()
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload the diff when the repo changes on disk or the whitespace setting does
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
  }, [root, sel, repo, diffWhitespace])

  if (!repo) return null
  const total = repo.changes.length

  const discard = async (c: FileChange, kind: Kind) => {
    const untracked = kind === 'untracked'
    if (
      await ask({
        title: t('Discard changes to {name}?', { name: splitPath(c.path).name }),
        text: untracked ? t('The file is deleted. This cannot be undone.') : t('Your edits to this file are lost. This cannot be undone.'),
        confirm: untracked ? t('Delete file') : t('Discard'),
        danger: true,
      })
    )
      await act('Discard', untracked ? actions.clean([c.path]) : actions.discard([c.path]))
  }
  const resolveWith = async (c: FileChange, side: 'ours' | 'theirs') => {
    if (await act(t('Use {side}', { side }), ['checkout', `--${side}`, '--', c.path])) await act('Mark resolved', actions.stage([c.path]))
  }

  // Stage, unstage or discard one hunk, or the lines picked in it. Only for plain edits:
  // a renamed file's patch needs both names, and a whitespace-filtered diff would not apply.
  const renamed = !!repo.changes.find(c => c.path === sel?.path)?.orig
  const partial = !!sel && (sel.kind === 'staged' || sel.kind === 'unstaged') && !renamed && diffWhitespace === 'all'
  const applyHunk = async (hunk: Hunk, lines: Set<number> | null, how: 'stage' | 'unstage' | 'discard', done: () => void) => {
    if (!sel) return
    const what = lines ? t('lines') : t('hunk')
    if (
      how === 'discard' &&
      !(await ask({ title: t('Discard this {what}?', { what }), text: t('Your edits to these lines are lost. This cannot be undone.'), confirm: t('Discard'), danger: true }))
    )
      return
    const patch = hunkPatch(sel.path, hunk, lines, how === 'stage' ? 'forward' : 'reverse')
    const args = ['apply', '--recount', ...(how === 'discard' ? [] : ['--cached']), ...(how === 'stage' ? [] : ['--reverse']), '-']
    const label = { stage: lines ? 'Stage lines' : 'Stage hunk', unstage: lines ? 'Unstage lines' : 'Unstage hunk', discard: lines ? 'Discard lines' : 'Discard hunk' }[how]
    if (await act(label, args, { stdin: patch })) done()
  }
  const hunkTools = partial
    ? (hunk: Hunk, lines: Set<number> | null, done: () => void) =>
        sel.kind === 'staged' ? (
          <Button small icon={Minus} onClick={() => void applyHunk(hunk, lines, 'unstage', done)}>
            {lines ? t('Unstage lines') : t('Unstage hunk')}
          </Button>
        ) : (
          <>
            <Button small icon={Undo2} onClick={() => void applyHunk(hunk, lines, 'discard', done)}>
              {lines ? t('Discard lines') : t('Discard hunk')}
            </Button>
            <Button small kind="primary" icon={Plus} onClick={() => void applyHunk(hunk, lines, 'stage', done)}>
              {lines ? t('Stage lines') : t('Stage hunk')}
            </Button>
          </>
        )
    : undefined

  const rowActions = (c: FileChange, kind: Kind) => {
    if (kind === 'conflict')
      return (
        <>
          <Button small kind="primary" icon={GitMerge} onClick={() => openSheet({ kind: 'conflict', path: c.path })}>
            {t('Resolve…')}
          </Button>
          <Button small onClick={() => void resolveWith(c, 'ours')}>
            {t('Ours')}
          </Button>
          <Button small onClick={() => void resolveWith(c, 'theirs')}>
            {t('Theirs')}
          </Button>
          <IconButton icon={Check} small title={t('Mark resolved (stage)')} onClick={() => void act('Mark resolved', actions.stage([c.path]))} />
        </>
      )
    if (kind === 'staged') return <IconButton icon={Minus} small title={t('Unstage')} onClick={() => void act('Unstage', actions.unstage([c.path]))} />
    return (
      <>
        <IconButton icon={Undo2} small title={t('Discard')} onClick={() => void discard(c, kind)} />
        <IconButton icon={Plus} small title={t('Stage')} onClick={() => void act('Stage', actions.stage([c.path]))} />
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
              onContextMenu={e => {
                setSel({ path: c.path, kind })
                openMenu(e, menus.workFile(c.path, kind))
              }}
              onDoubleClick={() => kind !== 'conflict' && void act(kind === 'staged' ? t('Unstage') : t('Stage'), toggle)}
              title={c.orig ? `${c.orig} → ${c.path}` : c.path}
            >
              <StatusBadge letter={LETTER[kind](c)} />
              <FilePath name={name} dir={kind === 'conflict' ? 'both modified' : dir} />
              <span className="group-hover:hidden">
                {kind === 'conflict' ? (
                  <span className="font-mono text-sm text-status-conflict">conflict</span>
                ) : (
                  n?.added !== undefined && <LineStats added={n.added} deleted={n.deleted} />
                )}
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
      <div className={listColumn} style={{ width: list.size }}>
        <PaneHead title={t('Changes')} count={total} />
        <div className="flex-1 overflow-y-auto p-1.5">
          {section('conflict', 'UNMERGED', { label: t('Mark all resolved'), run: () => void act('Mark resolved', actions.stage(groups.conflict.map(c => c.path))) })}
          {section('staged', 'STAGED', { label: t('Unstage all'), run: () => void act('Unstage all', actions.unstageAll()) })}
          {section('unstaged', 'UNSTAGED', { label: t('Stage all'), run: () => void act('Stage all', actions.stage(groups.unstaged.map(c => c.path))) })}
          {section('untracked', 'UNTRACKED', { label: t('Stage all'), run: () => void act('Stage all', actions.stage(groups.untracked.map(c => c.path))) })}
          {!total && <Empty>{t('Nothing to commit — working tree clean')}</Empty>}
        </div>
        <Resizer panel={composer} axis="y" side="after" />
        <Composer staged={groups.staged.length} conflicts={groups.conflict.length} busy={!!busy} descHeight={composer.size} />
      </div>
      <Resizer panel={list} />
      <div className="flex min-w-0 flex-1 flex-col">
        {sel ? (
          <DiffView path={sel.path} text={diff.text} loading={diff.loading} empty={sel.kind === 'untracked' ? t('Empty file') : undefined} hunkTools={hunkTools} />
        ) : (
          <Empty>{t('Select a file to see its changes')}</Empty>
        )}
      </div>
    </>
  )
}

function Group({
  label,
  count,
  conflict,
  action,
  children,
}: {
  label: string
  count: number
  conflict?: boolean
  action?: { label: string; run: () => void }
  children: ReactNode
}) {
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

/** Settings → Commits & graph template, else the file git's commit.template points at. */
async function commitTemplate(root: string) {
  const own = getSettings().commit.template
  if (own.trim()) return own
  const path = (await run(root, ['config', '--get', '--path', 'commit.template'])).stdout.trim()
  if (!path) return ''
  // git prints any file as one added hunk; read it back from that.
  const out = await run(root, ['diff', '--no-index', '--no-color', '--', '/dev/null', path])
  const lines = out.stdout.split('\n')
  const start = lines.findIndex(l => l.startsWith('@@'))
  return start < 0
    ? ''
    : lines
        .slice(start + 1)
        .filter(l => l.startsWith('+'))
        .map(l => l.slice(1))
        .filter(l => !l.startsWith('#'))
        .join('\n')
}

function Composer({ staged, conflicts, busy, descHeight }: { staged: number; conflicts: number; busy: boolean; descHeight: number }) {
  const { root, repo, act } = useApp()
  const { commit: prefs } = useSettings()
  const key = `draft:${root}`
  const [summary, setSummary] = useState(() => localStorage.getItem(`${key}:s`) ?? '')
  const [body, setBody] = useState(() => localStorage.getItem(`${key}:b`) ?? '')
  const [amend, setAmend] = useState(false)
  const [signoff, setSignoff] = useState(false)
  const [noVerify, setNoVerify] = useState(prefs.skipHooks)
  useEffect(() => setNoVerify(prefs.skipHooks), [prefs.skipHooks])

  /** Puts the template in an empty message box. */
  const fillTemplate = useCallback(async () => {
    const tpl = (await commitTemplate(root).catch(() => '')).replace(/\s+$/, '')
    if (!tpl) return
    const [s = '', ...rest] = tpl.split('\n')
    setSummary(cur => cur || s)
    setBody(cur => cur || rest.join('\n').replace(/^\n+/, ''))
  }, [root])
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the box is first shown or the template changes
  useEffect(() => {
    if (!summary && !body) void fillTemplate()
  }, [fillTemplate, prefs.template])

  useEffect(() => {
    try {
      localStorage.setItem(`${key}:s`, summary)
      localStorage.setItem(`${key}:b`, body)
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
    const ok = await act(amend ? t('Amend') : t('Commit'), actions.commit(amend, signoff, noVerify), { stdin: `${message}\n`, done: amend ? t('Commit amended') : t('Committed') })
    if (!ok) return
    setSummary('')
    setBody('')
    setAmend(false)
    void fillTemplate()
    if (push && repo) await act('Push', amend ? [...actions.push(repo), '--force-with-lease'] : actions.push(repo), { done: t('Pushed') })
  }
  const submitOnCmdEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCommit && void commit(false)

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-subtle bg-sidebar p-3">
      <input
        className={cx(field, 'h-8 px-2.5 font-medium')}
        placeholder={t('Summary (required)')}
        value={summary}
        onChange={e => setSummary(e.target.value)}
        onKeyDown={submitOnCmdEnter}
      />
      <textarea
        style={{ height: descHeight }}
        className={cx(field, 'resize-none px-2.5 py-2 leading-normal text-secondary')}
        placeholder={t('Description')}
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={submitOnCmdEnter}
      />
      <div className="flex items-center gap-3.5 text-sm text-secondary">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="m-0 accent-accent" checked={amend} onChange={e => void toggleAmend(e.target.checked)} />
          {t('Amend')}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="m-0 accent-accent" checked={signoff} onChange={e => setSignoff(e.target.checked)} />
          {t('Sign-off')}
        </label>
        <label className="flex items-center gap-1.5" title="--no-verify">
          <input type="checkbox" className="m-0 accent-accent" checked={noVerify} onChange={e => setNoVerify(e.target.checked)} />
          {t('Skip hooks')}
        </label>
        <span className="min-w-4 flex-1" />
        <span className={cx(prefs.subjectGuide && summary.length > prefs.subjectGuide ? 'font-semibold text-status-modified' : 'text-faint')}>
          {summary.length ? (prefs.subjectGuide ? `${summary.length} / ${prefs.subjectGuide}` : summary.length) : ''}
        </span>
      </div>
      <div className="flex gap-2">
        <Button kind="primary" icon={Check} className="flex-1" disabled={!canCommit} onClick={() => void commit(false)} title="⌘↩">
          {conflicts
            ? t('Resolve {n} first', { n: conflicts })
            : amend
              ? t('Amend commit')
              : all
                ? t('Commit all {n}', { n: repo?.changes.length ?? 0 })
                : t('Commit {n}', { n: staged })}
        </Button>
        <Button icon={ArrowUp} disabled={!canCommit} onClick={() => void commit(true)}>
          {t('Commit & Push')}
        </Button>
      </div>
    </div>
  )
}
