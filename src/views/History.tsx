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
  type LucideIcon,
  Rows3,
  Search,
  Tag,
  Undo2,
  Users,
  X,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DiffView } from '../components/Diff'
import { useMenus } from '../components/menus'
import { GraphCell, graphWidth, type NodeKind, ROW_H } from '../components/GraphCell'
import { Resizer, usePanelSize } from '../components/Split'
import { Avatar, Chip, CiIcon, Count, caps, Empty, FilePath, fileRowClass, IconButton, LineStats, refChips, Segmented, StageDot, StatusBadge, splitPath } from '../components/ui'
import { cachedCi, type CiState, commitStates } from '../lib/actions'
import { cx } from '../lib/cx'
import { commitDate } from '../lib/dates'
import { actions, commitDetail, commitFileDiff, run } from '../lib/git'
import { t } from '../lib/i18n'
import { compactAgo, matchItems, nameParts, type PickItem, pickSections, QUICK_SCOPES, scopeLabel } from '../lib/picker'
import { useSettings } from '../lib/settings'
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
function FilterButton({
  icon: Icon,
  children,
  quiet,
  open,
  onClick,
  title,
}: {
  icon: LucideIcon
  children: ReactNode
  quiet?: boolean
  open?: boolean
  onClick: () => void
  title?: string
}) {
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
        if (e.key === 'Escape') {
          onCommit('')
          onClose()
        }
      }}
    />
  )
}

function FilterBar({
  layout,
  setLayout,
  showGraph,
  setShowGraph,
}: {
  layout: 'list' | 'split'
  setLayout: (v: 'list' | 'split') => void
  showGraph: boolean
  setShowGraph: (v: boolean) => void
}) {
  const { repo, query, setQuery } = useApp()
  const [picker, setPicker] = useState(false)
  const [dateMenu, setDateMenu] = useState(false)
  const [editing, setEditing] = useState<'author' | 'query' | null>(null)
  const scoped = query.branch !== '--all'
  return (
    <div className="relative flex h-11 shrink-0 items-center gap-2 px-3">
      <FilterButton icon={GitFork} open={picker} onClick={() => setPicker(!picker)} title={t('Which branches the log shows')}>
        <span className="truncate" title={scopeLabel(query.branch)}>
          {scopeLabel(query.branch)}
        </span>
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
          {t(DATES.find(d => d.value === query.since)?.label ?? 'Any date')}
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
                  <span className="flex-1">{t(d.label)}</span>
                  {query.since === d.value && <Check size={13} className="text-accent" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {editing === 'author' || query.author ? (
        <FilterInput placeholder={t('Author')} value={query.author} onCommit={author => setQuery({ author })} onClose={() => setEditing(null)} />
      ) : (
        <FilterButton icon={Users} quiet onClick={() => setEditing('author')}>
          {t('All authors')}
        </FilterButton>
      )}
      {editing === 'query' || query.query ? (
        <FilterInput placeholder={t('Message contains…')} value={query.query} onCommit={q => setQuery({ query: q })} onClose={() => setEditing(null)} />
      ) : (
        <FilterButton icon={Search} quiet onClick={() => setEditing('query')}>
          {t('Message')}
        </FilterButton>
      )}

      <span className="min-w-4 flex-1" />
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
          { value: 'list', icon: Rows3, title: t('List only') },
          { value: 'split', icon: Columns3, title: t('List and details') },
        ]}
      />
      <IconButton icon={GitGraph} active={showGraph} onClick={() => setShowGraph(!showGraph)} title={t('Show the graph')} />
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
            placeholder={t('Filter branches, remotes and tags')}
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
              className={cx(
                'h-6 rounded-md border px-2 text-sm',
                query.branch === s.value ? 'border-transparent bg-selected font-semibold text-ref-head' : 'border-subtle text-secondary hover:bg-hover',
              )}
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
      <span className="min-w-0 flex-1 truncate" title={r.name}>
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

/** `git log %G?`: G good, U good but untrusted, E no key to check, others bad. */
function SignatureBadge({ status, signer }: { status: string; signer: string }) {
  const good = status === 'G' || status === 'U'
  const unknown = status === 'E'
  const label = good ? t('Verified') : unknown ? t('Signed') : t('Bad signature')
  const title = good ? signer : unknown ? t('Signed, but the key to check it is not here') : t('The signature does not match')
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium',
        good ? 'bg-ref-local-soft text-ref-local' : unknown ? 'bg-surface text-muted' : 'bg-diff-del-bg text-status-deleted',
      )}
    >
      {good ? <ShieldCheck size={13} /> : unknown ? <Shield size={13} /> : <ShieldAlert size={13} />}
      {label}
    </span>
  )
}

