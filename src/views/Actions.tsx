/**
 * The Actions view (Nib: Desktop 12): workflow runs, a run's jobs, and a
 * job's log by step. Runs that are still going refresh every 10 seconds.
 */
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  CircleStop,
  CircleX,
  ExternalLink,
  LoaderCircle,
  type LucideIcon,
  RefreshCcw,
  RotateCcw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Resizer, usePanelSize } from '../components/Split'
import { Button, Chip, Empty, IconButton } from '../components/ui'
import { duration, type Job, jobLog, type LogSection, listRuns, type Run, type RunState, runActions, runJobs, runState } from '../lib/actions'
import { cx } from '../lib/cx'
import { openUrl } from '../lib/github'
import { t, timeAgo } from '../lib/i18n'
import { useApp } from '../state'
import { listColumn, PaneHead } from './Changes'

const STATE: Record<RunState, { icon: LucideIcon; className: string; label: string }> = {
  pass: { icon: CircleCheck, className: 'text-status-added', label: 'Succeeded' },
  fail: { icon: CircleX, className: 'text-status-deleted', label: 'Failed' },
  running: { icon: LoaderCircle, className: 'animate-[spin_2s_linear_infinite] text-status-modified', label: 'Running' },
  queued: { icon: CircleDashed, className: 'text-muted', label: 'Queued' },
  cancelled: { icon: CircleStop, className: 'text-muted', label: 'Cancelled' },
  skipped: { icon: CircleSlash, className: 'text-muted', label: 'Skipped' },
}

function StateIcon({ state, size = 15 }: { state: RunState; size?: number }) {
  const s = STATE[state]
  return <s.icon size={size} className={cx('shrink-0', s.className)} aria-label={t(s.label)} />
}

type Filter = 'all' | 'branch' | 'failed'

/** Runs triggered by a tag push carry the tag as their branch. */
const isTagRef = (ref: string) => /^v\d/.test(ref)

