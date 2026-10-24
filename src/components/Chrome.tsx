/** Window/Title bar, Banner/Operation, Window/Sidebar and Window/Status bar. */
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Cloud,
  FileDiff,
  FolderGit2,
  GitBranch,
  GitGraph,
  GitMerge,
  GitPullRequest,
  House,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Plus,
  RefreshCcw,
  Search,
  SquareTerminal,
  Sun,
  Tag,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import appIcon from '../../assets/icon/app-icon.svg'
import { cx } from '../lib/cx'
import { actions, openTerminal } from '../lib/git'
import { isConflict } from '../lib/parse'
import { applyTheme, readTheme, useApp, type ThemePref } from '../state'
import { Button, caps, Chip, IconButton, Kbd, StageDot, ToolButton } from './ui'

const Sep = () => <div className="h-6 w-px bg-strong" />

export function TitleBar({ onSwitchRepo, sidebar, onToggleSidebar }: { onSwitchRepo: () => void; sidebar: boolean; onToggleSidebar: () => void }) {
  const app = useApp()
  const { repo, act, busy, prompt, setPaletteOpen } = app
  // Leaves room on the left for the native traffic lights.
  const bar = 'flex h-titlebar shrink-0 items-center gap-2.5 border-b border-subtle bg-titlebar pr-3.5 pl-22'
  if (!repo) return <div className={bar} data-tauri-drag-region />
  const conflicts = repo.changes.filter(isConflict).length
  const detached = repo.branch.startsWith('HEAD')

  const newBranch = async () => {
    const name = await prompt({ title: 'New branch', placeholder: 'feature/name', confirm: 'Create and switch' })
    if (name) await act('Create branch', actions.createBranch(name.trim()), { done: `Switched to ${name}` })
  }
  const merge = async () => {
    const name = await prompt({ title: `Merge into ${repo.branch}`, placeholder: 'Branch to merge, e.g. main', confirm: 'Merge' })
    if (name) await act('Merge', actions.merge(name.trim()), { done: `Merged ${name}` })
  }
  const stash = async () => {
    const msg = await prompt({ title: 'Stash changes', placeholder: 'Message (optional)', confirm: 'Stash', optional: true })
    if (msg !== null) await act('Stash', actions.stash(msg.trim() || undefined), { done: 'Changes stashed' })
  }

  // The primary action follows the design's Stage axis.
  let primary: { label: string; icon: typeof Check; run: () => void; disabled?: boolean }
  if (app.stage === 'Rebasing')
    primary = { label: 'Continue', icon: Check, run: () => void act('Continue rebase', actions.continue('rebase')), disabled: conflicts > 0 }
  else if (app.stage === 'Conflict') primary = { label: conflicts ? `Resolve ${conflicts}` : 'Commit merge', icon: Check, run: () => app.setView('changes') }
  else if (app.stage === 'Working') primary = { label: `Commit ${repo.changes.length}`, icon: Check, run: () => app.setView('changes') }
  else if (repo.ahead) primary = { label: `Push ${repo.ahead}`, icon: ArrowUp, run: () => void act('Push', actions.push(repo), { done: 'Pushed' }) }
  else if (repo.behind) primary = { label: `Pull ${repo.behind}`, icon: ArrowDown, run: () => void act('Pull', actions.pull(), { done: 'Pulled' }) }
  else primary = { label: 'Fetch', icon: RefreshCcw, run: () => void act('Fetch', actions.fetch(), { done: 'Fetched' }) }

  return (
    <div className={bar} data-tauri-drag-region>
      <IconButton icon={sidebar ? PanelLeftClose : PanelLeftOpen} onClick={onToggleSidebar} title={`${sidebar ? 'Hide' : 'Show'} sidebar (⌘\\)`} />
      <button type="button" className="flex items-center gap-1.75 rounded-md px-2 py-1 text-left hover:bg-hover" onClick={onSwitchRepo} title="Switch repository">
        <img className="size-5.5 rounded-[5.5px]" src={appIcon} alt="" />
        <div>
          <div className="leading-tight font-bold">{repo.name}</div>
          <div className="text-[10px] text-muted">{repo.root.replace(/^\/Users\/[^/]+/, '~')}</div>
        </div>
        <ChevronsUpDown size={13} className="text-muted" />
      </button>
      <button type="button" onClick={() => setPaletteOpen(true)} title="Switch branch (⌘K)">
        <Chip kind="head" name={detached ? `detached ${repo.head.slice(0, 7)}` : repo.branch} large icon={GitBranch} synced={!!repo.upstream} />
      </button>
      <div className="flex-1 self-stretch" data-tauri-drag-region />
      <div className="flex items-center gap-0.5">
        <ToolButton icon={RefreshCcw} label="Fetch" busy={busy === 'Fetch'} onClick={() => void act('Fetch', actions.fetch(), { done: 'Fetched' })} />
        <ToolButton icon={ArrowDown} label="Pull" badge={repo.behind} busy={busy === 'Pull'} onClick={() => void act('Pull', actions.pull(), { done: 'Pulled' })} />
        <ToolButton icon={ArrowUp} label="Push" badge={repo.ahead} busy={busy === 'Push'} onClick={() => void act('Push', actions.push(repo), { done: 'Pushed' })} />
      </div>
      <Sep />
      <div className="flex items-center gap-0.5">
        <ToolButton icon={GitBranch} label="Branch" onClick={() => void newBranch()} />
        <ToolButton icon={GitMerge} label="Merge" onClick={() => void merge()} />
        <ToolButton icon={Archive} label="Stash" disabled={!repo.changes.length} busy={busy === 'Stash'} onClick={() => void stash()} />
        <ToolButton icon={ArchiveRestore} label="Pop" disabled={!repo.stashes.length} busy={busy === 'Pop'} onClick={() => void act('Pop', actions.stashPop(), { done: 'Stash applied' })} />
      </div>
      <Sep />
      <ToolButton icon={SquareTerminal} label="Terminal" onClick={() => void openTerminal(repo.root)} />
      <div className="flex-1 self-stretch" data-tauri-drag-region />
      <button type="button" className="flex h-7 w-60 items-center gap-1.5 rounded-md bg-surface pr-1.5 pl-2 text-muted" onClick={() => setPaletteOpen(true)}>
        <Search size={13} />
        <span className="flex-1 text-left text-faint">Search commits, branches</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Button kind="primary" icon={primary.icon} onClick={primary.run} disabled={primary.disabled || !!busy}>
        {primary.label}
      </Button>
    </div>
  )
}

