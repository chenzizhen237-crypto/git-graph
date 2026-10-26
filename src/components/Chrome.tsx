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
  CirclePlay,
  CloudDownload,
  Cloud,
  CloudUpload,
  FileDiff,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitGraph,
  GitMerge,
  GitPullRequest,
  House,
  LayoutDashboard,
  LayoutGrid,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  SquareTerminal,
  Code2,
  Sun,
  Tag,
  TriangleAlert,
  X,
} from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import appIcon from '../../assets/icon/app-icon.svg'
import { cx } from '../lib/cx'
import { actions, findRoot, openTerminal } from '../lib/git'
import { openInEditor } from '../lib/tools'
import { t } from '../lib/i18n'
import { repoState, useOverview } from '../lib/overview'
import { isConflict } from '../lib/parse'
import { useMenus } from './menus'
import { type Settings, updateSettings, useSettings } from '../lib/settings'
import { forgetRepo, type Recent, readRecents, useApp } from '../state'
import { Button, Chip, caps, IconButton, Kbd, StageDot, ToolButton } from './ui'
import { UpdatePill } from './Update'

const Sep = () => <div className="h-6 w-px shrink-0 bg-strong" />

/** What the repository dropdown can do; the window owns which repository is open. */
export type RepoSwitch = {
  /** Opens a repository root in this window. */
  open: (root: string) => void
  openFolder: () => void
  clone: () => void
  /** Back to the Welcome screen. */
  all: () => void
}

