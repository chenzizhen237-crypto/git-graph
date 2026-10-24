/**
 * The commit graph lane layout, in the style of GitKraken / IntelliJ, from a
 * topologically ordered commit list. Ported from the claude-mods git-graph
 * plugin; drawing lives in components/GraphCell.tsx.
 */

import type { GraphEdge, GraphRow } from './types'

/** Lane colours: the design's four lane tokens first, then extra hues. */
export const PALETTE = [
  'var(--lane-0)',
  'var(--lane-1)',
  'var(--lane-2)',
  'var(--lane-3)',
  'var(--pink-500)',
  'var(--cyan-500)',
  'var(--red-400)',
  'var(--purple-300)',
  'var(--green-300)',
  'var(--amber-300)',
  'var(--blue-300)',
  'var(--pink-400)',
]

export type GraphCommit = { hash: string; parents: string[] }

type Lane = { hash: string; color: string } | null

export type Layout = { rows: GraphRow[]; laneCount: number }

/**
 * Assigns every commit a lane and the edges that join it to its neighbours.
 *
 * `dangle` keeps a lane open for a parent that is not in the list (the page
 * ends before it); off, such parents are dropped, which is right for a
 * filtered log where most parents are hidden.
 */
export function layoutGraph(commits: GraphCommit[], dangle: boolean): Layout {
  const known = new Set(commits.map(c => c.hash))
  const lanes: Lane[] = []
  let colorIx = 0
  const nextColor = () => PALETTE[colorIx++ % PALETTE.length]!
  const firstFree = () => {
    const at = lanes.indexOf(null)
    return at < 0 ? lanes.length : at
  }
  let laneCount = 1
  const rows: GraphRow[] = []

  for (const c of commits) {
    let lane = lanes.findIndex(l => l !== null && l.hash === c.hash)
    let color: string
    const hasTop = lane >= 0
    if (lane < 0) {
      lane = firstFree()
      color = nextColor()
      lanes[lane] = { hash: c.hash, color }
    } else color = lanes[lane]!.color

    const inbound: GraphEdge[] = []
    for (let j = 0; j < lanes.length; j++) {
      const l = lanes[j]
      if (j !== lane && l && l.hash === c.hash) {
        inbound.push({ from: j, to: lane, color: l.color })
        lanes[j] = null
      }
    }

    const through: { lane: number; color: string }[] = []
    for (let j = 0; j < lanes.length; j++) {
      const l = lanes[j]
      if (j !== lane && l) through.push({ lane: j, color: l.color })
    }

    const parents = c.parents.filter(p => dangle || known.has(p))
    const outbound: GraphEdge[] = []
    if (parents.length === 0) lanes[lane] = null
    else {
      lanes[lane] = { hash: parents[0]!, color }
      for (const p of parents.slice(1)) {
        let to = lanes.findIndex(l => l !== null && l.hash === p)
        if (to < 0) {
          to = firstFree()
          lanes[to] = { hash: p, color: nextColor() }
        }
        outbound.push({ from: lane, to, color: lanes[to]!.color })
      }
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()

    const used = Math.max(lane + 1, lanes.length, ...through.map(t => t.lane + 1), ...inbound.map(e => e.from + 1), ...outbound.map(e => e.to + 1))
    laneCount = Math.max(laneCount, used)
    rows.push({
      lane,
      color,
      hasTop,
      hasBottom: parents.length > 0,
      isMerge: c.parents.length > 1,
      through,
      inbound,
      outbound,
    })
  }
  return { rows, laneCount }
}