export function Banner() {
  const { repo, act, ask } = useApp()
  if (!repo?.operation) return null
  const op = repo.operation
  const conflicts = repo.changes.filter(isConflict).length
  const text = `${repo.operationTitle ?? op}${conflicts ? ` — ${conflicts} file${conflicts > 1 ? 's' : ''} need${conflicts > 1 ? '' : 's'} resolving` : ''}`
  const abort = async () => {
    if (await ask({ title: `Abort ${op}?`, text: 'Your work tree goes back to how it was before it started.', confirm: `Abort ${op}`, danger: true }))
      await act(`Abort ${op}`, actions.abort(op), { done: `${op} aborted` })
  }
  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-subtle bg-stage-banner-bg px-4 font-medium text-stage-banner-fg">
      <TriangleAlert size={15} />
      <span className="flex-1 truncate">{text}</span>
      <Button small icon={X} onClick={() => void abort()}>
        Abort {op}
      </Button>
      <Button small kind="primary" icon={Check} disabled={conflicts > 0} onClick={() => void act(`Continue ${op}`, actions.continue(op))}>
        Continue
      </Button>
    </div>
  )
}

function Section({ label, children, onAdd, defaultOpen = true }: { label: string; children: ReactNode; onAdd?: () => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <div className={cx('mt-2 flex h-6.5 items-center gap-1 pr-2 pl-2.5 first:mt-0', caps)}>
        <span className="flex-1">{label}</span>
        {onAdd && <IconButton icon={Plus} size={13} className="size-4.5! text-muted" onClick={onAdd} title={`New ${label.toLowerCase().replace(/s$/, '')}`} />}
        <IconButton icon={open ? ChevronDown : ChevronRight} size={13} className="size-4.5! text-muted" onClick={() => setOpen(!open)} />
      </div>
      {open && children}
    </>
  )
}

