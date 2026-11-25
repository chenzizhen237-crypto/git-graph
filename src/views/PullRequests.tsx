/**
 * Pull requests through `gh`: the list, one PR's conversation, commits,
 * files and checks, reviewing, commenting, merging, and opening a new one.
 */
import { GitPullRequest, MessageSquare, Plus, RefreshCcw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Resizer, usePanelSize } from '../components/Split'
import { Button, Chip, Empty, IconButton } from '../components/ui'
import { cx } from '../lib/cx'
import { cachedList, listPrs, type PrFilter, type PrSummary, prefetchPr, type RepoInfo, relTime } from '../lib/github'
import { t } from '../lib/i18n'
import { useApp } from '../state'
import { listColumn, PaneHead } from './Changes'
import { CreatePr } from './pulls/CreatePr'
import { ChecksIcon, PrPane, prIcon } from './pulls/PrDetailPane'

const FILTERS: { value: PrFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
  { value: 'review', label: 'To review' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
]

function ReviewBadge({ decision }: { decision: string }) {
  if (decision === 'APPROVED') return <span className="rounded-sm bg-ref-local-soft px-1.5 py-px text-xs font-semibold text-ref-local">{t('Approved')}</span>
  if (decision === 'CHANGES_REQUESTED') return <span className="rounded-sm bg-diff-del-bg px-1.5 py-px text-xs font-semibold text-status-deleted">{t('Changes requested')}</span>
  if (decision === 'REVIEW_REQUIRED') return <span className="rounded-sm bg-surface px-1.5 py-px text-xs font-semibold text-muted">{t('Review required')}</span>
  return null
}

export function PullRequestsView() {
  const { root, repo } = useApp()
  const [filter, setFilter] = useState<PrFilter>('open')
  const [prs, setPrs] = useState<PrSummary[] | null>(() => cachedList(root, 'open')?.prs ?? null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<RepoInfo | null>(() => cachedList(root, 'open')?.info ?? null)
  const [me, setMe] = useState(() => cachedList(root, 'open')?.viewer ?? '')
  const [selected, setSelected] = useState<number | 'new' | null>(null)
  const [q, setQ] = useState('')
  const list = usePanelSize('pr-list', 400, 280, 900)

  const load = useCallback(async () => {
    try {
      const data = await listPrs(root, filter)
      setInfo(data.info)
      setMe(data.viewer)
      setPrs(data.prs)
      setError(null)
      setSelected(s => (s === 'new' || data.prs.some(p => p.number === s) ? s : (data.prs[0]?.number ?? null)))
      // The first few are the likeliest next clicks.
      for (const p of data.prs.slice(0, 4)) prefetchPr(root, p.number)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPrs(p => p ?? [])
    }
  }, [root, filter])

  // Show the cached page for this filter at once, then refresh it.
  useEffect(() => {
    const hit = cachedList(root, filter)
    setPrs(hit?.prs ?? null)
    if (hit) setSelected(s => (s === 'new' || hit.prs.some(p => p.number === s) ? s : (hit.prs[0]?.number ?? null)))
    void load()
  }, [root, filter, load])
  // Branch and push changes can open or update a PR; reload with the repo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when HEAD moves or new commits are pushed, not on every list change
  useEffect(() => {
    if (prs) void load()
  }, [repo?.head, repo?.ahead])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (prs ?? []).filter(
      p =>
        !needle ||
        p.title.toLowerCase().includes(needle) ||
        String(p.number).includes(needle) ||
        p.headRefName.toLowerCase().includes(needle) ||
        p.author.login.toLowerCase().includes(needle),
    )
  }, [prs, q])

  if (error && !info)
    return (
      <Empty>
        <GitPullRequest size={28} />
        <div className="font-semibold text-primary">{t('Pull requests need a GitHub remote and the GitHub CLI signed in')}</div>
        <pre className="max-w-140 font-mono text-xs whitespace-pre-wrap">{error}</pre>
        <div className="text-sm">
          Install <code className="font-mono">gh</code>, run <code className="font-mono">gh auth login</code>, then refresh.
        </div>
        <Button icon={RefreshCcw} onClick={() => void load()}>
          {t('Try again')}
        </Button>
      </Empty>
    )

  const current = prs?.find(p => p.headRefName === repo?.branch)

  return (
    <>
      <div className={listColumn} style={{ width: list.size }}>
        <PaneHead title={t('Pull requests')} count={prs?.length ?? 0}>
          <IconButton icon={RefreshCcw} title={t('Refresh')} onClick={() => void load()} />
          <Button small kind="primary" icon={Plus} onClick={() => setSelected('new')}>
            {t('New')}
          </Button>
        </PaneHead>
        <div className="flex flex-col gap-2 border-b border-subtle p-2">
          <div className="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-muted focus-within:ring-1 focus-within:ring-focus">
            <Search size={13} />
            <input
              className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-faint"
              placeholder={t('Filter by title, number, branch, author')}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cx('h-6 rounded-md px-2 text-sm', filter === f.value ? 'bg-selected font-semibold text-ref-head' : 'text-secondary hover:bg-hover')}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
        </div>
        {repo && info && prs && !current && filter === 'open' && repo.branch !== info.defaultBranchRef.name && !repo.branch.startsWith('HEAD') && (
          <button
            type="button"
            className="m-2 mb-0 flex items-center gap-2 rounded-md border border-dashed border-strong px-2.5 py-2 text-left text-sm hover:bg-hover"
            onClick={() => setSelected('new')}
            title={`Open a pull request for ${repo.branch}`}
          >
            <GitPullRequest size={14} className="shrink-0 text-status-added" />
            <span className="min-w-0 flex-1 truncate">
              Open a pull request for <span className="font-semibold">{repo.branch}</span>
            </span>
            <Plus size={14} className="text-muted" />
          </button>
        )}
        <div className="flex-1 overflow-y-auto p-1.5">
          {prs === null && <Empty>{t('Loading pull requests…')}</Empty>}
          {prs && !shown.length && <Empty>No pull requests{q ? ' match' : ''}.</Empty>}
          {shown.map(pr => {
            const st = prIcon(pr)
            return (
              <button
                key={pr.number}
                type="button"
                onClick={() => setSelected(pr.number)}
                onMouseEnter={() => prefetchPr(root, pr.number)}
                className={cx('flex w-full gap-2.5 rounded-md px-2.5 py-2 text-left', selected === pr.number ? 'bg-selected' : 'hover:bg-hover')}
              >
                <st.icon size={15} color={st.color} className="mt-0.5 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-start gap-1.5">
                    <span className="min-w-0 flex-1 leading-snug font-medium">{pr.title}</span>
                    <ChecksIcon checks={pr.statusCheckRollup} />
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
                    <span>#{pr.number}</span>
                    <span>·</span>
                    <span>{pr.author.login}</span>
                    <span>·</span>
                    <span>{relTime(pr.updatedAt)}</span>
                    {pr.headRefName === repo?.branch && <Chip kind="head" name="current" />}
                    <ReviewBadge decision={pr.reviewDecision} />
                    {pr.commentCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <MessageSquare size={11} />
                        {pr.commentCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <Resizer panel={list} />
      <div className="flex min-w-0 flex-1 flex-col">
        {selected === 'new' && info ? (
          <CreatePr
            info={info}
            openHeads={new Map((prs ?? []).filter(p => p.state === 'OPEN').map(p => [p.headRefName, p.number]))}
            onCancel={() => setSelected(prs?.[0]?.number ?? null)}
            onCreated={() => void load()}
          />
        ) : typeof selected === 'number' ? (
          <PrPane key={selected} number={selected} me={me} onChanged={() => void load()} />
        ) : (
          <Empty>{t('Select a pull request')}</Empty>
        )}
      </div>
    </>
  )
}
