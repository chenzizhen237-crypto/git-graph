/**
 * The flexible layout: panels whose size the user drags, remembered per
 * panel. A Resizer sits between two flex siblings and resizes the one named
 * by `side` (the panel before it or after it). Double-click resets.
 */
import { useCallback, useRef, useState } from 'react'

import { cx } from '../lib/cx'

const read = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(`size:${key}`))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

/** A panel size that survives restarts. */
export function usePanelSize(key: string, initial: number, min: number, max: number) {
  const [size, setSize] = useState(() => Math.min(max, Math.max(min, read(key, initial))))
  const set = useCallback(
    (next: number, save = false) => {
      const v = Math.round(Math.min(max, Math.max(min, next)))
      setSize(v)
      if (save)
        try {
          localStorage.setItem(`size:${key}`, String(v))
        } catch {}
    },
    [key, min, max],
  )
  const reset = useCallback(() => set(initial, true), [set, initial])
  return { size, set, reset }
}

export type PanelSize = ReturnType<typeof usePanelSize>

/**
 * A drag handle between two panels. `side: 'before'` resizes the panel to
 * its left (or above), `'after'` the one to its right (or below).
 */
export function Resizer({ panel, axis = 'x', side = 'before' }: { panel: PanelSize; axis?: 'x' | 'y'; side?: 'before' | 'after' }) {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ pos: 0, size: 0 })
  const sign = side === 'before' ? 1 : -1
  const horizontal = axis === 'x'

  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> cannot hold the drag handlers and hover line
    <div
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      title="Drag to resize · double-click to reset"
      className={cx('group relative z-20 shrink-0', horizontal ? '-mx-[3px] w-1.5 cursor-col-resize' : '-my-[3px] h-1.5 cursor-row-resize')}
      onDoubleClick={panel.reset}
      onPointerDown={e => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { pos: horizontal ? e.clientX : e.clientY, size: panel.size }
        setDragging(true)
        document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
      }}
      onPointerMove={e => {
        if (!dragging) return
        const delta = (horizontal ? e.clientX : e.clientY) - start.current.pos
        panel.set(start.current.size + sign * delta)
      }}
      onPointerUp={e => {
        if (!dragging) return
        const delta = (horizontal ? e.clientX : e.clientY) - start.current.pos
        panel.set(start.current.size + sign * delta, true)
        setDragging(false)
        document.body.style.cursor = ''
      }}
    >
      <div
        className={cx(
          'absolute bg-focus opacity-0 transition-opacity group-hover:opacity-100',
          horizontal ? 'inset-y-0 left-[2px] w-0.5' : 'inset-x-0 top-[2px] h-0.5',
          dragging && 'opacity-100',
        )}
      />
    </div>
  )
}
