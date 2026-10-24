/**
 * Pull requests through `gh`: the list, one PR's conversation, commits,
 * files and checks, reviewing, commenting, merging, and opening a new one.
 */
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  ExternalLink,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  ListChecks,
  LogIn,
  type LucideIcon,
  MessageSquare,
  Plus,
  RefreshCcw,
  Search,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { DiffView } from '../components/Diff'
import { Markdown } from '../components/Markdown'
import { Resizer, usePanelSize } from '../components/Split'
import { Avatar, Button, Chip, Count, caps, Empty, FilePath, fileRowClass, IconButton, LineStats, StatusBadge, splitPath } from '../components/ui'
import { cx } from '../lib/cx'
import { git } from '../lib/git'
import {
  type Check as CheckRun,
  cachedDiff,
  cachedList,
  cachedPr,
  checkState,
  forgetPr,
  listPrs,
  openUrl,
  type PrDetail,
  type PrFilter,
  type PrSummary,
  prActions,
  prDiff,
  prefetchPr,
  type RepoInfo,
  relTime,
  viewPr,
} from '../lib/github'
import { t } from '../lib/i18n'
import { useApp } from '../state'
import { listColumn, PaneHead } from './Changes'

const FILTERS: { value: PrFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
  { value: 'review', label: 'To review' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
]

function prIcon(pr: Pick<PrSummary, 'state' | 'isDraft'>): { icon: LucideIcon; color: string; label: string } {
  if (pr.state === 'MERGED') return { icon: GitMerge, color: 'var(--ref-remote)', label: 'Merged' }
  if (pr.state === 'CLOSED') return { icon: GitPullRequestClosed, color: 'var(--status-deleted)', label: 'Closed' }
  if (pr.isDraft) return { icon: GitPullRequestDraft, color: 'var(--text-muted)', label: 'Draft' }
  return { icon: GitPullRequest, color: 'var(--status-added)', label: 'Open' }
}

function ChecksIcon({ checks, size = 13 }: { checks: CheckRun[]; size?: number }) {
  const s = checkState(checks)
  if (s === 'none') return null
  if (s === 'pass') return <CircleCheck size={size} className="shrink-0 text-status-added" aria-label={t('Checks passed')} />
  if (s === 'fail') return <CircleX size={size} className="shrink-0 text-status-deleted" aria-label={t('Checks failed')} />
  return <CircleDot size={size} className="shrink-0 text-status-modified" aria-label={t('Checks running')} />
}

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

type Tab = 'conversation' | 'commits' | 'files' | 'checks'

function TabButton({ on, icon: Icon, children, onClick }: { on: boolean; icon: LucideIcon; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        '-mb-px flex items-center gap-1.25 border-b-2 py-2',
        on ? 'border-primary font-semibold text-primary' : 'border-transparent font-medium text-muted hover:text-secondary',
      )}
    >
      <Icon size={13} />
      {children}
    </button>
  )
}

