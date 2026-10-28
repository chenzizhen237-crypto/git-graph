/**
 * The three-pane conflict editor: ours and theirs side by side for the
 * conflict in view, and the whole result below, editable. Saving writes the
 * file and stages it (marks it resolved).
 */
import { ArrowDownLeft, ArrowDownRight, Check, ChevronDown, ChevronUp, GitMerge, Merge, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { type Choice, type Conflict, hasMarkers, parseConflicts, readWorkFile, resolve, type Segment, writeWorkFile } from '../lib/conflicts'
import { cx } from '../lib/cx'
import { actions } from '../lib/git'
import { t } from '../lib/i18n'
import { closeSheet } from '../lib/sheets'
import { useApp } from '../state'
import { Sheet } from './Sheet'
import { Button, Empty } from './ui'

export function ConflictEditor({ path }: { path: string }) {
  const { root, act, ask, toast } = useApp()
  const [segments, setSegments] = useState<Segment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])
  const [at, setAt] = useState(0)
  // Once the result is edited by hand, it is the user's text; choices start again from the file.
  const [manual, setManual] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    readWorkFile(root, path)
      .then(text => {
        if (!live) return
        const s = parseConflicts(text)
        setSegments(s)
        setChoices(s.filter(x => x.kind === 'conflict').map(() => null))
      })
      .catch(e => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [root, path])

  const conflicts = useMemo(() => (segments ?? []).filter((s): s is Conflict => s.kind === 'conflict'), [segments])
  const result = manual ?? (segments ? resolve(segments, choices) : '')
  const open = choices.filter(c => c === null).length
  const cur = conflicts[at]

  const choose = (c: Choice) => {
    setManual(null)
    setChoices(cs => cs.map((x, i) => (i === at ? c : x)))
    // Move on to the next open conflict.
    const next = choices.findIndex((x, i) => i > at && x === null)
    if (next >= 0) setAt(next)
  }

  const save = async () => {
    if (
      hasMarkers(result) &&
      !(await ask({ title: t('Conflict markers are still in the file'), text: t('Save and mark it resolved anyway?'), confirm: t('Save anyway'), danger: true }))
    )
      return
    try {
      await writeWorkFile(root, path, result)
    } catch (e) {
      toast({ kind: 'error', title: t('Could not save {path}', { path }), detail: String(e) })
      return
    }
    if (await act('Mark resolved', actions.stage([path]), { done: t('{path} resolved', { path: path.split('/').pop() ?? path }) })) closeSheet()
  }

  const pane = (label: string, tone: string, text: string | undefined, side: 'ours' | 'theirs') => (
    <div className="flex min-w-0 flex-1 flex-col border-r border-subtle last:border-r-0">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-subtle bg-surface px-3 text-sm font-semibold">
        <span className={cx('h-3.5 w-0.75 rounded-full', tone)} />
        <span className="min-w-0 flex-1 truncate" title={label}>
          {label}
        </span>
        <Button small icon={side === 'ours' ? ArrowDownLeft : ArrowDownRight} disabled={!cur} onClick={() => choose(side)}>
          {side === 'ours' ? t('Take ours') : t('Take theirs')}
        </Button>
      </div>
      <pre className={cx('m-0 min-h-0 flex-1 overflow-auto p-3 font-mono text-code select-text', choices[at] === side && 'bg-diff-add-bg')}>{text ?? ''}</pre>
    </div>
  )

  return (
    <Sheet
      icon={GitMerge}
      title={t('Resolve {name}', { name: path.split('/').pop() ?? path })}
      sub={conflicts.length ? t(open === 1 ? '{n} conflict left' : '{n} conflicts left', { n: open }) : path}
      onClose={closeSheet}
      actions={
        <>
          <Button small icon={ChevronUp} disabled={at <= 0} onClick={() => setAt(a => a - 1)}>
            {t('Previous')}
          </Button>
          <Button small icon={ChevronDown} disabled={at >= conflicts.length - 1} onClick={() => setAt(a => a + 1)}>
            {t('Next')}
          </Button>
          <Button kind="primary" icon={Check} disabled={!segments} onClick={() => void save()}>
            {t('Save and mark resolved')}
          </Button>
        </>
      }
    >
      {error ? (
        <Empty>{error}</Empty>
      ) : !segments ? (
        <Empty>{t('Loading…')}</Empty>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          {conflicts.length === 0 ? (
            <div className="shrink-0 border-b border-subtle px-4 py-2.5 text-sm text-muted">
              {t('No conflict markers left in this file. Edit it below if you like, then save.')}
            </div>
          ) : (
            <>
              <div className="flex h-[38%] min-h-30 shrink-0 border-b border-subtle">
                {pane(t('Ours · {label}', { label: cur?.oursLabel ?? '' }), 'bg-status-conflict', cur?.ours, 'ours')}
                {pane(t('Theirs · {label}', { label: cur?.theirsLabel ?? '' }), 'bg-status-renamed', cur?.theirs, 'theirs')}
              </div>
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle bg-elevated px-3">
                <span className="text-sm font-semibold">{t('Conflict {i} of {n}', { i: at + 1, n: conflicts.length })}</span>
                {cur?.base !== undefined && <span className="truncate text-sm text-muted">{t('Base: {text}', { text: cur.base.trim().split('\n')[0] ?? '' })}</span>}
                <span className="flex-1" />
                <Button small icon={Merge} onClick={() => choose('both')}>
                  {t('Take both')}
                </Button>
                <Button small icon={RotateCcw} disabled={choices[at] === null && manual === null} onClick={() => choose(null)}>
                  {t('Reset')}
                </Button>
              </div>
            </>
          )}
          <div className="flex h-8 shrink-0 items-center gap-2 bg-surface px-3 text-sm font-semibold">
            <span className="h-3.5 w-0.75 rounded-full bg-accent" />
            {t('Result')}
            <span className="font-normal text-muted">{manual !== null ? t('edited by hand — taking a side starts again from the choices') : t('editable')}</span>
          </div>
          <textarea
            className="min-h-0 flex-1 resize-none bg-app p-3 font-mono text-code outline-none"
            spellCheck={false}
            value={result}
            onChange={e => setManual(e.target.value)}
          />
        </div>
      )}
    </Sheet>
  )
}