function nodeKind(row: LogRow, head: string): NodeKind {
  if (row.hash === head) return 'head'
  return row.parents.length > 1 ? 'merge' : 'commit'
}

const rowClass = 'absolute inset-x-0 flex h-row items-center gap-2 pr-3 pl-1'

function LogList({ showGraph }: { showGraph: boolean }) {
  const { root, repo, selected, setSelected, setView, loadMore, error, openMenu } = useApp()
  const remotes = useRemoteNames()
  const menus = useMenus()
  const { graph: cols } = useSettings()
  const [ci, setCi] = useState<Map<string, CiState>>(new Map())
  const [ciOff, setCiOff] = useState(false)
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page of rows arrived; allow asking for the next one
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

  // CI state for the rows on screen: one batched request after scrolling settles,
  // then again every 30s while any of them is still running.
  const visible = rows.slice(Math.max(0, first - offset), Math.max(0, last - offset)).map(r => r.hash)
  const visibleKey = visible.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the visible SHAs, not the array identity
  useEffect(() => {
    if (ciOff || !visible.length) return
    let live = true
    const ask = () =>
      commitStates(root, visible)
        .then(m => live && setCi(prev => new Map([...prev, ...m])))
        .catch(() => live && setCiOff(true))
    const soon = window.setTimeout(ask, 250)
    const again = window.setInterval(() => {
      if (visible.some(h => cachedCi(h) === 'pending')) void ask()
    }, 30_000)
    return () => {
      live = false
      window.clearTimeout(soon)
      window.clearInterval(again)
    }
  }, [root, visibleKey, ciOff])

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
  if (repo && !rows.length && !repo.work) return <Empty>{t(repo.head ? 'No commits match these filters.' : 'No commits yet.')}</Empty>

  // Absolute dates need room for the date and the time.
  const dateW = cols.dates === 'relative' ? 'w-21' : cols.dateFormat === 'locale' ? 'w-36' : 'w-33'
  const items = []
  for (let i = first; i < last; i++) {
    const top = i * ROW_H
    if (repo?.work && i === 0) {
      items.push(
        <div key="work" className={cx(rowClass, 'hover:bg-hover')} style={{ top }} onClick={() => setView('changes')}>
          {showGraph && <GraphCell g={repo.work} laneCount={repo.laneCount} kind="work" />}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 italic">
            <StageDot />
            <span className="font-medium text-secondary">{t(repo.changes.length === 1 ? '{n} uncommitted change' : '{n} uncommitted changes', { n: repo.changes.length })}</span>
            <span className="text-muted">· {t('open Changes')}</span>
          </div>
          <span className="text-sm text-faint">⌘2</span>
        </div>,
      )
      continue
    }
    const r = rows[i - offset]!
    const kind = nodeKind(r, repo!.head)
    const chips = refChips(r.refs, remotes).filter(c => cols.tags || c.kind !== 'tag')
    const on = r.hash === selected
    const message = r.body ? `${r.subject}\n\n${r.body}` : r.subject
    items.push(
      <div
        key={r.hash}
        className={cx(rowClass, on ? 'bg-selected group-focus:shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-hover')}
        style={{ top }}
        onClick={() => setSelected(r.hash)}
        onContextMenu={e => {
          setSelected(r.hash)
          openMenu(e, menus.commit(r))
        }}
      >
        {showGraph && <GraphCell g={r.graph} laneCount={repo!.laneCount} kind={kind} />}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {chips.map(c => (
            <Chip key={c.kind + c.name} kind={c.kind} name={c.name} synced={c.synced} />
          ))}
          <span className={cx('min-w-24 truncate', kind === 'head' && 'font-semibold', kind === 'merge' && 'text-secondary')} title={message}>
            {r.subject}
          </span>
          {r.body && (
            <span className="min-w-0 shrink-[4] truncate text-muted" title={message}>
              {r.body}
            </span>
          )}
        </div>
        {cols.author && (
          <div className="flex w-32.5 shrink-0 items-center gap-1.5 text-sm text-secondary">
            <Avatar name={r.author} />
            <span className="truncate" title={r.author}>
              {r.author}
            </span>
          </div>
        )}
        {cols.date && (
          <span className={cx('shrink-0 truncate text-sm whitespace-nowrap text-muted', dateW)} title={new Date(r.time * 1000).toLocaleString()}>
            {commitDate(r.time * 1000)}
          </span>
        )}
        {!ciOff && <CiIcon state={ci.get(r.hash)} />}
        {cols.sha && <span className="w-15.5 shrink-0 text-right font-mono text-sm font-medium text-link">{r.short}</span>}
      </div>,
    )
  }

  return (
    <>
      <div className={cx('flex h-6.5 shrink-0 items-center gap-2 border-b border-subtle pr-3 pl-4 tracking-[0.6px]', caps, 'font-semibold')}>
        {showGraph && <span style={{ width: gw - 12 }}>{t('GRAPH')}</span>}
        <span className="flex-1">{t('DESCRIPTION')}</span>
        {cols.author && <span className="w-32.5">{t('AUTHOR')}</span>}
        {cols.date && <span className={dateW}>{t('DATE')}</span>}
        {!ciOff && <span className="w-3.5" />}
        {cols.sha && <span className="w-15.5 text-right">{t('SHA')}</span>}
      </div>
      <div
        className="group relative flex-1 overflow-y-auto outline-none"
        ref={box}
        role="listbox"
        aria-label={t('Commits')}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault()
            move(1)
          }
          if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault()
            move(-1)
          }
          if (e.key === 'PageDown') {
            e.preventDefault()
            move(20)
          }
          if (e.key === 'PageUp') {
            e.preventDefault()
            move(-20)
          }
        }}
      >
        <div className="relative" style={{ height: total * ROW_H + (repo?.hasMore ? 40 : 0) }}>
          {items}
          {repo?.hasMore && (
            <div className="absolute inset-x-0 flex h-10 items-center justify-center text-sm text-muted" style={{ top: total * ROW_H }}>
              {t('Loading older commits…')}
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
    <button
      type="button"
      onClick={onClick}
      className={cx('-mb-px flex items-center gap-1.25 border-b-2 py-2', on ? 'border-primary font-semibold text-primary' : 'border-transparent font-medium text-muted')}
    >
      <Icon size={13} />
      {children}
    </button>
  )
}

