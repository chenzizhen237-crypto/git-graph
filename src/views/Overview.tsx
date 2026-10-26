/**
 * The CI overview (Nib: Desktop 25/26): every repository on this Mac with
 * the latest checks on its default branch and its current branch, failing
 * first. Selecting one lists its checks; Open in Actions switches to that
 * repository's Actions view. Refreshes every minute, every 15 s while
 * something runs.
 */
import { CircleDashed, CirclePlay, ExternalLink, RefreshCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button, Chip, Count, caps, Empty, IconButton } from '../components/ui'
import { duration } from '../lib/actions'
import { cx } from '../lib/cx'
import { openUrl } from '../lib/github'
import { t, timeAgo } from '../lib/i18n'
import { type BranchCi, branchState, pollEvery, type RepoCi, type RepoState, refreshOverview, repoState, summary, useOverview } from '../lib/overview'
import { readRecents } from '../state'
import { StateIcon } from './Actions'

type Filter = 'all' | RepoState

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['fail', 'Failing'],
  ['running', 'Running'],
  ['pass', 'Passing'],
]

const SUMMARY_COLOR: Record<RepoState, string> = { fail: 'text-status-deleted', running: 'text-status-modified', pass: 'text-muted', none: 'text-muted' }

const home = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')
const recentPaths = () => readRecents().map(r => r.path)

function RepoIcon({ state, size = 15 }: { state: RepoState; size?: number }) {
  if (state === 'none') return <CircleDashed size={size} className="shrink-0 text-faint" aria-label={t('No checks')} />
  return <StateIcon state={state} size={size} />
}

const summaryText = (b?: BranchCi) => {
  const s = summary(b)
  return t(s.text, { n: s.n, total: s.total })
}

export function OverviewView({ onOpenRepo }: { onOpenRepo: (path: string) => void }) {
  const { repos, at, error } = useOverview()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [, tick] = useState(0)

  // Load now, then on a timer that speeds up while something runs.
  const every = pollEvery(repos)
  useEffect(() => {
    void refreshOverview(recentPaths())
    const id = window.setInterval(() => void refreshOverview(recentPaths()), every * 1000)
    return () => window.clearInterval(id)
  }, [every])
  // Keep "Updated 20s ago" honest between refreshes.
  useEffect(() => {
    const id = window.setInterval(() => tick(n => n + 1), 10_000)
    return () => window.clearInterval(id)
  }, [])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, fail: 0, running: 0, pass: 0, none: 0 }
    for (const r of repos ?? []) {
      c.all++
      c[repoState(r)]++
    }
    return c
  }, [repos])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (repos ?? []).filter(r => (filter === 'all' || repoState(r) === filter) && (!q || r.name.toLowerCase().includes(q) || r.slug?.toLowerCase().includes(q)))
  }, [repos, filter, query])
  const repo = repos?.find(r => r.path === selected) ?? shown[0]

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col border-r border-subtle">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle pr-2.5 pl-3.5">
          <span className="text-lg font-bold">{t('CI overview')}</span>
          <Count>{counts.all}</Count>
          <span className="flex-1" />
          {at && (
            <span className="truncate text-sm text-muted" title={new Date(at).toLocaleString()}>
              {t('Updated {when}', { when: timeAgo(at) })} · {t(every === 15 ? 'refreshes every 15s while running' : 'refreshes every minute')}
            </span>
          )}
          <IconButton icon={RefreshCcw} title={t('Refresh')} onClick={() => void refreshOverview(recentPaths())} />
        </div>
        <div className="flex shrink-0 items-center gap-1 border-b border-subtle p-2">
          {FILTERS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={cx('flex h-6 items-center gap-1.5 rounded-md px-2 text-sm', filter === v ? 'bg-selected font-semibold text-ref-head' : 'text-secondary hover:bg-hover')}
            >
              {t(label)}
              <span className={cx('text-xs font-semibold', v === 'fail' && counts.fail ? 'text-status-deleted' : 'text-muted')}>{counts[v]}</span>
            </button>
          ))}
          <span className="flex-1" />
          <div className="flex h-7 w-60 items-center gap-1.5 rounded-md bg-surface px-2 text-muted focus-within:ring-1 focus-within:ring-focus">
            <Search size={13} />
            <input
              className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-faint"
              placeholder={t('Filter repositories')}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {repos === null && <Empty>{t('Looking for repositories and their checks…')}</Empty>}
          {repos && !repos.length && <Empty>{error ?? t('No repositories found. Add your code folders in Settings → Repository folders.')}</Empty>}
          {repos && repos.length > 0 && !shown.length && <Empty>{t('No repository matches.')}</Empty>}
          {shown.map(r => (
            <RepoRow key={r.path} repo={r} selected={r.path === repo?.path} onSelect={() => setSelected(r.path)} />
          ))}
        </div>
      </div>
      <div className="flex w-115 shrink-0 flex-col">{repo ? <RepoPane repo={repo} onOpen={() => onOpenRepo(repo.path)} /> : <Empty>{t('Select a repository')}</Empty>}</div>
    </>
  )
}

