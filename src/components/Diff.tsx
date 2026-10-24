/**
 * Diff/File header, Diff/Hunk and the line kinds, unified or side by side,
 * with conflict markers called out. Any diff pops out to fill the window.
 */
import { Columns2, FileCode2, Maximize2, Minimize2, Rows2, WrapText, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cx } from '../lib/cx'
import { type DiffLine, diffStats, type Hunk, pairLines, parseDiff } from '../lib/diff'
import { t } from '../lib/i18n'
import { updateSettings, useSettings } from '../lib/settings'
import { Empty, IconButton, Segmented } from './ui'

type Side = 'ours' | 'theirs' | null
type Marked = DiffLine & { marker?: 'ours' | 'mid' | 'theirs'; side?: Side }

/** Marks conflict regions so `<<<<<<<`, `=======` and `>>>>>>>` lines and their halves read apart. */
function markConflicts(lines: DiffLine[]): Marked[] {
  let side: Side = null
  return lines.map(l => {
    const t = l.text
    if (t.startsWith('<<<<<<<')) {
      side = 'ours'
      return { ...l, marker: 'ours' }
    }
    if (side && t.startsWith('=======')) {
      side = 'theirs'
      return { ...l, marker: 'mid' }
    }
    if (side && t.startsWith('>>>>>>>')) {
      side = null
      return { ...l, marker: 'theirs' }
    }
    return { ...l, side }
  })
}

const TONE: Record<DiffLine['kind'], { row: string; num: string; sign: string }> = {
  ctx: { row: '', num: '', sign: '' },
  meta: { row: '', num: '', sign: '' },
  add: { row: 'bg-diff-add-bg', num: 'bg-diff-add-gutter', sign: 'text-status-added' },
  del: { row: 'bg-diff-del-bg', num: 'bg-diff-del-gutter', sign: 'text-status-deleted' },
}
const numCell = 'w-10 min-w-10 pr-1.5 text-right align-top text-xs text-faint select-none'
const signFor = (k: DiffLine['kind']) => (k === 'add' ? '+' : k === 'del' ? '−' : '')

type Mode = 'unified' | 'split'

/** Narrower than this, two columns of code are unreadable. */
const SPLIT_MIN = 760