function Inspector({ width }: { width: number }) {
  const { root, repo, selected, setSelected, act, prompt, ask, toast, openMenu } = useApp()
  const menus = useMenus()
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

  // The commit's signature, checked by git (slow enough to keep out of the list).
  const [sig, setSig] = useState<{ status: string; signer: string } | null>(null)
  useEffect(() => {
    setSig(null)
    if (!selected) return
    let live = true
    void run(root, ['log', '-1', '--format=%G?%x1f%GS', selected]).then(out => {
      const [status = 'N', signer = ''] = out.stdout.trim().split('\x1f')
      if (live) setSig({ status, signer })
    })
    return () => {
      live = false
    }
  }, [root, selected])

  const { diffWhitespace } = useSettings()
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the whitespace setting changes
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
  }, [root, selected, file, diffWhitespace])

  const shell = 'flex min-h-0 shrink-0 flex-col border-l border-subtle'
  if (!row || !detail || detail.hash !== row.hash)
    return (
      <aside className={shell} style={{ width }}>
        <Empty>{row ? t('Loading…') : t('Select a commit')}</Empty>
      </aside>
    )

  const [subject = '', ...rest] = detail.body.split('\n')
  const message = rest.join('\n').trim()
  const authorName = detail.author.replace(/ <.*>$/, '')
  const chips = refChips(row.refs, remotes)
  const fileRow = (f: CommitFile, nested = false) => {
    const { name, dir } = splitPath(f.path)
    return (
      <button
        key={f.path}
        type="button"
        className={cx(fileRowClass(file?.path === f.path), nested && 'pl-6.5')}
        onClick={() => setFile(f)}
        onContextMenu={e => openMenu(e, menus.file(row.hash, f.path))}
        title={f.orig ? `${f.orig} → ${f.path}` : f.path}
      >
        <StatusBadge letter={f.status} />
        <FilePath name={name} dir={nested ? undefined : dir} />
        <LineStats added={f.added} deleted={f.deleted} />
      </button>
    )
  }

  const newBranch = async () => {
    const name = await prompt({ title: t('New branch at {sha}', { sha: row.short }), placeholder: 'feature/name', confirm: t('Create and switch') })
    if (name) await act('Create branch', actions.createBranch(name.trim(), row.hash), { done: t('Switched to {name}', { name }) })
  }
  const newTag = async () => {
    const name = await prompt({ title: t('Tag {sha}', { sha: row.short }), placeholder: 'v1.0.0', confirm: t('Create tag') })
    if (name) await act('Tag', actions.tag(name.trim(), row.hash), { done: t('Tagged {name}', { name }) })
  }
  const checkout = async () => {
    const branch = chips.find(c => c.kind === 'local' || c.kind === 'head')
    if (branch) return void act('Checkout', actions.checkout(branch.name), { done: t('Switched to {name}', { name: branch.name }) })
    if (await ask({ title: t('Check out {sha}?', { sha: row.short }), text: t('This puts HEAD in a detached state. Create a branch to keep new work.'), confirm: t('Check out') }))
      await act('Checkout', actions.checkoutCommit(row.hash))
  }
  const revert = async () => {
    if (await ask({ title: t('Revert {sha}?', { sha: row.short }), text: t('Creates a new commit that undoes “{subject}”.', { subject }), confirm: t('Revert') }))
      await act('Revert', actions.revert(row.hash), { done: t('Reverted') })
  }

  return (
    <aside className={shell} style={{ width }}>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1.25 rounded-sm bg-surface px-1.5 py-0.5 font-mono text-sm font-medium text-link">
            <GitCommitHorizontal size={12} className="text-muted" />
            {row.short}
          </span>
          {sig && sig.status !== 'N' && <SignatureBadge status={sig.status} signer={sig.signer} />}
          <IconButton
            icon={Copy}
            size={13}
            small
            title={t('Copy full SHA')}
            onClick={() => {
              void navigator.clipboard.writeText(row.hash)
              toast({ kind: 'ok', title: t('SHA copied') })
            }}
          />
          <span className="min-w-4 flex-1" />
          <IconButton icon={LogIn} title={t('Check out')} onClick={() => void checkout()} />
          <IconButton icon={GitBranchPlus} title={t('New branch here')} onClick={() => void newBranch()} />
          <IconButton icon={Tag} title={t('Tag this commit')} onClick={() => void newTag()} />
          <IconButton
            icon={CherryIcon}
            title={t('Cherry-pick onto current branch')}
            disabled={row.hash === repo?.head}
            onClick={() => void act('Cherry-pick', actions.cherryPick(row.hash), { done: t('Cherry-picked') })}
          />
          <IconButton icon={Undo2} title={t('Revert')} onClick={() => void revert()} />
          <IconButton
            icon={compact ? ChevronsUpDown : ChevronsDownUp}
            title={compact ? t('Show commit details') : t('Collapse commit details')}
            onClick={() => {
              localStorage.setItem('inspector:compact', compact ? '0' : '1')
              setCompact(!compact)
            }}
          />
        </div>
        <div className={cx('leading-snug font-semibold select-text', compact ? 'truncate' : 'text-lg')} title={compact ? subject : undefined}>
          {subject}
        </div>
        {!compact && message && <div className="max-h-30 overflow-y-auto leading-normal whitespace-pre-wrap text-secondary select-text">{message}</div>}
        {!compact && (
          <>
            <div className="flex items-center gap-2.5">
              <Avatar name={authorName} size={28} />
              <div className="min-w-0">
                <div className="truncate font-semibold" title={authorName}>
                  {authorName}
                </div>
                <div
                  className="truncate text-sm text-muted"
                  title={`${detail.date}${detail.committer && detail.committer !== authorName ? t(' · committed by {committer}', { committer: detail.committer }) : ''}`}
                >
                  {detail.date}
                  {detail.committer && detail.committer !== authorName ? t(' · committed by {committer}', { committer: detail.committer }) : ''}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {chips.map(c => (
                <Chip key={c.kind + c.name} kind={c.kind} name={c.name} synced={c.synced} />
              ))}
              {detail.parents.length > 0 && <span>{detail.parents.length > 1 ? t('Parents') : t('Parent')}</span>}
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
          {t('Tree')}
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
        {!detail.files.length && <Empty>{t('No file changes')}</Empty>}
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
