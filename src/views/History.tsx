/** The History view: filter bar, the commit graph and the commit inspector. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { GraphCell, graphWidth, type NodeKind, ROW_H } from '../components/GraphCell'
import { useMenus } from '../components/menus'
import { Resizer, useColumnSize, usePanelSize } from '../components/Split'
import { TerminalSlot } from '../components/Terminal'
import { Avatar, Chip, CiIcon, caps, Empty, refChips, StageDot } from '../components/ui'
import { cachedCi, type CiState, commitStates } from '../lib/actions'
import { cx } from '../lib/cx'
import { commitDate } from '../lib/dates'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import type { LogRow } from '../lib/types'
import { useApp, useRemoteNames } from '../state'
import { FilterBar } from './history/FilterBar'
import { Inspector } from './history/Inspector'

/** Drag handle on a column header's edge; `side: 'after'` means the column is to the right of its handle. */
const edge = (side: 'before' | 'after') => cx('absolute! inset-y-0', side === 'before' ? '-right-1' : '-left-1')

export function HistoryView() {
  const showInspector = useSettings(s => s.inspector)
  const [showGraph, setShowGraph] = useState(true)
  const inspector = usePanelSize('inspector', 420, 300, 1200)
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <FilterBar showGraph={showGraph} setShowGraph={setShowGraph} />
        <LogList showGraph={showGraph} />
        <TerminalSlot />
      </div>
      {showInspector && (
        <>
          <Resizer panel={inspector} side="after" />
          <Inspector width={inspector.size} />
        </>
      )}
    </>
  )
}

function nodeKind(row: LogRow, head: string): NodeKind {
  if (row.hash === head) return 'head'
  return row.parents.length > 1 ? 'merge' : 'commit'
}

const rowClass = 'absolute inset-x-0 flex h-row items-center gap-2 pr-3 pl-1'

