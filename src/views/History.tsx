/** The History view: filter bar, the commit graph and the commit inspector. */
import {
  Calendar,
  Check,
  CherryIcon,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  Copy,
  FileText,
  FolderTree,
  GitBranchPlus,
  GitCommitHorizontal,
  GitFork,
  GitGraph,
  LogIn,
  Rows3,
  Search,
  Tag,
  Undo2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { DiffView } from '../components/Diff'
import { Resizer, usePanelSize } from '../components/Split'
import { GraphCell, ROW_H, graphWidth, type NodeKind } from '../components/GraphCell'
import { Avatar, caps, Chip, Count, Empty, FilePath, fileRowClass, IconButton, LineStats, refChips, Segmented, shortAgo, splitPath, StageDot, StatusBadge } from '../components/ui'
import { cx } from '../lib/cx'
import { actions, commitDetail, commitFileDiff } from '../lib/git'
import { compactAgo, matchItems, nameParts, pickSections, QUICK_SCOPES, scopeLabel, type PickItem } from '../lib/picker'
import type { CommitDetail, CommitFile, LogRow } from '../lib/types'
import { useApp, useRemoteNames } from '../state'

const DATES = [
  { value: '', label: 'Any date' },
  { value: '24 hours ago', label: 'Last 24 hours' },
  { value: '1 week ago', label: 'Last 7 days' },
  { value: '1 month ago', label: 'Last 30 days' },
  { value: '1 year ago', label: 'Last year' },
]

const popover = 'absolute z-40 flex flex-col overflow-hidden rounded-lg border border-strong bg-elevated shadow-[0_12px_32px_var(--shadow)]'

export function HistoryView() {
  const [layout, setLayout] = useState<'list' | 'split'>('split')
  const [showGraph, setShowGraph] = useState(true)
  const inspector = usePanelSize('inspector', 420, 300, 1200)
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <FilterBar layout={layout} setLayout={setLayout} showGraph={showGraph} setShowGraph={setShowGraph} />
        <LogList showGraph={showGraph} />
      </div>
      {layout === 'split' && (
        <>
          <Resizer panel={inspector} side="after" />
          <Inspector width={inspector.size} />
        </>
      )}
    </>
  )
}

/** Scope button: the outlined pill of the filter bar, or a quiet one. */
function FilterButton({ icon: Icon, children, quiet, open, onClick, title }: { icon: LucideIcon; children: ReactNode; quiet?: boolean; open?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex h-7 max-w-60 shrink-0 items-center gap-1.5 rounded-md border px-2 whitespace-nowrap hover:bg-hover [&>svg]:shrink-0 [&>svg]:text-muted',
        quiet ? 'border-transparent text-secondary' : 'border-strong bg-app font-medium',
        open && 'border-focus! bg-selected!',
      )}
    >
      <Icon size={13} />
      {children}
    </button>
  )
}

function FilterInput({ placeholder, value, onCommit, onClose }: { placeholder: string; value: string; onCommit: (v: string) => void; onClose: () => void }) {
  return (
    <input
      autoFocus
      placeholder={placeholder}
      defaultValue={value}
      className="h-7 w-45 rounded-md border border-strong bg-app px-2 outline-none focus:border-focus"
      onBlur={e => !e.target.value && onClose()}
      onKeyDown={e => {
        if (e.key === 'Enter') onCommit(e.currentTarget.value.trim())
        if (e.key === 'Escape') (onCommit(''), onClose())
      }}
    />
  )
}

