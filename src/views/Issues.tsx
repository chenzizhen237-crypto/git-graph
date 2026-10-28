/** GitHub Issues: the list, one issue's conversation, commenting, and starting a branch for an issue. */
import { CircleCheck, CircleDot, ExternalLink, GitBranchPlus, MessageSquare, Plus, RefreshCcw, Search, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Markdown } from '../components/Markdown'
import { Resizer, usePanelSize } from '../components/Split'
import { Avatar, Button, Empty, IconButton } from '../components/ui'
import { webUrl } from '../lib/actions'
import { cx } from '../lib/cx'
import { actions } from '../lib/git'
import { openUrl, relTime } from '../lib/github'
import { t } from '../lib/i18n'
import { commentIssue, type IssueDetail, type IssueFilter, type IssueSummary, issueBranch, listIssues, viewIssue } from '../lib/issues'
import { useApp } from '../state'
import { listColumn, PaneHead } from './Changes'

const FILTERS: { value: IssueFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'closed', label: 'Closed' },
]

/** A label chip in its GitHub colour, readable in both themes. */
function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex h-4.5 shrink-0 items-center rounded-full px-1.75 text-xs font-medium"
      style={{ background: `color-mix(in srgb, #${color} 22%, transparent)`, color: `color-mix(in srgb, #${color} 70%, var(--text-primary))` }}
    >
      {name}
    </span>
  )
}

