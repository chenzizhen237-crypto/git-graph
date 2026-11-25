/** Pull request detail pane: header, conversation, commits, files diff, and checks. */
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  ExternalLink,
  FileText,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  ListChecks,
  LogIn,
  type LucideIcon,
  MessageSquare,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { DiffView } from '../../components/Diff'
import { Markdown } from '../../components/Markdown'
import { Resizer, usePanelSize } from '../../components/Split'
import { Avatar, Button, Chip, Count, Empty, FilePath, fileRowClass, IconButton, LineStats, StatusBadge, splitPath } from '../../components/ui'
import { cx } from '../../lib/cx'
import { type Check as CheckRun, cachedDiff, cachedPr, checkState, forgetPr, openUrl, type PrDetail, type PrSummary, prActions, prDiff, relTime, viewPr } from '../../lib/github'
import { t } from '../../lib/i18n'
import { useApp } from '../../state'

export function prIcon(pr: Pick<PrSummary, 'state' | 'isDraft'>): { icon: LucideIcon; color: string; label: string } {
  if (pr.state === 'MERGED') return { icon: GitMerge, color: 'var(--ref-remote)', label: 'Merged' }
  if (pr.state === 'CLOSED') return { icon: GitPullRequestClosed, color: 'var(--status-deleted)', label: 'Closed' }
  if (pr.isDraft) return { icon: GitPullRequestDraft, color: 'var(--text-muted)', label: 'Draft' }
  return { icon: GitPullRequest, color: 'var(--status-added)', label: 'Open' }
}

export function ChecksIcon({ checks, size = 13 }: { checks: CheckRun[]; size?: number }) {
  const s = checkState(checks)
  if (s === 'none') return null
  if (s === 'pass') return <CircleCheck size={size} className="shrink-0 text-status-added" aria-label={t('Checks passed')} />
  if (s === 'fail') return <CircleX size={size} className="shrink-0 text-status-deleted" aria-label={t('Checks failed')} />
  return <CircleDot size={size} className="shrink-0 text-status-modified" aria-label={t('Checks running')} />
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

export function PrPane({ number, me, onChanged }: { number: number; me: string; onChanged: () => void }) {
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
          <span className="min-w-4 flex-1" />
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
            <span className="min-w-4 flex-1" />
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
          <span className="min-w-4 flex-1" />
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
            <span className={cx('min-w-0 flex-1 truncate', !local && 'text-secondary')} title={c.messageHeadline}>
              {c.messageHeadline}
            </span>
            <span className="max-w-40 shrink truncate text-sm text-muted" title={c.authors.map(a => a.login || a.name).join(', ')}>
              {c.authors.map(a => a.login || a.name).join(', ')}
            </span>
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
            <span className="min-w-0 flex-1 truncate" title={`${c.workflowName ? `${c.workflowName} / ` : ''}${c.name || c.context}`}>
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