function PrPane({ number, me, onChanged }: { number: number; me: string; onChanged: () => void }) {
  const { root, repo, act, ask } = useApp()
  const [pr, setPr] = useState<PrDetail | null>(() => cachedPr(root, number) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('conversation')

  const load = useCallback(async () => {
    try {
      setPr(await viewPr(root, number))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [root, number])
  useEffect(() => {
    void load()
    // Start the diff now so the Files tab is ready when opened.
    void prDiff(root, number).catch(() => {})
  }, [load, root, number])

  if (error && !pr) return <Empty>{error}</Empty>
  if (!pr) return <Empty>Loading #{number}…</Empty>

  const st = prIcon(pr)
  const run = async (label: string, args: string[], opts: { stdin?: string; done?: string } = {}) => {
    const ok = await act(label, args, { ...opts, tool: 'gh' })
    if (ok) {
      forgetPr(root, number)
      void load()
      onChanged()
    }
    return ok
  }
  const isCurrent = pr.headRefName === repo?.branch

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-subtle px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <h2 className="m-0 min-w-0 flex-1 text-xl leading-snug font-semibold select-text">
            {pr.title} <span className="font-normal text-muted">#{pr.number}</span>
          </h2>
          <div className="flex shrink-0 gap-1.5">
            {!isCurrent && pr.state === 'OPEN' && (
              <Button small icon={LogIn} onClick={() => void run('Checkout PR', prActions.checkout(pr.number), { done: t('Checked out #{n}', { n: pr.number }) })}>
                {t('Check out')}
              </Button>
            )}
            <Button small icon={ExternalLink} onClick={() => void openUrl(pr.url)}>
              {t('GitHub')}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-on-accent" style={{ background: st.color }}>
            <st.icon size={12} />
            {t(st.label)}
          </span>
          <Avatar name={pr.author.login} />
          <span className="font-medium text-secondary">{pr.author.login}</span>
          <span>
            {pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'proposed' : 'wants to merge'} {pr.commits.length} commit{pr.commits.length === 1 ? '' : 's'} · opened{' '}
            {relTime(pr.createdAt)}
          </span>
          <span className="flex-1" />
          <LineStats added={pr.additions} deleted={pr.deletions} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
          <Chip kind="local" name={pr.baseRefName} />
          <ArrowLeft size={13} className="shrink-0" aria-label="from" />
          <Chip kind={isCurrent ? 'head' : 'local'} name={pr.headRefName} />
          {isCurrent && <span>· checked out here</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-4.5 border-b border-subtle px-5">
        <TabButton on={tab === 'conversation'} icon={MessageSquare} onClick={() => setTab('conversation')}>
          Conversation <Count>{pr.comments.length + pr.reviews.length}</Count>
        </TabButton>
        <TabButton on={tab === 'commits'} icon={GitCommitHorizontal} onClick={() => setTab('commits')}>
          Commits <Count>{pr.commits.length}</Count>
        </TabButton>
        <TabButton on={tab === 'files'} icon={FileText} onClick={() => setTab('files')}>
          Files <Count>{pr.changedFiles}</Count>
        </TabButton>
        <TabButton on={tab === 'checks'} icon={ListChecks} onClick={() => setTab('checks')}>
          Checks <Count>{pr.statusCheckRollup.length}</Count>
        </TabButton>
      </div>
      {tab === 'conversation' && <Conversation pr={pr} run={run} ask={ask} own={!!me && me === pr.author.login} />}
      {tab === 'commits' && <Commits pr={pr} />}
      {tab === 'files' && <Files pr={pr} root={root} />}
      {tab === 'checks' && <Checks pr={pr} />}
    </>
  )
}

type Run = (label: string, args: string[], opts?: { stdin?: string; done?: string }) => Promise<boolean>

function Conversation({ pr, run, ask, own }: { pr: PrDetail; run: Run; ask: ReturnType<typeof useApp>['ask']; own: boolean }) {
  const [text, setText] = useState('')
  const timeline = useMemo(
    () =>
      [
        ...pr.comments.map(c => ({ kind: 'comment' as const, author: c.author.login, body: c.body, at: c.createdAt, state: '' })),
        ...pr.reviews
          .filter(r => r.body || r.state !== 'COMMENTED')
          .map(r => ({ kind: 'review' as const, author: r.author.login, body: r.body, at: r.submittedAt, state: r.state })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [pr],
  )
  const send = async (kind: 'comment' | 'approve' | 'request-changes') => {
    const args = kind === 'comment' ? prActions.comment(pr.number) : prActions.review(pr.number, kind)
    const label = kind === 'comment' ? t('Comment') : kind === 'approve' ? t('Approve') : t('Request changes')
    if (await run(label, args, { stdin: text, done: kind === 'comment' ? t('Comment posted') : t('Review submitted') })) setText('')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-215 flex-col gap-4 px-5 py-4">
        <Bubble author={pr.author.login} at={pr.createdAt} label="opened this pull request">
          <Markdown text={pr.body} />
        </Bubble>
        {timeline.map((item, i) => (
          <Bubble key={i} author={item.author} at={item.at} label={item.kind === 'review' ? reviewLabel(item.state) : t('commented')} tone={item.state}>
            {item.body ? <Markdown text={item.body} /> : null}
          </Bubble>
        ))}
        {pr.state === 'OPEN' && <MergeBox pr={pr} run={run} ask={ask} />}
        <div className="flex flex-col gap-2 rounded-lg border border-strong bg-app p-3">
          <textarea
            className="h-24 resize-y rounded-md border border-strong bg-app px-2.5 py-2 leading-normal outline-none focus:border-focus focus:ring-1 focus:ring-focus"
            placeholder={t('Leave a comment (Markdown)')}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && void send('comment')}
          />
          <div className="flex flex-wrap justify-end gap-2">
            {pr.state === 'OPEN' ? (
              <Button small onClick={() => void run('Close', prActions.close(pr.number), { done: t('Closed #{n}', { n: pr.number }) })}>
                <GitPullRequestClosed size={14} className="text-status-deleted" />
                {t('Close pull request')}
              </Button>
            ) : (
              pr.state === 'CLOSED' && (
                <Button small onClick={() => void run('Reopen', prActions.reopen(pr.number), { done: t('Reopened #{n}', { n: pr.number }) })}>
                  {t('Reopen')}
                </Button>
              )
            )}
            <span className="flex-1" />
            {/* GitHub does not let authors review their own pull requests. */}
            {!own && pr.state === 'OPEN' && (
              <>
                <Button small disabled={!text.trim()} onClick={() => void send('request-changes')}>
                  {t('Request changes')}
                </Button>
                <Button small icon={Check} onClick={() => void send('approve')}>
                  {t('Approve')}
                </Button>
              </>
            )}
            <Button small kind="primary" icon={MessageSquare} disabled={!text.trim()} onClick={() => void send('comment')} title="⌘↩">
              {t('Comment')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const reviewLabel = (state: string) =>
  t(state === 'APPROVED' ? 'approved these changes' : state === 'CHANGES_REQUESTED' ? 'requested changes' : state === 'DISMISSED' ? 'review dismissed' : 'reviewed')

function Bubble({ author, at, label, tone, children }: { author: string; at: string; label: string; tone?: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Avatar name={author} size={28} />
      <div
        className={cx(
          'min-w-0 flex-1 overflow-hidden rounded-lg border',
          tone === 'APPROVED' ? 'border-status-added' : tone === 'CHANGES_REQUESTED' ? 'border-status-deleted' : 'border-subtle',
        )}
      >
        <div className="flex items-center gap-1.5 border-b border-subtle bg-surface px-3 py-1.5 text-sm">
          {tone === 'APPROVED' && <CircleCheck size={13} className="text-status-added" />}
          {tone === 'CHANGES_REQUESTED' && <CircleX size={13} className="text-status-deleted" />}
          <span className="font-semibold">{author}</span>
          <span className="text-muted">
            {label} · {relTime(at)}
          </span>
        </div>
        {children && <div className="px-3 py-2">{children}</div>}
      </div>
    </div>
  )
}

function MergeBox({ pr, run, ask }: { pr: PrDetail; run: Run; ask: ReturnType<typeof useApp>['ask'] }) {
  const [how, setHow] = useState<'squash' | 'merge' | 'rebase'>(() => (localStorage.getItem('pr:merge') as 'squash' | null) ?? 'squash')
  const [del, setDel] = useState(true)
  const checks = checkState(pr.statusCheckRollup)
  const blocked = pr.mergeable === 'CONFLICTING'
  const status: { icon: LucideIcon; color: string; text: string } = blocked
    ? { icon: CircleX, color: 'var(--status-deleted)', text: t('This branch has conflicts that must be resolved') }
    : checks === 'fail'
      ? { icon: CircleX, color: 'var(--status-deleted)', text: t('Some checks were not successful') }
      : checks === 'pending'
        ? { icon: Clock, color: 'var(--status-modified)', text: t('Some checks haven’t completed yet') }
        : pr.reviewDecision === 'CHANGES_REQUESTED'
          ? { icon: CircleX, color: 'var(--status-deleted)', text: t('Changes requested') }
          : { icon: CircleCheck, color: 'var(--status-added)', text: pr.reviewDecision === 'APPROVED' ? t('Approved — ready to merge') : t('No conflicts with the base branch') }
  const merge = async () => {
    localStorage.setItem('pr:merge', how)
    const word = t({ squash: t('Squash and merge'), merge: t('Merge'), rebase: t('Rebase and merge') }[how])
    if (
      await ask({
        title: `${word} #${pr.number}?`,
        text: del ? t('Into {base}, then delete {head}.', { base: pr.baseRefName, head: pr.headRefName }) : t('Into {base}.', { base: pr.baseRefName }),
        confirm: word,
      })
    )
      await run('Merge', prActions.merge(pr.number, how, del), { done: t('Merged #{n}', { n: pr.number }) })
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-strong bg-sidebar p-3">
      <div className="flex items-center gap-2 font-semibold">
        <status.icon size={16} color={status.color} />
        {status.text}
      </div>
      {pr.isDraft ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-muted">{t('This pull request is still a draft.')}</span>
          <Button small kind="primary" onClick={() => void run('Ready for review', prActions.ready(pr.number), { done: t('Marked ready for review') })}>
            {t('Ready for review')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-md bg-surface p-0.5 text-sm">
            {(['squash', 'merge', 'rebase'] as const).map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHow(h)}
                className={cx('h-6 rounded-sm px-2', how === h ? 'bg-elevated font-semibold text-primary shadow-[0_1px_2px_var(--shadow)]' : 'text-muted')}
              >
                {{ squash: t('Squash'), merge: t('Merge commit'), rebase: t('Rebase') }[h]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-secondary">
            <input type="checkbox" className="m-0 accent-accent" checked={del} onChange={e => setDel(e.target.checked)} />
            {t('Delete branch')}
          </label>
          <span className="flex-1" />
          <Button small onClick={() => void run('Convert to draft', prActions.draft(pr.number), { done: t('Converted to draft') })}>
            {t('Convert to draft')}
          </Button>
          <Button kind="primary" icon={GitMerge} disabled={blocked} onClick={() => void merge()}>
            {{ squash: t('Squash and merge'), merge: t('Merge'), rebase: t('Rebase and merge') }[how]}
          </Button>
        </div>
      )}
    </div>
  )
}

function Commits({ pr }: { pr: PrDetail }) {
  const { setView, setSelected, repo } = useApp()
  return (
    <div className="flex-1 overflow-y-auto p-2">
      {pr.commits.map(c => {
        const local = repo?.rows.some(r => r.hash === c.oid)
        return (
          <button
            key={c.oid}
            type="button"
            disabled={!local}
            title={local ? t('Show in History') : t('Not in the loaded history — fetch or check out the branch')}
            onClick={() => {
              setView('history')
              setSelected(c.oid)
            }}
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left enabled:hover:bg-hover"
          >
            <GitCommitHorizontal size={14} className="shrink-0 text-muted" />
            <span className={cx('min-w-0 flex-1 truncate', !local && 'text-secondary')}>{c.messageHeadline}</span>
            <span className="max-w-40 shrink truncate text-sm text-muted">{c.authors.map(a => a.login || a.name).join(', ')}</span>
            <span className="w-24 shrink-0 text-right text-sm text-muted">{relTime(c.authoredDate)}</span>
            <span className="w-16 shrink-0 text-right font-mono text-sm font-medium text-link">{c.oid.slice(0, 7)}</span>
          </button>
        )
      })}
    </div>
  )
}

function Files({ pr, root }: { pr: PrDetail; root: string }) {
  const [diffs, setDiffs] = useState<Map<string, string> | null>(() => cachedDiff(root, pr.number) ?? null)
  const [sel, setSel] = useState(pr.files[0]?.path ?? null)
  const panel = usePanelSize('pr-files', 300, 180, 700)
  useEffect(() => {
    let live = true
    prDiff(root, pr.number)
      .then(d => live && setDiffs(d))
      .catch(() => live && setDiffs(new Map()))
    return () => {
      live = false
    }
  }, [root, pr.number])
  const letter = (t: string) => ({ ADDED: 'A', DELETED: 'D', RENAMED: 'R', COPIED: 'C' })[t] ?? 'M'
  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0 overflow-y-auto border-r border-subtle p-1.5" style={{ width: panel.size }}>
        {pr.files.map(f => {
          const { name, dir } = splitPath(f.path)
          return (
            <button key={f.path} type="button" className={fileRowClass(sel === f.path)} onClick={() => setSel(f.path)} title={f.path}>
              <StatusBadge letter={letter(f.changeType)} />
              <FilePath name={name} dir={dir} />
              <LineStats added={f.additions} deleted={f.deletions} />
            </button>
          )
        })}
      </div>
      <Resizer panel={panel} />
      <div className="flex min-w-0 flex-1 flex-col">{sel ? <DiffView path={sel} text={diffs?.get(sel) ?? ''} loading={!diffs} /> : <Empty>{t('No files')}</Empty>}</div>
    </div>
  )
}

function Checks({ pr }: { pr: PrDetail }) {
  if (!pr.statusCheckRollup.length) return <Empty>{t('No checks on this pull request.')}</Empty>
  return (
    <div className="flex-1 overflow-y-auto p-2">
      {pr.statusCheckRollup.map((c, i) => {
        const url = c.detailsUrl || c.targetUrl
        return (
          <div key={i} className="flex h-10 items-center gap-2.5 rounded-md px-2.5 hover:bg-hover">
            <ChecksIcon checks={[c]} size={15} />
            <span className="min-w-0 flex-1 truncate">
              {c.workflowName && <span className="text-muted">{c.workflowName} / </span>}
              <span className="font-medium">{c.name || c.context}</span>
            </span>
            <span className="text-sm text-muted">{(c.conclusion || c.state || c.status || '').toLowerCase().replace('_', ' ')}</span>
            {url?.startsWith('https://') && <IconButton icon={ExternalLink} small size={13} title={t('Open details')} onClick={() => void openUrl(url)} />}
          </div>
        )
      })}
    </div>
  )
}

function CreatePr({ info, openHeads, onCancel, onCreated }: { info: RepoInfo; openHeads: Map<string, number>; onCancel: () => void; onCreated: () => void }) {
  const { root, repo, act } = useApp()
  const defaultBase = info.defaultBranchRef.name
  const locals = useMemo(() => repo?.refs.filter(r => r.kind === 'local') ?? [], [repo?.refs])
  // Head: the current branch, unless that is the base; then the newest other branch.
  const [head, setHead] = useState(() => (repo && repo.branch !== defaultBase ? repo.branch : (locals.find(r => r.name !== defaultBase && !openHeads.has(r.name))?.name ?? '')))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState(defaultBase)
  const [draft, setDraft] = useState(false)
  const [preview, setPreview] = useState(false)
  const [edited, setEdited] = useState(false)

  // Start from the head's commits: the last subject as title, the list as body.
  useEffect(() => {
    if (!head || edited) return
    void git(root, ['log', '--format=%s', `origin/${base}..${head}`])
      .catch(() => git(root, ['log', '--format=%s', `${base}..${head}`]))
      .then(out => {
        const subjects = out.trim().split('\n').filter(Boolean)
        setTitle(subjects[0] ?? '')
        setBody(subjects.length > 1 ? subjects.map(s => `- ${s}`).join('\n') : '')
      })
      .catch(() => {})
  }, [root, head, base, edited])

  if (!repo) return null
  const ref = locals.find(r => r.name === head)
  const ahead = Number(/ahead (\d+)/.exec(ref?.track ?? '')?.[1] ?? 0)
  const needsPush = !!ref && (!ref.upstream || ahead > 0)
  const existing = openHeads.get(head)
  const create = async () => {
    // gh cannot push for us without a terminal; publish the branch first.
    if (needsPush && !(await act('Push', ['push', '--set-upstream', 'origin', head], { done: t('Pushed {head}', { head }) }))) return
    if (await act('Create pull request', prActions.create(title.trim(), base, head, draft), { stdin: body, done: t('Pull request opened'), tool: 'gh' })) onCreated()
  }
  const field = 'rounded-md border border-strong bg-app px-2.5 outline-none focus:border-focus focus:ring-1 focus:ring-focus'
  const branchSelect = (value: string, onChange: (v: string) => void, names: string[]) => (
    <select className={cx(field, 'h-7 max-w-80 text-primary')} value={value} onChange={e => onChange(e.target.value)}>
      {names.map(b => (
        <option key={b} value={b}>
          {b}
          {openHeads.has(b) && value !== b ? ` (#${openHeads.get(b)})` : ''}
        </option>
      ))}
    </select>
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-215 flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <IconButton icon={ArrowLeft} onClick={onCancel} title={t('Back')} />
          <h2 className="m-0 text-xl font-semibold">{t('Open a pull request')}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <GitBranch size={14} />
          <span>{t('Merge')}</span>
          {branchSelect(
            head,
            h => {
              setHead(h)
              setEdited(false)
            },
            locals.map(r => r.name).filter(n => n !== base),
          )}
          <span>into</span>
          {branchSelect(
            base,
            b => {
              setBase(b)
              setEdited(false)
            },
            [...new Set([defaultBase, ...locals.map(r => r.name)])].filter(n => n !== head),
          )}
          {needsPush && (
            <span>
              · {ref?.upstream ? t(ahead === 1 ? '{n} commit will be pushed first' : '{n} commits will be pushed first', { n: ahead }) : t('the branch will be published first')}
            </span>
          )}
        </div>
        {!head && <div className="text-sm text-status-modified">Create a branch first — there is no branch to propose besides {base}.</div>}
        {existing !== undefined && (
          <div className="text-sm text-status-modified">
            {head} already has an open pull request, #{existing}.
          </div>
        )}
        <input
          className={cx(field, 'h-9 text-lg font-medium')}
          placeholder={t('Title')}
          value={title}
          onChange={e => {
            setTitle(e.target.value)
            setEdited(true)
          }}
          autoFocus
        />
        <div className="flex gap-3 text-sm">
          <button type="button" className={cx('border-b-2 pb-1', !preview ? 'border-primary font-semibold' : 'border-transparent text-muted')} onClick={() => setPreview(false)}>
            {t('Write')}
          </button>
          <button type="button" className={cx('border-b-2 pb-1', preview ? 'border-primary font-semibold' : 'border-transparent text-muted')} onClick={() => setPreview(true)}>
            {t('Preview')}
          </button>
        </div>
        {preview ? (
          <div className="min-h-60 rounded-md border border-subtle p-3">
            <Markdown text={body} />
          </div>
        ) : (
          <textarea
            className={cx(field, 'h-60 resize-y py-2 leading-normal')}
            placeholder={t('Describe the change (Markdown)')}
            value={body}
            onChange={e => {
              setBody(e.target.value)
              setEdited(true)
            }}
          />
        )}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-secondary">
            <input type="checkbox" className="m-0 accent-accent" checked={draft} onChange={e => setDraft(e.target.checked)} />
            {t('Create as draft')}
          </label>
          <span className="flex-1" />
          <Button onClick={onCancel}>{t('Cancel')}</Button>
          <Button kind="primary" icon={GitPullRequest} disabled={!title.trim() || !head || head === base || existing !== undefined} onClick={() => void create()}>
            {draft ? t('Create draft') : t('Create pull request')}
          </Button>
        </div>
        <div className={caps}>Opens on {info.nameWithOwner}</div>
      </div>
    </div>
  )
}