export function TitleBar({ repos, sidebar, onToggleSidebar, onSettings }: { repos: RepoSwitch; sidebar: boolean; onToggleSidebar: () => void; onSettings: () => void }) {
  const app = useApp()
  const { repo, act, busy, prompt, setPaletteOpen } = app
  // Leaves room on the left for the native traffic lights.
  const bar = 'flex h-titlebar shrink-0 items-center gap-2.5 border-b border-subtle bg-titlebar pr-3.5 pl-22'
  if (!repo) return <div className={bar} data-tauri-drag-region />
  const conflicts = repo.changes.filter(isConflict).length
  const detached = repo.branch.startsWith('HEAD')
  const branchLabel = detached ? t('detached {slice}', { slice: repo.head.slice(0, 7) }) : repo.branch

  const newBranch = async () => {
    const name = await prompt({ title: t('New branch'), placeholder: 'feature/name', confirm: t('Create and switch') })
    if (name) await act('Create branch', actions.createBranch(name.trim()), { done: t('Switched to {name}', { name }) })
  }
  const merge = async () => {
    const name = await prompt({ title: t('Merge into {branch}', { branch: repo.branch }), placeholder: t('Branch to merge, e.g. main'), confirm: t('Merge') })
    if (name) await act('Merge', actions.merge(name.trim()), { done: t('Merged {name}', { name }) })
  }
  const stash = async () => {
    const msg = await prompt({ title: t('Stash changes'), placeholder: t('Message (optional)'), confirm: t('Stash'), optional: true })
    if (msg !== null) await act('Stash', actions.stash(msg.trim() || undefined), { done: t('Changes stashed') })
  }

  // The primary action follows the design's Stage axis.
  let primary: { label: string; icon: typeof Check; run: () => void; disabled?: boolean }
  if (app.stage === 'Rebasing') primary = { label: t('Continue'), icon: Check, run: () => void act('Continue rebase', actions.continue('rebase')), disabled: conflicts > 0 }
  else if (app.stage === 'Conflict') primary = { label: conflicts ? t('Resolve {n}', { n: conflicts }) : 'Commit merge', icon: Check, run: () => app.setView('changes') }
  else if (app.stage === 'Working') primary = { label: t('Commit {n}', { n: repo.changes.length }), icon: Check, run: () => app.setView('changes') }
  else if (repo.ahead) primary = { label: t('Push {n}', { n: repo.ahead }), icon: ArrowUp, run: () => void act('Push', actions.push(repo), { done: 'Pushed' }) }
  else if (repo.behind) primary = { label: t('Pull {n}', { n: repo.behind }), icon: ArrowDown, run: () => void act('Pull', actions.pull(), { done: 'Pulled' }) }
  else primary = { label: 'Fetch', icon: RefreshCcw, run: () => void act('Fetch', actions.fetch(), { done: 'Fetched' }) }

  return (
    <div className={bar} data-tauri-drag-region>
      <IconButton icon={sidebar ? PanelLeftClose : PanelLeftOpen} onClick={onToggleSidebar} title={t(sidebar ? 'Hide sidebar (⌘\\)' : 'Show sidebar (⌘\\)')} />
      <RepoPicker repos={repos} />
      <button type="button" className="flex max-w-55 min-w-24 shrink-[2]" onClick={() => setPaletteOpen(true)}>
        <Chip
          kind="head"
          name={branchLabel}
          large
          icon={GitBranch}
          synced={!!repo.upstream}
          className="max-w-full min-w-0 shrink"
          title={`${branchLabel}${repo.upstream ? ` ⇅ ${repo.upstream}` : ''}\n${t('Switch branch (⌘K)')}`}
        />
      </button>
      {/* Spacers keep the groups apart when the window is narrow: the repository, branch and search shrink first. */}
      <div className="min-w-6 flex-1 self-stretch" data-tauri-drag-region />
      <div className="flex shrink-0 items-center gap-0.5">
        <ToolButton icon={RefreshCcw} label={t('Fetch')} busy={busy === 'Fetch'} onClick={() => void act('Fetch', actions.fetch(), { done: t('Fetched') })} />
        <ToolButton icon={ArrowDown} label={t('Pull')} badge={repo.behind} busy={busy === 'Pull'} onClick={() => void act('Pull', actions.pull(), { done: t('Pulled') })} />
        <ToolButton icon={ArrowUp} label={t('Push')} badge={repo.ahead} busy={busy === 'Push'} onClick={() => void act('Push', actions.push(repo), { done: t('Pushed') })} />
      </div>
      <Sep />
      <div className="flex shrink-0 items-center gap-0.5">
        <ToolButton icon={GitBranch} label={t('Branch')} onClick={() => void newBranch()} />
        <ToolButton icon={GitMerge} label={t('Merge')} onClick={() => void merge()} />
        <ToolButton icon={Archive} label={t('Stash')} disabled={!repo.changes.length} busy={busy === 'Stash'} onClick={() => void stash()} />
        <ToolButton
          icon={ArchiveRestore}
          label={t('Pop')}
          disabled={!repo.stashes.length}
          busy={busy === 'Pop'}
          onClick={() => void act('Pop', actions.stashPop(), { done: t('Stash applied') })}
        />
      </div>
      <Sep />
      <ToolButton icon={SquareTerminal} label={t('Terminal')} onClick={() => void openTerminal(repo.root)} />
      <ToolButton
        icon={Code2}
        label={t('Editor')}
        onClick={() => void openInEditor(repo.root).catch(e => app.toast({ kind: 'error', title: t('Open in editor failed'), detail: String(e) }))}
      />
      <div className="min-w-6 flex-1 self-stretch" data-tauri-drag-region />
      <UpdatePill />
      <IconButton icon={SettingsIcon} onClick={onSettings} title={t('Settings (⌘,)')} />
      <button
        type="button"
        className="flex h-7 w-60 min-w-32 items-center gap-1.5 rounded-md bg-surface pr-1.5 pl-2 text-muted"
        onClick={() => setPaletteOpen(true)}
        title={`${t('Search commits, branches')} (⌘K)`}
      >
        <Search size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left text-faint">{t('Search commits, branches')}</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Button kind="primary" className="shrink-0" icon={primary.icon} onClick={primary.run} disabled={primary.disabled || !!busy}>
        {primary.label}
      </Button>
    </div>
  )
}

const home = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

/** The title bar's repo picker; it opens Menu/Repositories underneath. */
function RepoPicker({ repos }: { repos: RepoSwitch }) {
  const { repo } = useApp()
  const button = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  if (!repo) return null
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        className={cx('flex max-w-60 min-w-28 items-center gap-1.75 rounded-md px-2 py-1 text-left hover:bg-hover', anchor && 'bg-hover')}
        onClick={() => setAnchor(button.current?.getBoundingClientRect() ?? null)}
        title={`${repo.name}\n${repo.root}\n${t('Switch repository')}`}
      >
        <img className="size-5.5 shrink-0 rounded-[5.5px]" src={appIcon} alt="" />
        {/* Long names and worktree paths cut off with an ellipsis instead of wrapping out of the bar. */}
        <div className="min-w-0">
          <div className="truncate leading-tight font-bold">{repo.name}</div>
          <div className="truncate text-[10px] text-muted">{home(repo.root)}</div>
        </div>
        <ChevronsUpDown size={13} className="shrink-0 text-muted" />
      </button>
      {anchor && <RepoMenu anchor={anchor} repos={repos} onClose={() => setAnchor(null)} />}
    </>
  )
}

