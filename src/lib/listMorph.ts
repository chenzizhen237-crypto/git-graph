/**
 * List changes as a map from list A to list B. Rows are opaque cards, so text
 * never shows through. A row in both lists travels on top along its path to its
 * new place, even off screen, and the time grows with the distance. A new row
 * wipes across its slot, covering the old one, staggered down the list. Rows are
 * matched by key, so only what changed is touched.
 */
import { useLayoutEffect, useRef, useState } from 'react'

const MIN_MS = 800
const MAX_MS = 1500
/** Extra milliseconds for each pixel of the longest visible path. */
const MS_PER_PX = 0.4
const CURVE = 'cubic-bezier(0.42, 0, 0.14, 1)'
/** Parts of the change: one new row's wipe, and the delay across the whole list. */
const WIPE_SHARE = 0.55
const STAGGER_SHARE = 0.35

/** The current change's length, shared with the graph cells and the CSS. */
let morphMs = MIN_MS
export const currentMorphMs = () => morphMs

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

/** Far travel is shortened to this limit, so a row never crosses the window in a blur. */
export const clampTravel = (px: number, limit: number) => Math.max(-limit, Math.min(limit, px))

export const morphDuration = (longestPx: number) => Math.min(MAX_MS, MIN_MS + longestPx * MS_PER_PX)

/** Where an element is drawn relative to its place, mid-animation. */
const drawnOffset = (el: HTMLElement) => new DOMMatrix(getComputedStyle(el).transform).m42

export type Ghost = { key: string; node: React.ReactNode; travel: number; duration: number }

/**
 * Animates the `[data-row]` children of `box` when `keys` changes. `rendered`
 * holds the visible rows by key. Rows that leave the view come back as ghosts:
 * `travel` is how far one still has to go, and 0 means it has no partner.
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
    const { moved } = planMorph(last.keys, keys)
    const limit = el.clientHeight * 1.5
    const rows = [...el.querySelectorAll<HTMLElement>('[data-row]:not(.morph-ghost *)')]
    const paths = new Map<HTMLElement, number>()
    let longest = 0
    for (const row of rows) {
      const by = moved.get(row.dataset.row ?? '')
      if (by === undefined) continue
      // Mid-move, a row carries on from where it is drawn.
      const y = clampTravel(by * rowHeight, limit) + drawnOffset(row)
      paths.set(row, y)
      longest = Math.max(longest, Math.abs(y))
    }
    const outgoing: Ghost[] = []
    for (const [key, node] of last.rendered) {
      if (rendered.current.has(key)) continue
      const by = moved.get(key)
      const travel = by === undefined ? 0 : clampTravel(-by * rowHeight, limit)
      longest = Math.max(longest, Math.abs(travel))
      outgoing.push({ key, node, travel, duration: 0 })
    }
    morphMs = morphDuration(longest)
    document.documentElement.style.setProperty('--morph-ms', `${morphMs}ms`)
    const wipeMs = morphMs * WIPE_SHARE
    const step = (morphMs * STAGGER_SHARE) / Math.max(1, rows.length)
    rows.forEach((row, i) => {
      for (const running of row.getAnimations()) running.cancel()
      const y = paths.get(row)
      if (y === 0) return
      const motion =
        y === undefined
          ? row.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: wipeMs, delay: i * step, easing: CURVE, fill: 'backwards' })
          : row.animate([{ transform: `translateY(${y}px)` }, { transform: 'none' }], { duration: morphMs, easing: CURVE })
      // An attribute, as React rewrites a row's class when its selection changes.
      row.dataset.morph = y === undefined ? 'new' : 'travel'
      void motion.finished
        .catch(() => {})
        .finally(() => {
          if (!row.getAnimations().length) delete row.dataset.morph
        })
    })
    setGhosts(outgoing.map(g => ({ ...g, duration: morphMs })))
  })
  useLayoutEffect(() => {
    if (!ghosts.length) return
    const id = window.setTimeout(() => setGhosts([]), morphMs)
    return () => window.clearTimeout(id)
  }, [ghosts])
  return ghosts
}

/** Sends a ghost on its way: along its path, or held in place until the new rows have covered its slot. */
export function launchGhost(el: HTMLElement | null, ghost: Ghost) {
  if (!el) return
  const { travel, duration } = ghost
  if (travel) el.animate([{ transform: 'none' }, { transform: `translateY(${travel}px)` }], { duration, easing: CURVE, fill: 'forwards' })
  // Fades only at the end: by then only a slot the new list doesn't fill still shows it.
  else el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration, easing: 'linear', fill: 'forwards' })
}
