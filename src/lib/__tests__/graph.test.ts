import { expect, test } from 'vitest'
import { layoutGraph } from '../graph'
import { branchPath, mergeNumstat } from '../parse'

test('a merge gets two lanes that join again at the common parent', async () => {
  const { rows, laneCount } = layoutGraph(
    [
      { hash: 'M', parents: ['A', 'F'] },
      { hash: 'F', parents: ['B'] },
      { hash: 'A', parents: ['B'] },
      { hash: 'B', parents: [] },
    ],
    true,
  )
  expect(laneCount).toBe(2)
  expect(rows[0]!.lane).toBe(0)
  expect(rows[0]!.isMerge).toBe(true)
  expect(rows[0]!.outbound).toEqual([{ from: 0, to: 1, color: rows[1]!.color }])
  expect(rows[1]!.lane).toBe(1)
  expect(rows[1]!.through.map(t => t.lane)).toEqual([0])
  expect(rows[2]!.lane).toBe(0)
  expect(rows[3]!.lane).toBe(0)
  expect(rows[3]!.inbound.map(e => e.from)).toEqual([1])
  expect(rows[3]!.hasBottom).toBe(false)
  // The feature branch keeps one color from its tip to the merge.
  expect(rows[1]!.color).toBe(rows[3]!.inbound[0]!.color)
})

test('a filtered log drops parents that are not shown', async () => {
  const { rows, laneCount } = layoutGraph(
    [
      { hash: 'X', parents: ['hidden1'] },
      { hash: 'Y', parents: ['hidden2'] },
    ],
    false,
  )
  expect(laneCount).toBe(1)
  expect(rows.every(r => r.lane === 0 && !r.hasBottom)).toBe(true)
})

test('numstat merges by path, renames and binaries included', async () => {
  const files = [
    { status: 'M', path: 'a.ts' },
    { status: 'R', orig: 'old.ts', path: 'new.ts' },
    { status: 'A', path: 'logo.png' },
  ]
  const out = '3\t1\ta.ts\0' + '0\t0\t\0old.ts\0new.ts\0' + '-\t-\tlogo.png\0'
  const merged = mergeNumstat(files, out)
  expect(merged[0]).toEqual({ status: 'M', path: 'a.ts', added: 3, deleted: 1 })
  expect(merged[1]!.added).toBe(0)
  expect(merged[2]!.added).toBeUndefined()
})

test('the branch path follows first parents down and same-lane children up', async () => {
  const rows = [
    { hash: 'M', parents: ['A', 'F'], graph: { lane: 0 } },
    { hash: 'F', parents: ['B'], graph: { lane: 1 } },
    { hash: 'A', parents: ['B'], graph: { lane: 0 } },
    { hash: 'B', parents: [], graph: { lane: 0 } },
  ]
  expect([...branchPath(rows, 'A')].sort()).toEqual(['A', 'B', 'M'])
  expect([...branchPath(rows, 'F')].sort()).toEqual(['B', 'F'])
})