function Item({ icon: Icon, color, label, meta, metaColor, selected, strong, indent, title, onClick, onDoubleClick }: {
  icon: typeof GitBranch
  color: string
  label: string
  meta?: ReactNode
  metaColor?: string
  selected?: boolean
  strong?: boolean
  indent?: boolean
  title?: string
  onClick?: () => void
  onDoubleClick?: () => void
}) {
  return (
    <button
      type="button"
      className={cx('flex h-6.5 w-full items-center gap-1.75 rounded-md pr-2 text-left', indent ? 'pl-6.5' : 'pl-2.5', selected ? 'bg-selected' : 'hover:bg-hover')}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={title ?? label}
    >
      <Icon size={14} color={color} className="shrink-0" />
      <span className={cx('flex-1 truncate', (selected || strong) && 'font-semibold')}>{label}</span>
      {meta !== undefined && meta !== '' && (
        <span className="shrink-0 text-sm font-medium text-muted" style={metaColor ? { color: metaColor } : undefined}>
          {meta}
        </span>
      )}
    </button>
  )
}

const trackMeta = (track?: string) => ({
  ahead: /ahead (\d+)/.exec(track ?? '')?.[1],
  behind: /behind (\d+)/.exec(track ?? '')?.[1],
})

export function Sidebar({ width }: { width: number }) {
  const { repo, view, setView, query, setQuery, act, prompt } = useApp()
  const remotes = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const r of repo?.refs ?? []) {
      if (r.kind !== 'remote') continue
      const [remote = '', ...rest] = r.name.split('/')
      groups.set(remote, [...(groups.get(remote) ?? []), rest.join('/')])
    }
    return groups
  }, [repo?.refs])
  const [openRemotes, setOpenRemotes] = useState<Set<string>>(new Set(['origin']))
  const shell = 'flex shrink-0 flex-col gap-px overflow-y-auto border-r border-subtle bg-sidebar px-2 py-2.5'
  if (!repo) return <nav className={shell} style={{ width }} />
  const locals = repo.refs.filter(r => r.kind === 'local').sort((a, b) => Number(b.isHead) - Number(a.isHead))
  const tags = repo.refs.filter(r => r.kind === 'tag')
  const scopeTo = (branch: string) => {
    setView('history')
    setQuery({ branch })
  }
  const checkout = (name: string) => void act('Checkout', actions.checkout(name), { done: `Switched to ${name}` })
  const newBranch = async () => {
    const name = await prompt({ title: 'New branch', placeholder: 'feature/name', confirm: 'Create and switch' })
    if (name) await act('Create branch', actions.createBranch(name.trim()), { done: `Switched to ${name}` })
  }
  const toggleRemote = (remote: string) =>
    setOpenRemotes(s => {
      const next = new Set(s)
      if (!next.delete(remote)) next.add(remote)
      return next
    })

  return (
    <nav className={shell} style={{ width }}>
      <Section label="WORKSPACE">
        <Item icon={FileDiff} color="var(--status-modified)" label="Changes" meta={repo.changes.length} selected={view === 'changes'} onClick={() => setView('changes')} title="Changes (⌘2)" />
        <Item icon={GitGraph} color="var(--ref-head)" label="History" selected={view === 'history'} onClick={() => setView('history')} title="History (⌘1)" />
        <Item icon={Archive} color="var(--text-muted)" label="Stashes" meta={repo.stashes.length || ''} selected={view === 'stashes'} onClick={() => setView('stashes')} title="Stashes (⌘3)" />
        <Item icon={GitPullRequest} color="var(--status-added)" label="Pull requests" selected={view === 'pulls'} onClick={() => setView('pulls')} title="Pull requests (⌘4)" />
      </Section>
      <Section label="BRANCHES" onAdd={() => void newBranch()}>
        {locals.map(b => {
          const { ahead, behind } = trackMeta(b.track)
          return (
            <Item
              key={b.name}
              icon={b.isHead ? House : GitBranch}
              color={b.isHead ? 'var(--ref-head)' : 'var(--ref-local)'}
              label={b.name}
              strong={b.isHead}
              selected={view === 'history' && query.branch === b.name}
              meta={ahead ? `↑${ahead}` : behind ? `↓${behind}` : ''}
              metaColor={ahead ? 'var(--ref-head)' : behind ? 'var(--status-deleted)' : undefined}
              title={`${b.name} — click to show its history, double-click to check out`}
              onClick={() => scopeTo(b.name)}
              onDoubleClick={() => !b.isHead && checkout(b.name)}
            />
          )
        })}
      </Section>
      {remotes.size > 0 && (
        <Section label="REMOTES">
          {[...remotes].map(([remote, names]) => (
            <div key={remote}>
              <Item icon={openRemotes.has(remote) ? ChevronDown : ChevronRight} color="var(--text-muted)" label={remote} strong meta={names.length} onClick={() => toggleRemote(remote)} />
              {openRemotes.has(remote) &&
                names.map(n => (
                  <Item
                    key={n}
                    icon={Cloud}
                    color="var(--ref-remote)"
                    label={n}
                    indent
                    selected={view === 'history' && query.branch === `${remote}/${n}`}
                    title={`${remote}/${n} — click to show its history, double-click to check out a tracking branch`}
                    onClick={() => scopeTo(`${remote}/${n}`)}
                    onDoubleClick={() => void act('Checkout', actions.checkoutRemote(`${remote}/${n}`), { done: `Tracking ${remote}/${n}` })}
                  />
                ))}
            </div>
          ))}
        </Section>
      )}
      {tags.length > 0 && (
        <Section label="TAGS" defaultOpen={tags.length <= 12}>
          {tags.map(t => (
            <Item key={t.name} icon={Tag} color="var(--ref-tag-text)" label={t.name} meta={t.date.replace(/ ago$/, '')} selected={query.branch === `refs/tags/${t.name}`} onClick={() => scopeTo(`refs/tags/${t.name}`)} />
          ))}
        </Section>
      )}
      {repo.worktrees.length > 1 && (
        <Section label="WORKTREES">
          {repo.worktrees.map(w => (
            <Item key={w.path} icon={FolderGit2} color="var(--text-muted)" label={w.path.split('/').pop() ?? w.path} meta={w.branch} strong={w.path === repo.root} title={w.path} />
          ))}
        </Section>
      )}
    </nav>
  )
}

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon }

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}

