/** Diff/File header, Diff/Hunk and the three line kinds, with conflict markers called out. */
import { AlignJustify, FileCode2, WrapText } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { cx } from '../lib/cx'
import { diffStats, parseDiff, type DiffLine } from '../lib/diff'
import { Empty, Segmented } from './ui'

type Side = 'ours' | 'theirs' | null
type Marked = { l: DiffLine; marker: 'ours' | 'mid' | 'theirs' | null; side: Side }

/** Marks conflict regions so `<<<<<<<`, `=======` and `>>>>>>>` lines and their halves read apart. */
function markConflicts(lines: DiffLine[]): Marked[] {
  let side: Side = null
  return lines.map(l => {
    const t = l.text
    if (t.startsWith('<<<<<<<')) {
      side = 'ours'
      return { l, marker: 'ours', side: null }
    }
    if (side && t.startsWith('=======')) {
      side = 'theirs'
      return { l, marker: 'mid', side: null }
    }
    if (side && t.startsWith('>>>>>>>')) {
      side = null
      return { l, marker: 'theirs', side: null }
    }
    return { l, marker: null, side }
  })
}

const ROW: Record<DiffLine['kind'], { row: string; num: string; sign: string }> = {
  ctx: { row: '', num: '', sign: '' },
  meta: { row: '', num: '', sign: '' },
  add: { row: 'bg-diff-add-bg', num: 'bg-diff-add-gutter', sign: 'text-status-added' },
  del: { row: 'bg-diff-del-bg', num: 'bg-diff-del-gutter', sign: 'text-status-deleted' },
}

export function DiffView({ path, text, loading, actions, empty }: { path: string; text: string; loading?: boolean; actions?: ReactNode; empty?: string }) {
  const hunks = useMemo(() => parseDiff(text), [text])
  const stats = useMemo(() => diffStats(hunks), [hunks])
  const [wrap, setWrap] = useState<'nowrap' | 'wrap'>('nowrap')
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-subtle">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle bg-surface px-2.5 font-mono">
        <FileCode2 size={14} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate" title={path}>
          {path}
        </span>
        {actions}
        <span className="text-sm font-semibold text-status-added">+{stats.added}</span>
        <span className="text-sm font-semibold text-status-deleted">−{stats.deleted}</span>
        <Segmented
          value={wrap}
          onChange={setWrap}
          options={[
            { value: 'nowrap', icon: AlignJustify, title: 'No wrap' },
            { value: 'wrap', icon: WrapText, title: 'Wrap lines' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-auto font-mono text-sm select-text">
        {!hunks.length ? (
          <Empty>{loading ? 'Loading…' : (empty ?? 'No textual changes (binary file or mode change)')}</Empty>
        ) : (
          <table className="min-w-full border-collapse">
            <tbody>
              {hunks.map((h, hi) => (
                <HunkRows key={hi} header={h.header} lines={h.lines} wrap={wrap === 'wrap'} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function HunkRows({ header, lines, wrap }: { header: string; lines: DiffLine[]; wrap: boolean }) {
  const marked = useMemo(() => markConflicts(lines), [lines])
  const num = 'w-9.5 min-w-9.5 pr-1.5 text-right align-top text-xs text-faint select-none'
  return (
    <>
      <tr>
        <td colSpan={4} className="h-6 bg-diff-hunk-bg px-2.5 text-xs font-medium whitespace-pre text-link">
          {header}
        </td>
      </tr>
      {marked.map(({ l, marker, side }, i) => {
        const s = ROW[l.kind]
        const theirs = marker === 'theirs' || side === 'theirs'
        return (
          <tr key={i} className={cx('leading-5', s.row, theirs && 'bg-diff-hunk-bg')}>
            <td className={cx(num, s.num)}>{l.old ?? ''}</td>
            <td className={cx(num, s.num)}>{l.new ?? ''}</td>
            <td className={cx('w-4.5 text-center align-top font-semibold select-none', s.sign)}>{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}</td>
            <td
              className={cx(
                'w-full pr-4',
                wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre',
                l.kind === 'meta' && 'text-muted italic',
                marker && 'font-semibold',
                marker && (marker === 'theirs' ? 'text-status-renamed' : 'text-status-conflict'),
              )}
            >
              {l.text || ' '}
            </td>
          </tr>
        )
      })}
    </>
  )
}
