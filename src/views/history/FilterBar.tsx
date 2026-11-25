/** History filter bar: branch/ref scope picker, date, author, message search, and column picker. */
import { Calendar, Check, ChevronDown, Columns3, Columns3Cog, GitBranchPlus, GitFork, GitGraph, type LucideIcon, Rows3, Search, Tag, Users, X } from 'lucide-react'
import { Fragment, type ReactNode, useMemo, useState } from 'react'

import { caps, Empty, IconButton, Segmented } from '../../components/ui'
import { cx } from '../../lib/cx'
import { t } from '../../lib/i18n'
import { compactAgo, matchItems, nameParts, type PickItem, pickSections, QUICK_SCOPES, scopeLabel } from '../../lib/picker'
import { type Graph, updateSettings, useSettings } from '../../lib/settings'
import { useApp } from '../../state'

const DATES = [
  { value: '', label: 'Any date' },
  { value: '24 hours ago', label: 'Last 24 hours' },
  { value: '1 week ago', label: 'Last 7 days' },
  { value: '1 month ago', label: 'Last 30 days' },
  { value: '1 year ago', label: 'Last year' },
]

const COLUMNS: { key: 'author' | 'date' | 'ci' | 'sha'; label: string }[] = [
  { key: 'author', label: 'Author' },
  { key: 'date', label: 'Date' },
  { key: 'ci', label: 'CI status' },
  { key: 'sha', label: 'SHA' },
]

const popover = 'absolute z-40 flex flex-col overflow-hidden rounded-lg border border-strong bg-elevated shadow-[0_12px_32px_var(--shadow)]'

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

function ColumnPicker() {
  const graph = useSettings(s => s.graph)
  const [open, setOpen] = useState(false)
  const toggle = (patch: Partial<Graph>) => updateSettings({ graph: { ...graph, ...patch } })
  return (
    <div className="relative">
      <IconButton icon={Columns3Cog} active={open} onClick={() => setOpen(!open)} title={t('Choose columns')} />
      {open && (
        <>
          <div className="fixed inset-0 z-39" onClick={() => setOpen(false)} />
          <div className={cx(popover, 'top-8 right-0 w-45 p-1.5')}>
            {COLUMNS.map(c => (
              <button
                key={c.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={graph[c.key]}
                className="flex h-7 items-center gap-2 rounded-md px-2 text-left hover:bg-hover"
                onClick={() => toggle({ [c.key]: !graph[c.key] })}
              >
                <span className="flex-1">{t(c.label)}</span>
                {graph[c.key] && <Check size={13} className="text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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

export function FilterBar({ showGraph, setShowGraph }: { showGraph: boolean; setShowGraph: (v: boolean) => void }) {
  const { repo, query, setQuery } = useApp()
  const inspector = useSettings(s => s.inspector)
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
        value={inspector ? 'split' : 'list'}
        onChange={v => updateSettings({ inspector: v === 'split' })}
        options={[
          { value: 'list', icon: Rows3, title: t('List only') },
          { value: 'split', icon: Columns3, title: t('List and details') },
        ]}
      />
      <ColumnPicker />
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