export function ActionsView() {
  const { root, repo, act } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const list = usePanelSize('runs-list', 380, 280, 800)
  const branch = repo?.branch

  const load = useCallback(async () => {
    try {
      const r = await listRuns(root, filter === 'branch' ? branch : undefined)
      setRuns(r)
      setError(null)
      setSelected(s => (s && r.some(x => x.id === s) ? s : (r.find(x => runState(x) === 'fail')?.id ?? r[0]?.id ?? null)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRuns(r => r ?? [])
    }
  }, [root, filter, branch])

  useEffect(() => {
    void load()
  }, [load])
  // Keep live runs current.
  const live = runs?.some(r => r.status !== 'completed')
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => void load(), 10_000)
    return () => window.clearInterval(id)
  }, [live, load])

  const shown = useMemo(() => (filter === 'failed' ? (runs ?? []).filter(r => runState(r) === 'fail') : (runs ?? [])), [runs, filter])
  const run = runs?.find(r => r.id === selected)

  if (error && !runs?.length)
    return (
      <Empty>
        <CircleSlash size={28} />
        <div className="font-semibold text-primary">{t('Actions need a GitHub remote and the GitHub CLI signed in')}</div>
        <pre className="max-w-140 font-mono text-xs whitespace-pre-wrap">{error}</pre>
        <Button icon={RefreshCcw} onClick={() => void load()}>
          {t('Try again')}
        </Button>
      </Empty>
    )

  const runGh = async (label: string, args: string[], done: string) => {
    if (await act(label, args, { tool: 'gh', done })) window.setTimeout(() => void load(), 1500)
  }

  return (
    <>
      <div className={listColumn} style={{ width: list.size }}>
        <PaneHead title={t('Actions')} count={shown.length}>
          <IconButton icon={RefreshCcw} title={t('Refresh')} onClick={() => void load()} />
          <IconButton icon={ExternalLink} title={t('Open Actions on GitHub')} onClick={() => run && void openUrl(run.html_url.replace(/\/runs\/\d+.*$/, ''))} />
        </PaneHead>
        <div className="flex gap-1 border-b border-subtle p-2">
          {(
            [
              ['all', 'All runs'],
              ['branch', 'This branch'],
              ['failed', 'Failed'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={cx('h-6 rounded-md px-2 text-sm', filter === v ? 'bg-selected font-semibold text-ref-head' : 'text-secondary hover:bg-hover')}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {runs === null && <Empty>{t('Loading runs…')}</Empty>}
          {runs && !shown.length && <Empty>{t('No workflow runs.')}</Empty>}
          {shown.map(r => {
            const isTag = isTagRef(r.head_branch) && r.head_branch !== repo?.branch
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className={cx('flex w-full flex-col gap-1 rounded-md px-3 py-2.25 text-left', selected === r.id ? 'bg-selected' : 'hover:bg-hover')}
              >
                <span className="flex w-full items-center gap-2">
                  <StateIcon state={runState(r)} />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.display_title}</span>
                </span>
                <span className="flex w-full items-center gap-1.5 pl-5.75 text-sm text-muted">
                  <span className="font-semibold text-secondary">{r.name}</span>
                  <Chip kind={isTag ? 'tag' : r.head_branch === repo?.branch ? 'head' : 'local'} name={r.head_branch} />
                  <span>
                    #{r.run_number} · {r.event}
                  </span>
                  <span className="flex-1" />
                  <span className="whitespace-nowrap">
                    {duration(r.run_started_at, r.status === 'completed' ? r.updated_at : null)} · {timeAgo(new Date(r.run_started_at).getTime())}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <Resizer panel={list} />
      <div className="flex min-w-0 flex-1 flex-col">{run ? <RunPane key={run.id} run={run} onAction={runGh} /> : <Empty>{t('Select a run')}</Empty>}</div>
    </>
  )
}

function RunPane({ run, onAction }: { run: Run; onAction: (label: string, args: string[], done: string) => Promise<void> }) {
  const { root } = useApp()
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const panel = usePanelSize('jobs-list', 270, 200, 500)
  const state = runState(run)

  const load = useCallback(async () => {
    const j = await runJobs(root, run.id).catch(() => [] as Job[])
    setJobs(j)
    setJobId(id => (id && j.some(x => x.id === id) ? id : (j.find(x => runState(x) === 'fail')?.id ?? j[0]?.id ?? null)))
  }, [root, run.id])
  // Reload with the run (its updated_at changes as jobs progress).
  // biome-ignore lint/correctness/useExhaustiveDependencies: updated_at is the trigger
  useEffect(() => {
    void load()
  }, [load, run.updated_at])

  const failed = jobs?.some(j => runState(j) === 'fail')
  const job = jobs?.find(j => j.id === jobId)

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-subtle px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2.5">
          <StateIcon state={state} size={18} />
          <h2 className="m-0 min-w-0 flex-1 truncate text-xl font-semibold">{run.display_title}</h2>
          {state === 'running' || state === 'queued' ? (
            <Button icon={CircleStop} onClick={() => void onAction('Cancel run', runActions.cancel(run.id), 'Run cancelled')}>
              {t('Cancel')}
            </Button>
          ) : (
            <>
              {failed && (
                <Button kind="primary" icon={RotateCcw} onClick={() => void onAction('Re-run failed jobs', runActions.rerunFailed(run.id), 'Re-running failed jobs')}>
                  {t('Re-run failed jobs')}
                </Button>
              )}
              <Button icon={RotateCcw} onClick={() => void onAction('Re-run all jobs', runActions.rerunAll(run.id), 'Re-running all jobs')}>
                {t('Re-run all')}
              </Button>
            </>
          )}
          <Button icon={ExternalLink} onClick={() => void openUrl(run.html_url)}>
            GitHub
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-7 text-sm text-muted">
          <span className="font-semibold text-secondary">
            {run.name} #{run.run_number}
            {run.run_attempt > 1 ? ` · ${t('attempt {n}', { n: run.run_attempt })}` : ''}
          </span>
          <Chip kind={isTagRef(run.head_branch) ? 'tag' : 'local'} name={run.head_branch} />
          <span className="font-mono font-medium text-link">{run.head_sha.slice(0, 7)}</span>
          <span>
            · {run.event} · {t('started {when}', { when: timeAgo(new Date(run.run_started_at).getTime()) })} ·{' '}
            {duration(run.run_started_at, run.status === 'completed' ? run.updated_at : null)}
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="shrink-0 overflow-y-auto border-r border-subtle p-1.5" style={{ width: panel.size }}>
          <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold tracking-[0.7px] text-muted">{t('JOBS')}</div>
          {jobs === null && <Empty>{t('Loading…')}</Empty>}
          {jobs?.map(j => (
            <button
              key={j.id}
              type="button"
              onClick={() => setJobId(j.id)}
              className={cx('flex h-7.5 w-full items-center gap-2 rounded-md px-2.5 text-left', j.id === jobId ? 'bg-selected' : 'hover:bg-hover')}
              title={j.name}
            >
              <StateIcon state={runState(j)} />
              <span className="min-w-0 flex-1 truncate">{j.name}</span>
              <span className="text-sm text-muted">{j.started_at && runState(j) !== 'skipped' ? duration(j.started_at, j.completed_at) : '—'}</span>
            </button>
          ))}
        </div>
        <Resizer panel={panel} />
        <div className="flex min-w-0 flex-1 flex-col">
          {job ? (
            <JobLog key={`${job.id}-${job.status}`} job={job} onRerun={() => void onAction('Re-run job', runActions.rerunJob(job.id), 'Re-running job')} />
          ) : (
            <Empty>{t('Select a job')}</Empty>
          )}
        </div>
      </div>
    </>
  )
}

function JobLog({ job, onRerun }: { job: Job; onRerun: () => void }) {
  const { root } = useApp()
  const [sections, setSections] = useState<LogSection[] | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const firstError = useRef<HTMLDivElement>(null)
  const done = job.status === 'completed'

  useEffect(() => {
    if (!done) return
    let live = true
    jobLog(root, job.id)
      .then(s => {
        if (!live) return
        setSections(s)
        // Open the failing step, or the last one when nothing failed.
        const failing = s.findIndex(x => x.failed)
        setOpen(new Set([failing >= 0 ? failing : s.length - 1]))
      })
      .catch(e => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [root, job.id, done])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll once the log has rendered
  useEffect(() => {
    firstError.current?.scrollIntoView({ block: 'center' })
  }, [sections])

  if (!done)
    return (
      <Empty>
        <LoaderCircle size={20} className="animate-spin" />
        {t('The log appears when the job finishes.')}
        <Button icon={ExternalLink} onClick={() => void openUrl(job.html_url)}>
          {t('Follow it live on GitHub')}
        </Button>
      </Empty>
    )
  if (error) return <Empty>{error}</Empty>
  if (!sections) return <Empty>{t('Loading log…')}</Empty>

  const firstErr = sections.flatMap(s => s.lines).find(l => l.error)?.n
  return (
    <div className="flex-1 overflow-auto">
      <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-subtle bg-app px-3">
        <StateIcon state={runState(job)} />
        <span className="min-w-0 flex-1 truncate font-medium">{job.name}</span>
        {runState(job) === 'fail' && (
          <Button small icon={RotateCcw} onClick={onRerun}>
            {t('Re-run job')}
          </Button>
        )}
      </div>
      {sections.map((s, i) => {
        const isOpen = open.has(i)
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() =>
                setOpen(o => {
                  const n = new Set(o)
                  if (!n.delete(i)) n.add(i)
                  return n
                })
              }
              className="flex h-7.5 w-full items-center gap-2 border-b border-subtle bg-surface px-2.5 text-left"
            >
              {isOpen ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
              {s.failed ? <CircleX size={15} className="text-status-deleted" /> : <CircleCheck size={15} className="text-status-added" />}
              <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
              <span className="text-sm text-muted">{s.lines.length}</span>
            </button>
            {isOpen && (
              <div className="py-1 font-mono text-code select-text">
                {s.lines.map(l => {
                  return (
                    <div
                      key={l.n}
                      ref={l.n === firstErr ? firstError : undefined}
                      className={cx('flex gap-3 px-2.5 leading-5', l.error && 'bg-diff-del-bg font-semibold text-status-deleted')}
                    >
                      <span className="w-10 shrink-0 text-right text-xs leading-5 text-faint select-none">{l.n}</span>
                      <span className={cx('min-w-0 break-all whitespace-pre-wrap', !l.error && 'text-secondary')}>{l.text || ' '}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