export function StatusBar() {
  const { repo, stage, lastFetch, refresh } = useApp()
  const [theme, setTheme] = useState<ThemePref>(readTheme)
  const shell = 'flex h-statusbar shrink-0 items-center gap-3.5 border-t border-subtle bg-titlebar px-3 text-sm text-muted'
  if (!repo) return <footer className={shell} />
  const conflicts = repo.changes.filter(isConflict).length
  const label =
    stage === 'Rebasing'
      ? `Rebasing${repo.operationStep ? ` ${repo.operationStep}` : ''}`
      : stage === 'Conflict'
        ? conflicts
          ? `${conflicts} conflict${conflicts > 1 ? 's' : ''}`
          : `${repo.operation} in progress`
        : stage === 'Working'
          ? `${repo.changes.length} uncommitted change${repo.changes.length > 1 ? 's' : ''}`
          : 'Up to date'
  const ThemeIcon = THEME_ICON[theme]
  return (
    <footer className={shell}>
      <span className="flex items-center gap-1.5 font-medium text-secondary">
        <StageDot />
        {label}
      </span>
      <span className="flex items-center gap-1.25">
        <GitBranch size={12} />
        <span className="font-medium text-secondary">{repo.branch}</span>
        {repo.upstream && <span>→ {repo.upstream}</span>}
      </span>
      {repo.upstream && (
        <span className="flex items-center gap-1">
          <ArrowUp size={12} />
          {repo.ahead}
          <ArrowDown size={12} />
          {repo.behind}
        </span>
      )}
      {lastFetch && <span>Fetched {ago(lastFetch)}</span>}
      <span className="flex-1" />
      <button type="button" className="hover:text-primary" onClick={() => void refresh()} title="Refresh (⌘R)">
        {repo.totalCommits.toLocaleString()} commits · {repo.refs.length} refs
      </button>
      <button
        type="button"
        className="flex items-center gap-1.25 hover:text-primary"
        title={`Appearance: ${theme}`}
        onClick={() => {
          const next = THEME_NEXT[theme]
          applyTheme(next)
          setTheme(next)
        }}
      >
        <ThemeIcon size={12} />
        {theme[0]!.toUpperCase() + theme.slice(1)}
      </button>
    </footer>
  )
}