function LogList({ showGraph }: { showGraph: boolean }) {
  const { root, repo, selected, setSelected, setView, loadMore, error, openMenu } = useApp()
  const remotes = useRemoteNames()
  const menus = useMenus()
  const cols = useSettings(s => s.graph)
  const [ci, setCi] = useState<Map<string, CiState>>(new Map())
  const [ciOff, setCiOff] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState(0)
  const [height, setHeight] = useState(800)
  const asking = useRef(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page of rows arrived; allow asking for the next one
  useEffect(() => {
    asking.current = false
  }, [repo?.rows.length])

  // Select HEAD when nothing is selected yet.
  useEffect(() => {
    if (repo && !selected && repo.rows.length) setSelected(repo.rows.find(r => r.hash === repo.head)?.hash ?? repo.rows[0]!.hash)
  }, [repo, selected, setSelected])

  const rows = repo?.rows ?? []
  const offset = repo?.work ? 1 : 0
  const total = rows.length + offset
  // The observed height can be stale: measured as 0 while the list was hidden
  // or squeezed, it would render only the overscan rows and leave the rest of
  // the graph blank. The window height is a safe floor (a few extra rows).
  const view = Math.max(height, window.innerHeight)
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 10)
  const last = Math.min(total, Math.ceil((scroll + view) / ROW_H) + 10)
  // Absolute dates need room for the date and the time.
  const graphCol = useColumnSize('col-graph', repo ? graphWidth(repo.laneCount) : 56, 56, 800)
  const authorCol = useColumnSize('col-author', 130, 60, 400)
  const dateCol = useColumnSize('col-date', cols.dates === 'relative' ? 84 : cols.dateFormat === 'locale' ? 144 : 132, 56, 300)
  const shaCol = useColumnSize('col-sha', 62, 44, 300)

  // CI state for the rows on screen: one batched request after scrolling settles,
  // then again every 30s while any of them is still running.
  const visible = rows.slice(Math.max(0, first - offset), Math.max(0, last - offset)).map(r => r.hash)
  const visibleKey = visible.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the visible SHAs, not the array identity
  useEffect(() => {
    if (ciOff || !visible.length) return
    let live = true
    const ask = () =>
      commitStates(root, visible)
        .then(m => live && setCi(prev => new Map([...prev, ...m])))
        .catch(() => live && setCiOff(true))
    const soon = window.setTimeout(ask, 250)
    const again = window.setInterval(() => {
      if (visible.some(h => cachedCi(h) === 'pending')) void ask()
    }, 30_000)
    return () => {
      live = false
      window.clearTimeout(soon)
      window.clearInterval(again)
    }
  }, [root, visibleKey, ciOff])

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setScroll(el.scrollTop)
    setHeight(el.clientHeight)
    if (repo?.hasMore && !asking.current && el.scrollTop + el.clientHeight > el.scrollHeight - 600) {
      asking.current = true
      loadMore()
    }
  }

  const move = useCallback(
    (delta: number) => {
      if (!rows.length) return
      const at = rows.findIndex(r => r.hash === selected)
      const next = rows[Math.min(rows.length - 1, Math.max(0, at + delta))]!
      setSelected(next.hash)
      const top = (rows.indexOf(next) + offset) * ROW_H
      const el = box.current
      if (el && (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight)) el.scrollTop = top - el.clientHeight / 2
    },
    [rows, selected, setSelected, offset],
  )

  if (error && !repo) return <Empty>{error}</Empty>
  if (repo && !rows.length && !repo.work) return <Empty>{t(repo.head ? 'No commits match these filters.' : 'No commits yet.')}</Empty>

  const showCi = cols.ci && !ciOff
  const items = []
  for (let i = first; i < last; i++) {
    const top = i * ROW_H
    if (repo?.work && i === 0) {
      items.push(
        <div key="work" className={cx(rowClass, 'hover:bg-hover')} style={{ top }} onClick={() => setView('changes')}>
          {showGraph && (
            <div className="h-full min-w-14 overflow-hidden" style={{ width: graphCol.size }}>
              <GraphCell g={repo.work} laneCount={repo.laneCount} kind="work" />
            </div>
          )}
          <div className="flex min-w-40 flex-1 items-center gap-1.5 italic">
            <StageDot />
            <span className="font-medium text-secondary">{t(repo.changes.length === 1 ? '{n} uncommitted change' : '{n} uncommitted changes', { n: repo.changes.length })}</span>
            <span className="text-muted">· {t('open Changes')}</span>
          </div>
          <span className="text-sm text-faint">⌘2</span>
        </div>,
      )
      continue
    }
    const r = rows[i - offset]!
    const kind = nodeKind(r, repo!.head)
    const chips = refChips(r.refs, remotes).filter(c => cols.tags || c.kind !== 'tag')
    const on = r.hash === selected
    const message = r.body ? `${r.subject}\n\n${r.body}` : r.subject
    items.push(
      <div
        key={r.hash}
        className={cx(rowClass, on ? 'bg-selected group-focus:shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-hover')}
        style={{ top }}
        onClick={() => setSelected(r.hash)}
        onContextMenu={e => {
          setSelected(r.hash)
          openMenu(e, menus.commit(r))
        }}
      >
        {showGraph && (
          <div className="h-full min-w-14 overflow-hidden" style={{ width: graphCol.size }}>
            <GraphCell g={r.graph} laneCount={repo!.laneCount} kind={kind} />
          </div>
        )}
        <div className="flex min-w-40 flex-1 items-center gap-1.5 overflow-hidden">
          {chips.map(c => (
            <Chip key={c.kind + c.name} kind={c.kind} name={c.name} synced={c.synced} />
          ))}
          <span className={cx('min-w-24 truncate', kind === 'head' && 'font-semibold', kind === 'merge' && 'text-secondary')} title={message}>
            {r.subject}
          </span>
          {r.body && (
            <span className="min-w-0 shrink-[4] truncate text-muted" title={message}>
              {r.body}
            </span>
          )}
        </div>
        {cols.author && (
          <div className="flex shrink-0 items-center gap-1.5 text-sm text-secondary" style={{ width: authorCol.size }}>
            <Avatar name={r.author} />
            <span className="truncate" title={r.author}>
              {r.author}
            </span>
          </div>
        )}
        {cols.date && (
          <span className="shrink-0 truncate text-sm whitespace-nowrap text-muted" style={{ width: dateCol.size }} title={new Date(r.time * 1000).toLocaleString()}>
            {commitDate(r.time * 1000)}
          </span>
        )}
        {showCi && <CiIcon state={ci.get(r.hash)} />}
        {cols.sha && (
          <span className="shrink-0 truncate text-right font-mono text-sm font-medium text-link" style={{ width: shaCol.size }} title={r.hash}>
            {r.short}
          </span>
        )}
      </div>,
    )
  }

  return (
    <>
      <div className={cx('flex h-6.5 shrink-0 items-center gap-2 border-b border-subtle pr-3 tracking-[0.6px]', showGraph ? 'pl-1' : 'pl-4', caps, 'font-semibold')}>
        {showGraph && (
          <span className="relative min-w-14 pl-3" style={{ width: graphCol.size }}>
            {t('GRAPH')}
            <Resizer panel={graphCol} className={edge('before')} />
          </span>
        )}
        <span className="min-w-40 flex-1 truncate">{t('DESCRIPTION')}</span>
        {cols.author && (
          <span className="relative shrink-0" style={{ width: authorCol.size }}>
            {t('AUTHOR')}
            <Resizer panel={authorCol} side="after" className={edge('after')} />
          </span>
        )}
        {cols.date && (
          <span className="relative shrink-0" style={{ width: dateCol.size }}>
            {t('DATE')}
            <Resizer panel={dateCol} side="after" className={edge('after')} />
          </span>
        )}
        {showCi && <span className="w-3.5 shrink-0" />}
        {cols.sha && (
          <span className="relative shrink-0 text-right" style={{ width: shaCol.size }}>
            {t('SHA')}
            <Resizer panel={shaCol} side="after" className={edge('after')} />
          </span>
        )}
      </div>
      <div
        className="group relative flex-1 overflow-y-auto outline-none"
        ref={box}
        role="listbox"
        aria-label={t('Commits')}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault()
            move(1)
          }
          if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault()
            move(-1)
          }
          if (e.key === 'PageDown') {
            e.preventDefault()
            move(20)
          }
          if (e.key === 'PageUp') {
            e.preventDefault()
            move(-20)
          }
        }}
      >
        <div className="relative" style={{ height: total * ROW_H + (repo?.hasMore ? 40 : 0) }}>
          {items}
          {repo?.hasMore && (
            <div className="absolute inset-x-0 flex h-10 items-center justify-center text-sm text-muted" style={{ top: total * ROW_H }}>
              {t('Loading older commits…')}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