type RepoEntry = { kind: 'repo'; recent: Recent } | { kind: 'action'; icon: typeof Check; label: string; kbd?: string; run: () => void }

/** Menu/Repositories: the current and recent repositories, a filter, then open, clone and all. */
function RepoMenu({ anchor, repos, onClose }: { anchor: DOMRect; repos: RepoSwitch; onClose: () => void }) {
  const { repo, toast } = useApp()
  const [filter, setFilter] = useState('')
  const [at, setAt] = useState(0)

  const entries = useMemo<RepoEntry[]>(() => {
    if (!repo) return []
    const q = filter.trim().toLowerCase()
    const current: Recent = { path: repo.root, branch: repo.branch.startsWith('HEAD') ? undefined : repo.branch, at: Date.now() }
    const recents = [current, ...readRecents().filter(r => r.path !== repo.root)]
      .filter(r => !q || r.path.toLowerCase().includes(q))
      .slice(0, 8)
      .map(recent => ({ kind: 'repo' as const, recent }))
    const action = (icon: typeof Check, label: string, run: () => void, kbd?: string): RepoEntry => ({ kind: 'action', icon, label, kbd, run })
    return [
      ...recents,
      action(FolderOpen, t('Open repository…'), repos.openFolder, '⌘O'),
      action(CloudDownload, t('Clone from GitHub…'), repos.clone),
      action(LayoutGrid, t('All repositories'), repos.all, '⇧⌘O'),
    ]
  }, [repo, filter, repos])
  const shown = entries.filter(e => e.kind === 'repo').length

  useEffect(() => {
    window.addEventListener('blur', onClose)
    return () => window.removeEventListener('blur', onClose)
  }, [onClose])

  const pick = async (path: string) => {
    if (path === repo?.root) return
    const root = await findRoot(path).catch(() => null)
    if (root) return repos.open(root)
    forgetRepo(path)
    toast({ kind: 'error', title: t('{path} is no longer a Git repository.', { path: home(path) }) })
  }
  const run = (e: RepoEntry | undefined) => {
    if (!e) return
    onClose()
    if (e.kind === 'repo') void pick(e.recent.path)
    else e.run()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') setAt(i => (i + 1) % entries.length)
    else if (e.key === 'ArrowUp') setAt(i => (i - 1 + entries.length) % entries.length)
    else if (e.key === 'Enter') run(entries[at])
    else return
    e.preventDefault()
  }

  return (
    <div className="fixed inset-0 z-[65]" onMouseDown={onClose}>
      <div
        role="menu"
        className="absolute flex w-85 flex-col gap-px rounded-lg border border-strong bg-elevated p-1.25 shadow-[0_12px_32px_var(--shadow)]"
        style={{ left: anchor.left, top: anchor.bottom + 4 }}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-surface px-2 text-muted focus-within:ring-1 focus-within:ring-focus">
          <Search size={13} />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-faint"
            placeholder={t('Filter repositories')}
            value={filter}
            onChange={e => {
              setFilter(e.target.value)
              setAt(0)
            }}
          />
        </div>
        <div className={cx(caps, 'px-2 pt-2 pb-1')}>{t('RECENT')}</div>
        {!shown && <div className="px-2 py-2.5 text-muted">{t('No recent repository matches.')}</div>}
        {entries.map((e, i) =>
          e.kind === 'repo' ? (
            <button
              key={e.recent.path}
              type="button"
              role="menuitem"
              className={cx('flex h-10 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-left', e.recent.path === repo?.root ? 'bg-selected' : i === at && 'bg-hover')}
              onMouseEnter={() => setAt(i)}
              onClick={() => run(e)}
              title={e.recent.branch ? `${e.recent.path}\n${e.recent.branch}` : e.recent.path}
            >
              <span className={cx('flex size-6.5 shrink-0 items-center justify-center rounded-md text-secondary', e.recent.path === repo?.root ? 'bg-elevated' : 'bg-surface')}>
                <FolderGit2 size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.recent.path.split('/').pop()}</span>
                <span className="block truncate text-xs text-muted">{home(e.recent.path)}</span>
              </span>
              {e.recent.branch && <Chip kind="local" name={e.recent.branch} className="max-w-36!" />}
              <Check size={14} className={cx('shrink-0 text-accent', e.recent.path !== repo?.root && 'invisible')} />
            </button>
          ) : (
            <div key={e.label} className="contents">
              {i === shown && <div className="my-1 h-px shrink-0 bg-subtle" />}
              <button
                type="button"
                role="menuitem"
                className={cx('flex h-7 w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left', i === at && 'bg-selected')}
                onMouseEnter={() => setAt(i)}
                onClick={() => run(e)}
              >
                <e.icon size={15} className="text-secondary" />
                <span className="flex-1">{e.label}</span>
                {e.kbd && <Kbd>{e.kbd}</Kbd>}
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

export function Banner() {
  const { repo, act, ask } = useApp()
  if (!repo?.operation) return null
  const op = repo.operation
  const conflicts = repo.changes.filter(isConflict).length
  const need = conflicts ? ` — ${t(conflicts === 1 ? '{n} file needs resolving' : '{n} files need resolving', { n: conflicts })}` : ''
  const text = `${repo.operationTitle ?? t(op)}${need}`
  const abort = async () => {
    if (
      await ask({
        title: t('Abort {op}?', { op: t(op) }),
        text: t('Your work tree goes back to how it was before it started.'),
        confirm: t('Abort {op}', { op: t(op) }),
        danger: true,
      })
    )
      await act(t('Abort {op}', { op: t(op) }), actions.abort(op), { done: t('{op} aborted', { op: t(op) }) })
  }
  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-subtle bg-stage-banner-bg px-4 font-medium text-stage-banner-fg">
      <TriangleAlert size={15} />
      <span className="flex-1 truncate" title={text}>
        {text}
      </span>
      <Button small icon={X} onClick={() => void abort()}>
        Abort {op}
      </Button>
      <Button small kind="primary" icon={Check} disabled={conflicts > 0} onClick={() => void act(t('Continue {op}', { op: t(op) }), actions.continue(op))}>
        {t('Continue')}
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

function Item({
  icon: Icon,
  color,
  label,
  meta,
  metaColor,
  selected,
  strong,
  indent,
  title,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
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
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      className={cx('flex h-6.5 w-full items-center gap-1.75 rounded-md pr-2 text-left', indent ? 'pl-6.5' : 'pl-2.5', selected ? 'bg-selected' : 'hover:bg-hover')}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
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
  const { repo, view, setView, query, setQuery, act, prompt, openMenu, setPublishOpen } = useApp()
  const menus = useMenus()
  // Known once the CI/CD view has loaded; it keeps polling only while open.
  const { repos: ci } = useOverview()
  const failing = ci?.filter(r => repoState(r) === 'fail').length ?? 0
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
  const checkout = (name: string) => void act('Checkout', actions.checkout(name), { done: t('Switched to {name}', { name }) })
  const newBranch = async () => {
    const name = await prompt({ title: t('New branch'), placeholder: 'feature/name', confirm: t('Create and switch') })
    if (name) await act('Create branch', actions.createBranch(name.trim()), { done: t('Switched to {name}', { name }) })
  }
  const toggleRemote = (remote: string) =>
    setOpenRemotes(s => {
      const next = new Set(s)
      if (!next.delete(remote)) next.add(remote)
      return next
    })

  return (
    <nav className={shell} style={{ width }}>
      <Section label={t('WORKSPACE')}>
        <Item
          icon={FileDiff}
          color="var(--status-modified)"
          label={t('Changes')}
          meta={repo.changes.length}
          selected={view === 'changes'}
          onClick={() => setView('changes')}
          title={t('Changes (⌘2)')}
        />
        <Item icon={GitGraph} color="var(--ref-head)" label={t('History')} selected={view === 'history'} onClick={() => setView('history')} title={t('History (⌘1)')} />
        <Item
          icon={Archive}
          color="var(--text-muted)"
          label={t('Stashes')}
          meta={repo.stashes.length || ''}
          selected={view === 'stashes'}
          onClick={() => setView('stashes')}
          title={t('Stashes (⌘3)')}
        />
        <Item
          icon={GitPullRequest}
          color="var(--status-added)"
          label={t('Pull requests')}
          selected={view === 'pulls'}
          onClick={() => setView('pulls')}
          title={t('Pull requests (⌘4)')}
        />
        <Item icon={CirclePlay} color="var(--status-renamed)" label={t('Actions')} selected={view === 'actions'} onClick={() => setView('actions')} title={t('Actions (⌘5)')} />
        <Item
          icon={LayoutDashboard}
          color="var(--status-renamed)"
          label={t('CI/CD')}
          meta={failing || ''}
          metaColor="var(--status-deleted)"
          selected={view === 'overview'}
          onClick={() => setView('overview')}
          title={t('CI/CD (⌘6)')}
        />
      </Section>
      <Section label={t('BRANCHES')} onAdd={() => void newBranch()}>
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
              title={t('{name} — click to show its history, double-click to check out', { name: b.name })}
              onClick={() => scopeTo(b.name)}
              onDoubleClick={() => !b.isHead && checkout(b.name)}
              onContextMenu={e => openMenu(e, menus.branch(b))}
            />
          )
        })}
      </Section>
      {remotes.size === 0 && (
        <Section label={t('REMOTES')}>
          <Item icon={CloudUpload} color="var(--text-secondary)" label={t('Publish to GitHub…')} onClick={() => setPublishOpen(true)} />
        </Section>
      )}
      {remotes.size > 0 && (
        <Section label={t('REMOTES')}>
          {[...remotes].map(([remote, names]) => (
            <div key={remote}>
              <Item
                icon={openRemotes.has(remote) ? ChevronDown : ChevronRight}
                color="var(--text-muted)"
                label={remote}
                strong
                meta={names.length}
                onClick={() => toggleRemote(remote)}
              />
              {openRemotes.has(remote) &&
                names.map(n => (
                  <Item
                    key={n}
                    icon={Cloud}
                    color="var(--ref-remote)"
                    label={n}
                    indent
                    selected={view === 'history' && query.branch === `${remote}/${n}`}
                    title={t('{remote}/{n} — click to show its history, double-click to check out a tracking branch', { remote, n })}
                    onClick={() => scopeTo(`${remote}/${n}`)}
                    onDoubleClick={() => void act('Checkout', actions.checkoutRemote(`${remote}/${n}`), { done: t('Tracking {remote}/{n}', { remote, n }) })}
                    onContextMenu={e => {
                      const ref = repo.refs.find(r => r.kind === 'remote' && r.name === `${remote}/${n}`)
                      if (ref) openMenu(e, menus.branch(ref))
                    }}
                  />
                ))}
            </div>
          ))}
        </Section>
      )}
      {tags.length > 0 && (
        <Section label={t('TAGS')} defaultOpen={tags.length <= 12}>
          {tags.map(tag => (
            <Item
              key={tag.name}
              icon={Tag}
              color="var(--ref-tag-text)"
              label={tag.name}
              meta={tag.date.replace(/ ago$/, '')}
              selected={query.branch === `refs/tags/${tag.name}`}
              onClick={() => scopeTo(`refs/tags/${tag.name}`)}
              onContextMenu={e => openMenu(e, menus.tag(tag.name))}
            />
          ))}
        </Section>
      )}
      {repo.worktrees.length > 1 && (
        <Section label={t('WORKTREES')}>
          {repo.worktrees.map(w => (
            <Item key={w.path} icon={FolderGit2} color="var(--text-muted)" label={w.path.split('/').pop() ?? w.path} meta={w.branch} strong={w.path === repo.root} title={w.path} />
          ))}
        </Section>
      )}
    </nav>
  )
}

type ThemePref = Settings['theme']
const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon }

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return t('{s} min ago', { s: Math.round(s / 60) })
  return t('{s} h ago', { s: Math.round(s / 3600) })
}