export function IssuesView() {
  const { root, act, toast } = useApp()
  const [filter, setFilter] = useState<IssueFilter>('open')
  const [issues, setIssues] = useState<IssueSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const list = usePanelSize('issue-list', 420, 280, 900)

  const load = useCallback(async () => {
    try {
      const data = await listIssues(root, filter)
      setIssues(data)
      setError(null)
      setSelected(s => (data.some(i => i.number === s) ? s : (data[0]?.number ?? null)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setIssues(i => i ?? [])
    }
  }, [root, filter])
  useEffect(() => {
    setIssues(null)
    void load()
  }, [load])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (issues ?? []).filter(
      i =>
        !needle ||
        i.title.toLowerCase().includes(needle) ||
        String(i.number).includes(needle) ||
        i.labels.some(l => l.name.toLowerCase().includes(needle)) ||
        i.author.login.toLowerCase().includes(needle),
    )
  }, [issues, q])

  const startBranch = (i: Pick<IssueSummary, 'number' | 'title'>) => {
    const name = issueBranch(i.number, i.title)
    void act('Create branch', actions.createBranch(name), { done: t('Switched to {name}', { name }) })
  }
  const newIssue = async () => {
    try {
      await openUrl(`${await webUrl(root)}/issues/new`)
    } catch (e) {
      toast({ kind: 'error', title: t('Not on GitHub'), detail: e instanceof Error ? e.message : String(e) })
    }
  }

  if (error && !issues?.length)
    return (
      <Empty>
        <CircleDot size={28} />
        <div className="font-semibold text-primary">{t('Issues need a GitHub remote and the GitHub CLI signed in')}</div>
        <pre className="max-w-140 font-mono text-xs whitespace-pre-wrap">{error}</pre>
        <Button icon={RefreshCcw} onClick={() => void load()}>
          {t('Try again')}
        </Button>
      </Empty>
    )

  return (
    <>
      <div className={listColumn} style={{ width: list.size }}>
        <PaneHead title={t('Issues')} count={issues?.length ?? 0}>
          <IconButton icon={RefreshCcw} title={t('Refresh')} onClick={() => void load()} />
          <Button small kind="primary" icon={Plus} onClick={() => void newIssue()} title={t('Opens the new-issue page on GitHub')}>
            {t('New')}
          </Button>
        </PaneHead>
        <div className="flex flex-col gap-2 border-b border-subtle p-2">
          <div className="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-muted focus-within:ring-1 focus-within:ring-focus">
            <Search size={13} />
            <input
              className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-faint"
              placeholder={t('Filter by title, number, label, author')}
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
        <div className="flex-1 overflow-y-auto p-1.5">
          {issues === null && <Empty>{t('Loading…')}</Empty>}
          {issues && !shown.length && <Empty>{q ? t('No issue matches.') : t('No issues here.')}</Empty>}
          {shown.map(i => (
            <button
              key={i.number}
              type="button"
              onClick={() => setSelected(i.number)}
              className={cx('flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left', i.number === selected ? 'bg-selected' : 'hover:bg-hover')}
            >
              <span className="flex w-full items-start gap-2">
                {i.state === 'OPEN' ? (
                  <CircleDot size={15} className="mt-px shrink-0 text-status-added" />
                ) : (
                  <CircleCheck size={15} className="mt-px shrink-0 text-status-renamed" />
                )}
                <span className="min-w-0 flex-1 font-medium break-words">{i.title}</span>
              </span>
              <span className="flex w-full min-w-0 items-center gap-1.5 overflow-hidden pl-5.75 text-sm text-muted">
                <span className="shrink-0 font-mono">#{i.number}</span>
                {i.labels.slice(0, 3).map(l => (
                  <LabelChip key={l.name} {...l} />
                ))}
                <span className="min-w-2 flex-1" />
                {i.comments.length > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <MessageSquare size={12} />
                    {i.comments.length}
                  </span>
                )}
                <span className="shrink-0 whitespace-nowrap">{relTime(i.updatedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <Resizer panel={list} />
      <div className="flex min-w-0 flex-1 flex-col">{selected ? <IssuePane key={selected} n={selected} onBranch={startBranch} /> : <Empty>{t('Select an issue')}</Empty>}</div>
    </>
  )
}

function IssuePane({ n, onBranch }: { n: number; onBranch: (i: Pick<IssueSummary, 'number' | 'title'>) => void }) {
  const { root, toast } = useApp()
  const [issue, setIssue] = useState<IssueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const load = useCallback(
    () =>
      viewIssue(root, n)
        .then(setIssue)
        .catch(e => setError(String(e instanceof Error ? e.message : e))),
    [root, n],
  )
  useEffect(() => {
    void load()
  }, [load])

  const send = async () => {
    if (!reply.trim()) return
    setSending(true)
    try {
      await commentIssue(root, n, reply)
      setReply('')
      toast({ kind: 'ok', title: t('Comment posted') })
      await load()
    } catch (e) {
      toast({ kind: 'error', title: t('Comment failed'), detail: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }

  if (error) return <Empty>{error}</Empty>
  if (!issue) return <Empty>{t('Loading…')}</Empty>
  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-subtle px-5 pt-4 pb-3.5">
        <div className="flex items-start gap-2.5">
          <h2 className="m-0 min-w-0 flex-1 text-xl font-semibold break-words">
            {issue.title} <span className="font-normal text-muted">#{issue.number}</span>
          </h2>
          <Button kind="primary" icon={GitBranchPlus} onClick={() => onBranch(issue)} title={issueBranch(issue.number, issue.title)}>
            {t('Start branch')}
          </Button>
          <Button icon={ExternalLink} onClick={() => void openUrl(issue.url)}>
            GitHub
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <Avatar name={issue.author.login} size={16} />
          <span className="font-medium text-secondary">{issue.author.login}</span>
          <span>{t('opened {when}', { when: relTime(issue.createdAt) })}</span>
          {issue.assignees.length > 0 && <span>· {t('assigned to {who}', { who: issue.assignees.map(a => a.login).join(', ') })}</span>}
          {issue.labels.map(l => (
            <LabelChip key={l.name} {...l} />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <Markdown text={issue.body} />
        {issue.comments.map((c, i) => (
          <div key={i} className="mt-4 rounded-lg border border-subtle">
            <div className="flex items-center gap-1.5 border-b border-subtle bg-surface px-3 py-1.5 text-sm">
              <Avatar name={c.author.login} size={16} />
              <span className="font-medium">{c.author.login}</span>
              <span className="text-muted">{relTime(c.createdAt)}</span>
            </div>
            <div className="px-3 py-2">
              <Markdown text={c.body} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-end gap-2 border-t border-subtle p-3">
        <textarea
          className="h-16 min-w-0 flex-1 resize-none rounded-md border border-strong bg-app p-2 text-md outline-none focus:border-focus"
          placeholder={t('Leave a comment (Markdown)')}
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
          }}
        />
        <Button kind="primary" icon={Send} busy={sending} disabled={!reply.trim() || sending} onClick={() => void send()} title="⌘↩">
          {t('Comment')}
        </Button>
      </div>
    </>
  )
}