export function DiffView({
  path,
  text,
  loading,
  actions,
  empty,
  popped,
  onClose,
}: {
  path: string
  text: string
  loading?: boolean
  actions?: ReactNode
  empty?: string
  popped?: boolean
  onClose?: () => void
}) {
  const hunks = useMemo(() => parseDiff(text), [text])
  const stats = useMemo(() => diffStats(hunks), [hunks])
  const { diffMode: mode, diffWrap: wrap } = useSettings()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(Infinity)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Side by side needs room: a narrow panel shows unified, and asking for split pops the diff out.
  const narrow = width < SPLIT_MIN
  const shown: Mode = narrow ? 'unified' : mode
  const setMode = (m: Mode) => {
    updateSettings({ diffMode: m })
    if (m === 'split' && narrow && !popped) setOpen(true)
  }

  useEffect(() => {
    if (!popped) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popped, onClose])

  const body = (
    <div ref={box} className={cx('flex min-h-0 flex-1 flex-col', !popped && 'border-t border-subtle')}>
      <div className={cx('flex shrink-0 items-center gap-2 border-b border-subtle bg-surface px-2.5 font-mono', popped ? 'h-11' : 'h-9')}>
        <FileCode2 size={14} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate" title={path}>
          {path}
        </span>
        {actions}
        <span className="text-sm font-semibold text-status-added">+{stats.added}</span>
        <span className="text-sm font-semibold text-status-deleted">−{stats.deleted}</span>
        <Segmented
          value={shown}
          onChange={setMode}
          options={[
            { value: 'unified', icon: Rows2, title: t('Unified') },
            { value: 'split', icon: Columns2, title: narrow ? t('Side by side (opens full window)') : t('Side by side') },
          ]}
        />
        <IconButton icon={WrapText} size={14} small active={wrap} title={t('Wrap long lines')} onClick={() => updateSettings({ diffWrap: !wrap })} />
        {popped ? (
          <>
            <IconButton icon={Minimize2} size={14} small title={t('Back to panel (esc)')} onClick={onClose} />
            <IconButton icon={X} size={14} small title={t('Close (esc)')} onClick={onClose} />
          </>
        ) : (
          <IconButton icon={Maximize2} size={14} small title={t('Pop out to fill the window')} onClick={() => setOpen(true)} />
        )}
      </div>
      <div className="flex-1 overflow-auto font-mono text-sm select-text">
        {!hunks.length ? (
          <Empty>{loading ? t('Loading…') : (empty ?? t('No textual changes (binary file or mode change)'))}</Empty>
        ) : (
          <table className={cx('min-w-full border-collapse', shown === 'split' && 'w-full table-fixed')}>
            {shown === 'split' && (
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-10" />
                <col />
              </colgroup>
            )}
            <tbody>{hunks.map((h, hi) => (shown === 'split' ? <SplitHunk key={hi} hunk={h} wrap={wrap} /> : <UnifiedHunk key={hi} hunk={h} wrap={wrap} />))}</tbody>
          </table>
        )}
      </div>
    </div>
  )

  if (popped) return body
  return (
    <>
      {body}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex bg-scrim p-6" onMouseDown={() => setOpen(false)}>
            <div
              className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-strong bg-app shadow-[0_20px_50px_var(--shadow)]"
              onMouseDown={e => e.stopPropagation()}
            >
              <DiffView path={path} text={text} loading={loading} actions={actions} empty={empty} popped onClose={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function HunkHeader({ header, span }: { header: string; span: number }) {
  return (
    <tr>
      <td colSpan={span} className="h-6 bg-diff-hunk-bg px-2.5 text-xs font-medium whitespace-pre text-link">
        {header}
      </td>
    </tr>
  )
}

function codeClass(l: Marked, wrap: boolean) {
  return cx(
    'pr-4',
    wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre',
    l.kind === 'meta' && 'text-muted italic',
    l.marker && 'font-semibold',
    l.marker && (l.marker === 'theirs' ? 'text-status-renamed' : 'text-status-conflict'),
  )
}

function UnifiedHunk({ hunk, wrap }: { hunk: Hunk; wrap: boolean }) {
  const lines = useMemo(() => markConflicts(hunk.lines), [hunk])
  return (
    <>
      <HunkHeader header={hunk.header} span={4} />
      {lines.map((l, i) => {
        const t = TONE[l.kind]
        return (
          <tr key={i} className={cx('leading-5', t.row, (l.marker === 'theirs' || l.side === 'theirs') && 'bg-diff-hunk-bg')}>
            <td className={cx(numCell, t.num)}>{l.old ?? ''}</td>
            <td className={cx(numCell, t.num)}>{l.new ?? ''}</td>
            <td className={cx('w-4.5 text-center align-top font-semibold select-none', t.sign)}>{signFor(l.kind)}</td>
            <td className={cx('w-full', codeClass(l, wrap))}>{l.text || ' '}</td>
          </tr>
        )
      })}
    </>
  )
}

function SplitHunk({ hunk, wrap }: { hunk: Hunk; wrap: boolean }) {
  const rows = useMemo(() => pairLines(hunk.lines), [hunk])
  const half = (l: DiffLine | null, side: 'old' | 'new', key: string) => {
    if (!l) return [<td key={`${key}n`} className={cx(numCell, 'bg-surface')} />, <td key={`${key}c`} className="bg-surface" />]
    const t = TONE[l.kind]
    return [
      <td key={`${key}n`} className={cx(numCell, t.num)}>
        {(side === 'old' ? l.old : l.new) ?? ''}
      </td>,
      <td key={`${key}c`} className={cx('overflow-hidden pl-1.5', t.row, codeClass(l, wrap))}>
        <span className={cx('mr-1 font-semibold select-none', t.sign)}>{signFor(l.kind) || ' '}</span>
        {l.text || ' '}
      </td>,
    ]
  }
  return (
    <>
      <HunkHeader header={hunk.header} span={4} />
      {rows.map(([a, b], i) => (
        <tr key={i} className="leading-5">
          {half(a, 'old', 'a')}
          {half(b, 'new', 'b')}
        </tr>
      ))}
    </>
  )
}