export function StatusBar() {
  const { repo, stage, lastFetch, refresh } = useApp()
  const { theme } = useSettings()
  const shell = 'flex h-statusbar shrink-0 items-center gap-3.5 border-t border-subtle bg-titlebar px-3 text-sm text-muted'
  if (!repo) return <footer className={shell} />
  const conflicts = repo.changes.filter(isConflict).length
  const label =
    stage === 'Rebasing'
      ? t('Rebasing {step}', { step: repo.operationStep ?? '' }).trim()
      : stage === 'Conflict'
        ? conflicts
          ? t(conflicts === 1 ? '{n} conflict' : '{n} conflicts', { n: conflicts })
          : t('{operation} in progress', { operation: t(repo.operation ?? '') })
        : stage === 'Working'
          ? t(repo.changes.length === 1 ? '{n} uncommitted change' : '{n} uncommitted changes', { n: repo.changes.length })
          : t('Up to date')
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
      <span className="min-w-4 flex-1" />
      <button type="button" className="hover:text-primary" onClick={() => void refresh()} title={t('Refresh (⌘R)')}>
        {repo.totalCommits.toLocaleString()} commits · {repo.refs.length} refs
      </button>
      <button
        type="button"
        className="flex items-center gap-1.25 hover:text-primary"
        title={t('Appearance: {theme}', { theme })}
        onClick={() => updateSettings({ theme: THEME_NEXT[theme] })}
      >
        <ThemeIcon size={12} />
        {theme[0]!.toUpperCase() + theme.slice(1)}
      </button>
    </footer>
  )
}
