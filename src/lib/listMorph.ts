/**
 * List changes as movement: a row that is in both lists travels to its new
 * place, one that left fades where it was, and a new one fades in once the
 * rest are moving. Rows are matched by key, so only what changed is touched.
 */
import { useLayoutEffect, useRef, useState } from 'react'

export const MORPH_MS = 420
const NEW_ROW_DELAY = 120
const SETTLE = 'cubic-bezier(0.16, 0.84, 0.24, 1)'

export type MorphPlan = { moved: Map<string, number>; left: string[] }

/** How many rows each kept key moved (positive = it used to be lower), and the keys that left. */
export function planMorph(before: readonly string[], after: readonly string[]): MorphPlan {
  const was = new Map(before.map((key, i) => [key, i]))
  const moved = new Map<string, number>()
  after.forEach((key, i) => {
    const from = was.get(key)
    if (from !== undefined) moved.set(key, from - i)
  })
  const kept = new Set(after)
  return { moved, left: before.filter(key => !kept.has(key)) }
}

/** A row from far away starts just off the visible list, not hundreds of rows up. */
export const clampTravel = (px: number, limit: number) => Math.max(-limit, Math.min(limit, px))

type Ghost = { key: string; node: React.ReactNode }

/**
 * Animates the `[data-row]` children of `box` when `keys` changes. `rendered`
 * holds the visible rows by key, and the rows that left come back as ghosts.
 */
export function useListMorph(box: React.RefObject<HTMLElement | null>, keys: readonly string[], rendered: React.RefObject<Map<string, React.ReactNode>>, rowHeight: number) {
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const shown = useRef({ keys, rendered: rendered.current })
  // Runs after every render, and compares against the last one.
  useLayoutEffect(() => {
    const last = shown.current
    shown.current = { keys, rendered: rendered.current }
    const el = box.current
    if (last.keys === keys || !el || !last.keys.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const { moved, left } = planMorph(last.keys, keys)
    for (const row of el.querySelectorAll<HTMLElement>('[data-row]')) {
      const rows = moved.get(row.dataset.row ?? '')
      if (rows === undefined) row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MORPH_MS - NEW_ROW_DELAY, delay: NEW_ROW_DELAY, easing: SETTLE, fill: 'backwards' })
      else if (rows) {
        const y = clampTravel(rows * rowHeight, el.clientHeight)
        row.animate([{ transform: `translateY(${y}px)` }, { transform: 'none' }], { duration: MORPH_MS, easing: SETTLE })
      }
    }
    const gone = new Set(left)
    setGhosts([...last.rendered].filter(([key]) => gone.has(key)).map(([key, node]) => ({ key, node })))
  })
  useLayoutEffect(() => {
    if (!ghosts.length) return
    const id = window.setTimeout(() => setGhosts([]), MORPH_MS)
    return () => window.clearTimeout(id)
  }, [ghosts])
  return ghosts
}