function RepoRow({ repo: r, selected, onSelect }: { repo: RepoCi; selected: boolean; onSelect: () => void }) {
  const state = repoState(r)
  const main = r.main
  const lead = main ?? r.current
  return (
    <button type="button" onClick={onSelect} className={cx('flex w-full flex-col gap-1 rounded-md px-3 py-2.25 text-left', selected ? 'bg-selected' : 'hover:bg-hover')}>
      <span className="flex w-full items-center gap-2">
        <RepoIcon state={state} />
        <span className="max-w-60 truncate font-semibold" title={r.name}>
          {r.name}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted" title={`${r.error ?? r.slug ?? t('Local only · no GitHub remote')}\n${r.path}`}>
          {r.error ? r.error : (r.slug ?? t('Local only · no GitHub remote'))}
        </span>
        <span className={cx('text-sm font-medium whitespace-nowrap', SUMMARY_COLOR[branchState(main)])}>{r.slug && !r.error ? summaryText(main) : ''}</span>
        {lead && <span className="text-sm whitespace-nowrap text-muted">{timeAgo(new Date(lead.at).getTime())}</span>}
      </span>
      {main && (
        <span className="flex w-full items-center gap-1.5 pl-5.75 text-sm">
          <Chip kind="local" name={main.branch} />
          <span className="font-mono font-medium text-link">{main.sha.slice(0, 7)}</span>
          <span className="min-w-0 flex-1 truncate text-secondary" title={main.subject}>
            {main.subject}
          </span>
        </span>
      )}
      {r.current && (
        <span className="flex w-full items-center gap-1.5 pl-5.75 text-sm text-muted">
          <RepoIcon state={branchState(r.current)} size={12} />
          <Chip kind="local" name={r.current.branch} />
          <span className="min-w-0 flex-1 truncate">{summaryText(r.current)}</span>
        </span>
      )}
    </button>
  )
}

function RepoPane({ repo: r, onOpen }: { repo: RepoCi; onOpen: () => void }) {
  const branches = [r.main, r.current].filter((b): b is BranchCi => !!b)
  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-subtle px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2.5">
          <RepoIcon state={repoState(r)} size={18} />
          <h2 className="m-0 min-w-0 flex-1 truncate text-xl font-semibold" title={r.name}>
            {r.name}
          </h2>
          {r.slug && (
            <>
              <Button kind="primary" icon={CirclePlay} onClick={onOpen}>
                {t('Open in Actions')}
              </Button>
              <Button icon={ExternalLink} onClick={() => void openUrl(`https://github.com/${r.slug}/actions`)}>
                GitHub
              </Button>
            </>
          )}
        </div>
        <div className="truncate text-sm text-muted" title={`${r.slug ? `${r.slug}\n` : ''}${r.path}`}>
          {r.slug ? `${r.slug} · ` : ''}
          {home(r.path)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2.5">
        {!r.slug && <Empty>{t('This repository has no GitHub remote, so there are no checks to show.')}</Empty>}
        {r.error && <Empty>{r.error}</Empty>}
        {r.slug && !r.error && !branches.length && <Empty>{t('No commits on GitHub yet.')}</Empty>}
        {branches.map((b, i) => (
          <div key={b.branch} className={cx(i > 0 && 'mt-3')}>
            <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1">
              <span className={cx(caps, 'max-w-50 truncate uppercase')} title={b.branch}>
                {b.branch}
              </span>
              <span className="font-mono text-xs text-link" title={b.sha}>
                {b.sha.slice(0, 7)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted" title={b.subject}>
                {b.subject}
              </span>
            </div>
            {!b.checks.length && <div className="px-2.5 py-1.5 text-sm text-faint">{t('No checks on this commit.')}</div>}
            {b.checks.map((c, k) => (
              <button
                key={`${c.name}-${k}`}
                type="button"
                disabled={!c.url}
                onClick={() => c.url && void openUrl(c.url)}
                title={c.url ? `${c.name}\n${t('Open on GitHub')}` : c.name}
                className="flex h-7.5 w-full items-center gap-2 rounded-md px-2.5 text-left enabled:hover:bg-hover"
              >
                <StateIcon state={c.state} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-sm text-muted">
                  {/* Commit statuses carry no end time; only check runs get a duration. */}
                  {c.completed || c.state === 'running' ? duration(c.started, c.completed) : '—'}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