function FilterBar({ layout, setLayout, showGraph, setShowGraph }: { layout: 'list' | 'split'; setLayout: (v: 'list' | 'split') => void; showGraph: boolean; setShowGraph: (v: boolean) => void }) {
  const { repo, query, setQuery } = useApp()
  const [picker, setPicker] = useState(false)
  const [dateMenu, setDateMenu] = useState(false)
  const [editing, setEditing] = useState<'author' | 'query' | null>(null)
  const scoped = query.branch !== '--all'
  return (
    <div className="relative flex h-11 shrink-0 items-center gap-2 px-3">
      <FilterButton icon={GitFork} open={picker} onClick={() => setPicker(!picker)} title="Which branches the log shows">
        <span className="truncate">{scopeLabel(query.branch)}</span>
        {scoped ? (
          <X
            size={13}
            className="shrink-0 text-muted"
            onClick={e => {
              e.stopPropagation()
              setQuery({ branch: '--all' })
            }}
          />
        ) : (
          <ChevronDown size={13} className="shrink-0 text-muted" />
        )}
      </FilterButton>
      {picker && <ScopePicker close={() => setPicker(false)} />}

      <div className="relative">
        <FilterButton icon={Calendar} quiet onClick={() => setDateMenu(!dateMenu)}>
          {DATES.find(d => d.value === query.since)?.label ?? 'Any date'}
          <ChevronDown size={13} className="text-muted" />
        </FilterButton>
        {dateMenu && (
          <>
            <div className="fixed inset-0 z-39" onClick={() => setDateMenu(false)} />
            <div className={cx(popover, 'top-8 left-0 w-45 p-1.5')}>
              {DATES.map(d => (
                <button
                  key={d.value}
                  type="button"
                  className="flex h-7 items-center gap-2 rounded-md px-2 text-left hover:bg-hover"
                  onClick={() => {
                    setQuery({ since: d.value })
                    setDateMenu(false)
                  }}
                >
                  <span className="flex-1">{d.label}</span>
                  {query.since === d.value && <Check size={13} className="text-accent" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {editing === 'author' || query.author ? (
        <FilterInput placeholder="Author" value={query.author} onCommit={author => setQuery({ author })} onClose={() => setEditing(null)} />
      ) : (
        <FilterButton icon={Users} quiet onClick={() => setEditing('author')}>
          All authors
        </FilterButton>
      )}
      {editing === 'query' || query.query ? (
        <FilterInput placeholder="Message contains…" value={query.query} onCommit={q => setQuery({ query: q })} onClose={() => setEditing(null)} />
      ) : (
        <FilterButton icon={Search} quiet onClick={() => setEditing('query')}>
          Message
        </FilterButton>
      )}

      <span className="flex-1" />
      {repo && (
        <span className="hidden text-sm whitespace-nowrap text-muted 2xl:inline">
          {repo.rows.length.toLocaleString()}
          {repo.hasMore ? '+' : ''} of {repo.totalCommits.toLocaleString()} commits
        </span>
      )}
      <Segmented
        value={layout}
        onChange={setLayout}
        options={[
          { value: 'list', icon: Rows3, title: 'List only' },
          { value: 'split', icon: Columns3, title: 'List and details' },
        ]}
      />
      <IconButton icon={GitGraph} active={showGraph} onClick={() => setShowGraph(!showGraph)} title="Show the graph" />
    </div>
  )
}

/** The branch scope picker from the Neovim pane: type to narrow every ref, Enter takes the first. */
function ScopePicker({ close }: { close: () => void }) {
  const { repo, query, setQuery } = useApp()
  const [q, setQ] = useState('')
  const sections = useMemo(() => pickSections(repo?.refs ?? []), [repo?.refs])
  const lists = {
    LOCAL: matchItems(sections.local, q),
    'REMOTE ONLY': matchItems(sections.remote, q),
    TAGS: matchItems(sections.tag, q),
  }
  const first = Object.values(lists).flat()[0]
  const pick = (value: string) => {
    setQuery({ branch: value })
    close()
  }
  return (
    <>
      <div className="fixed inset-0 z-39" onClick={close} />
      <div className={cx(popover, 'top-10 left-3 max-h-115 w-95')}>
        <div className="m-2 flex h-7 items-center gap-1.5 rounded-md border border-focus bg-app px-2 text-muted">
          <Search size={13} />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-faint"
            placeholder="Filter branches, remotes and tags"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') close()
              if (e.key === 'Enter' && first) pick(first.value)
            }}
          />
        </div>
        <div className="flex gap-1.5 px-2 pb-1.5">
          {QUICK_SCOPES.map(s => (
            <button
              key={s.value}
              type="button"
              className={cx('h-6 rounded-md border px-2 text-sm', query.branch === s.value ? 'border-transparent bg-selected font-semibold text-ref-head' : 'border-subtle text-secondary hover:bg-hover')}
              onClick={() => pick(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto px-1.5 pb-1.5">
          {Object.entries(lists).map(([title, items]) =>
            items.length ? (
              <Fragment key={title}>
                <div className={cx('px-2 pt-2 pb-1', caps)}>
                  {title} {items.length}
                </div>
                {items.slice(0, q ? 50 : 8).map(item => (
                  <RefPickRow key={item.value} item={item} q={q} on={query.branch === item.value} onPick={() => pick(item.value)} />
                ))}
                {!q && items.length > 8 && <div className="px-2 pb-1 text-sm text-muted">+{items.length - 8} more · type to narrow</div>}
              </Fragment>
            ) : null,
          )}
          {!first && <Empty>No refs match “{q}”</Empty>}
        </div>
      </div>
    </>
  )
}

function RefPickRow({ item, q, on, onPick }: { item: PickItem; q: string; on: boolean; onPick: () => void }) {
  const r = item.ref
  const color = r.kind === 'tag' ? 'var(--ref-tag-text)' : r.kind === 'remote' ? 'var(--ref-remote)' : r.isHead ? 'var(--ref-head)' : 'var(--ref-local)'
  const Icon = r.kind === 'tag' ? Tag : r.kind === 'remote' ? GitFork : GitBranchPlus
  return (
    <button type="button" className={cx('flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-hover', on && 'bg-hover')} onClick={onPick}>
      <Icon size={13} color={color} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {nameParts(r.name, q).map((p, i) => (
          <span key={i} className={cx(p.dim && 'text-muted', p.hit && 'rounded-xs bg-ref-tag-soft')}>
            {p.text}
          </span>
        ))}
      </span>
      {item.synced && <span className="text-muted">⇅</span>}
      <span className="text-sm text-muted">{compactAgo(r.date)}</span>
      {on && <Check size={13} className="text-accent" />}
    </button>
  )
}

function nodeKind(row: LogRow, head: string): NodeKind {
  if (row.hash === head) return 'head'
  return row.parents.length > 1 ? 'merge' : 'commit'
}

const rowClass = 'absolute inset-x-0 flex h-row items-center gap-2 pr-3 pl-1'

function LogList({ showGraph }: { showGraph: boolean }) {
  const { repo, selected, setSelected, setView, loadMore, error } = useApp()
  const remotes = useRemoteNames()
  const box = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState(0)
  const [height, setHeight] = useState(800)
  const asking = useRef(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    asking.current = false
  }, [repo?.rows.length])

  // Select HEAD when nothing is selected yet.
  useEffect(() => {
    if (repo && !selected && repo.rows.length) setSelected(repo.rows.find(r => r.hash === repo.head)?.hash ?? repo.rows[0]!.hash)
  }, [repo, selected, setSelected])

  const rows = repo?.rows ?? []
  const offset = repo?.work ? 1 : 0
  const total = rows.length + offset
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 10)
  const last = Math.min(total, Math.ceil((scroll + height) / ROW_H) + 10)
  const gw = repo ? graphWidth(repo.laneCount) : 56

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setScroll(el.scrollTop)
    if (repo?.hasMore && !asking.current && el.scrollTop + el.clientHeight > el.scrollHeight - 600) {
      asking.current = true
      loadMore()
    }
  }

  const move = useCallback(
    (delta: number) => {
      if (!rows.length) return
      const at = rows.findIndex(r => r.hash === selected)
      const next = rows[Math.min(rows.length - 1, Math.max(0, at + delta))]!
      setSelected(next.hash)
      const top = (rows.indexOf(next) + offset) * ROW_H
      const el = box.current
      if (el && (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight)) el.scrollTop = top - el.clientHeight / 2
    },
    [rows, selected, setSelected, offset],
  )

  if (error && !repo) return <Empty>{error}</Empty>
  if (repo && !rows.length && !repo.work) return <Empty>No commits{repo.head ? ' match these filters' : ' yet'}.</Empty>

  const items = []
  for (let i = first; i < last; i++) {
    const top = i * ROW_H
    if (repo?.work && i === 0) {
      items.push(
        <div key="work" className={cx(rowClass, 'hover:bg-hover')} style={{ top }} onClick={() => setView('changes')}>
          {showGraph && <GraphCell g={repo.work} laneCount={repo.laneCount} kind="work" />}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 italic">
            <StageDot />
            <span className="font-medium text-secondary">
              {repo.changes.length} uncommitted change{repo.changes.length > 1 ? 's' : ''}
            </span>
            <span className="text-muted">· open Changes</span>
          </div>
          <span className="text-sm text-faint">⌘2</span>
        </div>,
      )
      continue
    }
    const r = rows[i - offset]!
    const kind = nodeKind(r, repo!.head)
    const chips = refChips(r.refs, remotes)
    const on = r.hash === selected
    items.push(
      <div key={r.hash} className={cx(rowClass, on ? 'bg-selected group-focus:shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-hover')} style={{ top }} onClick={() => setSelected(r.hash)}>
        {showGraph && <GraphCell g={r.graph} laneCount={repo!.laneCount} kind={kind} />}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {chips.map(c => (
            <Chip key={c.kind + c.name} kind={c.kind} name={c.name} synced={c.synced} />
          ))}
          <span className={cx('min-w-24 truncate', kind === 'head' && 'font-semibold', kind === 'merge' && 'text-secondary')}>{r.subject}</span>
          {r.body && <span className="min-w-0 shrink-[4] truncate text-muted">{r.body}</span>}
        </div>
        <div className="flex w-32.5 shrink-0 items-center gap-1.5 text-sm text-secondary">
          <Avatar name={r.author} />
          <span className="truncate">{r.author}</span>
        </div>
        <span className="w-21 shrink-0 text-sm whitespace-nowrap text-muted" title={new Date(r.time * 1000).toLocaleString()}>
          {shortAgo(r.ago)}
        </span>
        <span className="w-15.5 shrink-0 text-right font-mono text-sm font-medium text-link">{r.short}</span>
      </div>,
    )
  }

  return (
    <>
      <div className={cx('flex h-6.5 shrink-0 items-center gap-2 border-b border-subtle pr-3 pl-4 tracking-[0.6px]', caps, 'font-semibold')}>
        {showGraph && <span style={{ width: gw - 12 }}>GRAPH</span>}
        <span className="flex-1">DESCRIPTION</span>
        <span className="w-32.5">AUTHOR</span>
        <span className="w-21">DATE</span>
        <span className="w-15.5 text-right">SHA</span>
      </div>
      <div
        className="group relative flex-1 overflow-y-auto outline-none"
        ref={box}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'j') (e.preventDefault(), move(1))
          if (e.key === 'ArrowUp' || e.key === 'k') (e.preventDefault(), move(-1))
          if (e.key === 'PageDown') (e.preventDefault(), move(20))
          if (e.key === 'PageUp') (e.preventDefault(), move(-20))
        }}
      >
        <div className="relative" style={{ height: total * ROW_H + (repo?.hasMore ? 40 : 0) }}>
          {items}
          {repo?.hasMore && (
            <div className="absolute inset-x-0 flex h-10 items-center justify-center text-sm text-muted" style={{ top: total * ROW_H }}>
              Loading older commits…
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** Files grouped by folder, for the Tree tab. */
function byFolder(files: CommitFile[]) {
  const groups = new Map<string, CommitFile[]>()
  for (const f of files) {
    const { dir } = splitPath(f.path)
    groups.set(dir, [...(groups.get(dir) ?? []), f])
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
}

/** Tab/Active and Tab/Inactive. */
function Tab({ on, icon: Icon, children, onClick }: { on: boolean; icon: LucideIcon; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx('-mb-px flex items-center gap-1.25 border-b-2 py-2', on ? 'border-primary font-semibold text-primary' : 'border-transparent font-medium text-muted')}>
      <Icon size={13} />
      {children}
    </button>
  )
}

function Inspector({ width }: { width: number }) {
  const { root, repo, selected, setSelected, act, prompt, ask, toast } = useApp()
  const remotes = useRemoteNames()
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [file, setFile] = useState<CommitFile | null>(null)
  const [diff, setDiff] = useState<{ text: string; loading: boolean }>({ text: '', loading: false })
  const [tab, setTab] = useState<'files' | 'tree'>('files')
  const [compact, setCompact] = useState(() => localStorage.getItem('inspector:compact') === '1')
  const filesPanel = usePanelSize('inspector-files', 200, 56, 900)
  const row = repo?.rows.find(r => r.hash === selected)

  useEffect(() => {
    if (!selected) return
    let live = true
    commitDetail(root, selected)
      .then(d => {
        if (!live) return
        setDetail(d)
        setFile(d.files[0] ?? null)
      })
      .catch(() => live && setDetail(null))
    return () => {
      live = false
    }
  }, [root, selected])

  useEffect(() => {
    if (!selected || !file) return setDiff({ text: '', loading: false })
    let live = true
    setDiff(d => ({ ...d, loading: true }))
    commitFileDiff(root, selected, file.path, file.orig)
      .then(text => live && setDiff({ text, loading: false }))
      .catch(() => live && setDiff({ text: '', loading: false }))
    return () => {
      live = false
    }
  }, [root, selected, file])

  const shell = 'flex min-h-0 shrink-0 flex-col border-l border-subtle'
  if (!row || !detail || detail.hash !== row.hash)
    return (
      <aside className={shell} style={{ width }}>
        <Empty>{row ? 'Loading…' : 'Select a commit'}</Empty>
      </aside>
    )

  const [subject = '', ...rest] = detail.body.split('\n')
  const message = rest.join('\n').trim()
  const authorName = detail.author.replace(/ <.*>$/, '')
  const chips = refChips(row.refs, remotes)
  const fileRow = (f: CommitFile, nested = false) => {
    const { name, dir } = splitPath(f.path)
    return (
      <button key={f.path} type="button" className={cx(fileRowClass(file?.path === f.path), nested && 'pl-6.5')} onClick={() => setFile(f)} title={f.orig ? `${f.orig} → ${f.path}` : f.path}>
        <StatusBadge letter={f.status} />
        <FilePath name={name} dir={nested ? undefined : dir} />
        <LineStats added={f.added} deleted={f.deleted} />
      </button>
    )
  }

  const newBranch = async () => {
    const name = await prompt({ title: `New branch at ${row.short}`, placeholder: 'feature/name', confirm: 'Create and switch' })
    if (name) await act('Create branch', actions.createBranch(name.trim(), row.hash), { done: `Switched to ${name}` })
  }
  const newTag = async () => {
    const name = await prompt({ title: `Tag ${row.short}`, placeholder: 'v1.0.0', confirm: 'Create tag' })
    if (name) await act('Tag', actions.tag(name.trim(), row.hash), { done: `Tagged ${name}` })
  }
  const checkout = async () => {
    const branch = chips.find(c => c.kind === 'local' || c.kind === 'head')
    if (branch) return void act('Checkout', actions.checkout(branch.name), { done: `Switched to ${branch.name}` })
    if (await ask({ title: `Check out ${row.short}?`, text: 'This puts HEAD in a detached state. Create a branch to keep new work.', confirm: 'Check out' }))
      await act('Checkout', actions.checkoutCommit(row.hash))
  }
  const revert = async () => {
    if (await ask({ title: `Revert ${row.short}?`, text: `Creates a new commit that undoes “${subject}”.`, confirm: 'Revert' })) await act('Revert', actions.revert(row.hash), { done: 'Reverted' })
  }

  return (
    <aside className={shell} style={{ width }}>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1.25 rounded-sm bg-surface px-1.5 py-0.5 font-mono text-sm font-medium text-link">
            <GitCommitHorizontal size={12} className="text-muted" />
            {row.short}
          </span>
          <IconButton
            icon={Copy}
            size={13}
            small
            title="Copy full SHA"
            onClick={() => {
              void navigator.clipboard.writeText(row.hash)
              toast({ kind: 'ok', title: 'SHA copied' })
            }}
          />
          <span className="flex-1" />
          <IconButton icon={LogIn} title="Check out" onClick={() => void checkout()} />
          <IconButton icon={GitBranchPlus} title="New branch here" onClick={() => void newBranch()} />
          <IconButton icon={Tag} title="Tag this commit" onClick={() => void newTag()} />
          <IconButton icon={CherryIcon} title="Cherry-pick onto current branch" disabled={row.hash === repo?.head} onClick={() => void act('Cherry-pick', actions.cherryPick(row.hash), { done: 'Cherry-picked' })} />
          <IconButton icon={Undo2} title="Revert" onClick={() => void revert()} />
          <IconButton
            icon={compact ? ChevronsUpDown : ChevronsDownUp}
            title={compact ? 'Show commit details' : 'Collapse commit details'}
            onClick={() => {
              localStorage.setItem('inspector:compact', compact ? '0' : '1')
              setCompact(!compact)
            }}
          />
        </div>
        <div className={cx('leading-snug font-semibold select-text', compact ? 'truncate' : 'text-lg')}>{subject}</div>
        {!compact && message && <div className="max-h-30 overflow-y-auto leading-normal whitespace-pre-wrap text-secondary select-text">{message}</div>}
        {!compact && (
        <>
        <div className="flex items-center gap-2.5">
          <Avatar name={authorName} size={28} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{authorName}</div>
            <div className="truncate text-sm text-muted">
              {detail.date}
              {detail.committer && detail.committer !== authorName ? ` · committed by ${detail.committer}` : ''}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          {chips.map(c => (
            <Chip key={c.kind + c.name} kind={c.kind} name={c.name} synced={c.synced} />
          ))}
          {detail.parents.length > 0 && <span>{detail.parents.length > 1 ? 'Parents' : 'Parent'}</span>}
          {detail.parents.map(p => (
            <button key={p} type="button" className="font-mono font-medium text-link hover:underline" onClick={() => setSelected(p)}>
              {p.slice(0, 7)}
            </button>
          ))}
        </div>
        </>
        )}
      </div>
      <div className="flex shrink-0 gap-4.5 border-y border-subtle px-4">
        <Tab on={tab === 'files'} icon={FileText} onClick={() => setTab('files')}>
          Files <Count>{detail.files.length}</Count>
        </Tab>
        <Tab on={tab === 'tree'} icon={FolderTree} onClick={() => setTab('tree')}>
          Tree
        </Tab>
      </div>
      <div className="shrink-0 overflow-y-auto p-1.5" style={{ height: file ? filesPanel.size : undefined, flex: file ? undefined : 1 }}>
        {tab === 'files'
          ? detail.files.map(f => fileRow(f))
          : byFolder(detail.files).map(([dir, files]) => (
              <Fragment key={dir}>
                <div className="flex h-7 items-center gap-1.5 px-1.5 text-sm font-medium text-muted">
                  <FolderTree size={12} />
                  {dir || '/'}
                </div>
                {files.map(f => fileRow(f, true))}
              </Fragment>
            ))}
        {!detail.files.length && <Empty>No file changes</Empty>}
      </div>
      {file && (
        <>
          <Resizer panel={filesPanel} axis="y" />
          <DiffView path={file.path} text={diff.text} loading={diff.loading} />
        </>
      )}
    </aside>
  )
}
