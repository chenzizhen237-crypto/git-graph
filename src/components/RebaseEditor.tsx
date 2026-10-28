/**
 * Interactive rebase: the commits after the chosen one, oldest first, to reorder
 * by dragging and to pick, reword, squash, fix up or drop. Runs as one action,
 * so ⌘Z undoes it; a conflict stops it with the usual Continue / Abort banner.
 */
import { GripVertical, ListRestart, Play, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cx } from '../lib/cx'
import { t } from '../lib/i18n'
import { ACTIONS, planProblem, type RebaseAction, type RebaseStep, rebaseArgs, rebaseSteps } from '../lib/rebase'
import { closeSheet } from '../lib/sheets'
import { useApp } from '../state'
import { Sheet } from './Sheet'
import { Button, Empty } from './ui'

const TONE: Record<RebaseAction, string> = {
  pick: 'text-primary',
  reword: 'text-accent',
  squash: 'text-status-modified',
  fixup: 'text-status-modified',
  drop: 'text-status-deleted',
}

const HELP: Record<RebaseAction, string> = {
  pick: 'Keep the commit as it is',
  reword: 'Keep the commit, change its message',
  squash: 'Meld into the commit above, combining messages',
  fixup: 'Meld into the commit above, dropping this message',
  drop: 'Remove the commit',
}

export function RebaseEditor({ base }: { base: string }) {
  const { root, repo, act } = useApp()
  const [steps, setSteps] = useState<RebaseStep[] | null>(null)
  const [merges, setMerges] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    rebaseSteps(root, base)
      .then(r => {
        if (!live) return
        setSteps(r.steps)
        setMerges(r.merges)
      })
      .catch(e => live && setError(String(e instanceof Error ? e.message : e)))
    return () => {
      live = false
    }
  }, [root, base])

  const set = (i: number, patch: Partial<RebaseStep>) => setSteps(s => s!.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const move = (from: number, to: number) =>
    setSteps(s => {
      const next = [...s!]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!)
      return next
    })

  const problem = steps ? planProblem(steps) : null
  const dirty = !!repo?.changes.some(c => c.x !== '?')
  const start = async () => {
    if (!steps || problem) return
    // A stop for conflicts reports as a failure; the Continue / Abort banner takes over from there.
    await act('Interactive rebase', rebaseArgs(base, steps), { done: t('Rebase finished') })
    closeSheet()
  }

  const short = base.slice(0, 7)
  return (
    <Sheet
      icon={ListRestart}
      title={t('Interactive rebase')}
      sub={steps ? t(steps.length === 1 ? '{n} commit onto {sha}' : '{n} commits onto {sha}', { n: steps.length, sha: short }) : short}
      onClose={closeSheet}
      actions={
        <>
          <Button onClick={closeSheet}>{t('Cancel')}</Button>
          <Button
            kind="primary"
            icon={Play}
            disabled={!steps?.length || !!problem || dirty}
            title={dirty ? t('Commit or stash your changes first') : (problem ?? undefined)}
            onClick={() => void start()}
          >
            {t('Start rebase')}
          </Button>
        </>
      }
    >
      {error ? (
        <Empty>{error}</Empty>
      ) : !steps ? (
        <Empty>{t('Loading…')}</Empty>
      ) : !steps.length ? (
        <Empty>{t('No commits after {sha} on this branch.', { sha: short })}</Empty>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <p className="m-0 mb-3 max-w-180 text-sm leading-normal text-muted">
            {t('Drag to reorder: the top commit is applied first. squash and fixup meld a commit into the one above it.')}
          </p>
          {(merges > 0 || dirty || problem) && (
            <div className="mb-3 flex max-w-180 flex-col gap-1 text-sm text-secondary">
              {merges > 0 && (
                <Warn>{t(merges === 1 ? '{n} merge commit in this range will be flattened.' : '{n} merge commits in this range will be flattened.', { n: merges })}</Warn>
              )}
              {dirty && <Warn>{t('Commit or stash your changes first')}</Warn>}
              {problem && <Warn>{t(problem)}</Warn>}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {steps.map((s, i) => (
              <div
                key={s.hash}
                draggable
                onDragStart={e => {
                  setDrag(i)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={e => {
                  e.preventDefault()
                  if (drag !== null && drag !== i) {
                    move(drag, i)
                    setDrag(i)
                  }
                }}
                onDragEnd={() => setDrag(null)}
                className={cx('flex flex-col gap-2 rounded-md border border-subtle bg-elevated px-2.5 py-1.75', drag === i && 'opacity-50', s.action === 'drop' && 'opacity-60')}
              >
                <div className="flex items-center gap-2.5">
                  <GripVertical size={14} className="shrink-0 cursor-grab text-faint" />
                  <select
                    value={s.action}
                    onChange={e => set(i, { action: e.target.value as RebaseAction, reword: e.target.value === 'reword' ? (s.reword ?? s.message) : s.reword })}
                    title={t(HELP[s.action])}
                    className={cx('h-6.5 w-24 rounded-md border border-strong bg-app px-1.5 text-sm font-semibold outline-none', TONE[s.action])}
                  >
                    {ACTIONS.map(a => (
                      <option key={a} value={a} title={t(HELP[a])}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <span className="font-mono text-sm font-medium text-link">{s.short}</span>
                  <span className={cx('min-w-0 flex-1 truncate', s.action === 'drop' && 'line-through')} title={s.message}>
                    {s.subject}
                  </span>
                </div>
                {s.action === 'reword' && (
                  <textarea
                    className="ml-34 h-20 resize-y rounded-md border border-strong bg-app p-2 font-mono text-sm outline-none focus:border-focus"
                    value={s.reword ?? ''}
                    spellCheck={false}
                    onChange={e => set(i, { reword: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

const Warn = ({ children }: { children: string }) => (
  <span className="flex items-start gap-1.5">
    <TriangleAlert size={13} className="mt-0.5 shrink-0 text-status-modified" />
    {children}
  </span>
)
