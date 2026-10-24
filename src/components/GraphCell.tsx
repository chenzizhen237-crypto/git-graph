/** Graph/Cell: one row of the commit graph as SVG, rows stacked flush draw continuous lanes. */
import type { GraphRow } from '../lib/types'

export const ROW_H = 28
const LANE_W = 16
const PAD = 12
const MID = ROW_H / 2

export const graphWidth = (laneCount: number) => Math.max(56, PAD * 2 + (laneCount - 1) * LANE_W)

export type NodeKind = 'commit' | 'merge' | 'head' | 'work'

const x = (lane: number) => PAD + lane * LANE_W

export function GraphCell({ g, laneCount, kind }: { g: GraphRow; laneCount: number; kind: NodeKind }) {
  const xi = x(g.lane)
  const w = graphWidth(laneCount)
  const line = { strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const }
  return (
    <svg className="shrink-0 overflow-visible" width={w} height={ROW_H} viewBox={`0 0 ${w} ${ROW_H}`}>
      {g.through.map(t => (
        <path key={`t${t.lane}`} d={`M${x(t.lane)} 0V${ROW_H}`} stroke={t.color} {...line} />
      ))}
      {g.hasTop && <path d={`M${xi} 0V${MID}`} stroke={g.color} {...line} />}
      {g.hasBottom && <path d={`M${xi} ${MID}V${ROW_H}`} stroke={g.color} {...line} />}
      {g.inbound.map(e => {
        const xj = x(e.from)
        return <path key={`i${e.from}`} d={`M${xj} 0C${xj} 9 ${xi} 5 ${xi} ${MID}`} stroke={e.color} {...line} />
      })}
      {g.outbound.map(e => {
        const xk = x(e.to)
        return <path key={`o${e.to}`} d={`M${xi} ${MID}C${xi} ${MID + 9} ${xk} ${MID + 5} ${xk} ${ROW_H}`} stroke={e.color} {...line} />
      })}
      {kind === 'work' && <circle cx={xi} cy={MID} r={5} fill="var(--bg-app)" stroke={g.color} strokeWidth={2} strokeDasharray="2.6 2.2" />}
      {kind === 'merge' && <circle cx={xi} cy={MID} r={4.5} fill="var(--bg-app)" stroke={g.color} strokeWidth={2} />}
      {kind === 'commit' && <circle cx={xi} cy={MID} r={5} fill={g.color} />}
      {kind === 'head' && (
        <>
          <circle cx={xi} cy={MID} r={8} fill="none" stroke={g.color} strokeWidth={1.5} />
          <circle cx={xi} cy={MID} r={5} fill={g.color} />
        </>
      )}
    </svg>
  )
}
