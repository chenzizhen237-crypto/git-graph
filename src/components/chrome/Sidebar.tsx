/** Window/Sidebar: workspace navigation, branches, remotes, tags and worktrees. */
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CirclePlay,
  Cloud,
  CloudUpload,
  FileDiff,
  FolderGit2,
  GitBranch,
  GitGraph,
  GitPullRequest,
  House,
  LayoutDashboard,
  Plus,
  Tag,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'

import { useSidebarCounts } from '../../lib/counts'
import { cx } from '../../lib/cx'
import { actions } from '../../lib/git'
import { t } from '../../lib/i18n'
import { repoState, useOverview } from '../../lib/overview'
import { useApp } from '../../state'
import { useMenus } from '../menus'
import { caps, IconButton } from '../ui'

function Section({ label, count, children, onAdd, defaultOpen = true }: { label: string; count?: number; children: ReactNode; onAdd?: () => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <div className={cx('mt-2 flex h-6.5 shrink-0 items-center gap-1 pr-2 pl-2.5 first:mt-0', caps)}>
        <span>{label}</span>
        <span className="flex-1 pl-0.5 text-sm font-medium tracking-normal">{count}</span>
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
      // shrink-0: the sidebar scrolls, so rows must not squeeze when it overflows.
      className={cx('flex h-6.5 w-full shrink-0 items-center gap-1.75 rounded-md pr-2 text-left', indent ? 'pl-6.5' : 'pl-2.5', selected ? 'bg-selected' : 'hover:bg-hover')}
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
  const { root, repo, view, setView, query, setQuery, act, prompt, openMenu, setPublishOpen } = useApp()
  const menus = useMenus()
  const counts = useSidebarCounts(root, repo?.branch, view)
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
          meta={repo.stashes.length}
          selected={view === 'stashes'}
          onClick={() => setView('stashes')}
          title={t('Stashes (⌘3)')}
        />
        <Item
          icon={GitPullRequest}
          color="var(--status-added)"
          label={t('Pull requests')}
          meta={counts.pulls}
          selected={view === 'pulls'}
          onClick={() => setView('pulls')}
          title={t('Pull requests (⌘4)')}
        />
        <Item
          icon={CirclePlay}
          color="var(--status-renamed)"
          label={t('Actions')}
          meta={counts.failing || ''}
          metaColor="var(--status-deleted)"
          selected={view === 'actions'}
          onClick={() => setView('actions')}
          title={t('Actions (⌘5)')}
        />
        <Item
          icon={CircleDot}
          color="var(--status-added)"
          label={t('Issues')}
          meta={counts.issues}
          selected={view === 'issues'}
          onClick={() => setView('issues')}
          title={t('Issues (⌘7)')}
        />
        <Item
          icon={Bot}
          color="var(--accent)"
          label={t('Agents')}
          meta={repo.worktrees.length}
          selected={view === 'agents'}
          onClick={() => setView('agents')}
          title={t('Agents (⌘8)')}
        />
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
      <Section label={t('BRANCHES')} count={locals.length} onAdd={() => void newBranch()}>
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
        <Section label={t('REMOTES')} count={remotes.size}>
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
        <Section label={t('TAGS')} count={tags.length} defaultOpen={tags.length <= 12}>
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
        <Section label={t('WORKTREES')} count={repo.worktrees.length}>
          {repo.worktrees.map(w => (
            <Item key={w.path} icon={FolderGit2} color="var(--text-muted)" label={w.path.split('/').pop() ?? w.path} meta={w.branch} strong={w.path === repo.root} title={w.path} />
          ))}
        </Section>
      )}
    </nav>
  )
}
