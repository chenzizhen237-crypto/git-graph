import { describe, expect, it } from 'vitest'

import { clampTravel, planMorph } from '../listMorph'

describe('planMorph', () => {
  it('keeps shared keys and reports how far they moved', () => {
    const { moved, left } = planMorph(['a', 'b', 'c', 'd'], ['b', 'x', 'd'])
    expect([...moved]).toEqual([
      ['b', 1],
      ['d', 1],
    ])
    expect(left).toEqual(['a', 'c'])
  })

  it('moves nothing when the lists match', () => {
    const { moved, left } = planMorph(['a', 'b'], ['a', 'b'])
    expect([...moved.values()]).toEqual([0, 0])
    expect(left).toEqual([])
  })
})

it('keeps long travel near the list', () => {
  expect(clampTravel(9000, 600)).toBe(600)
  expect(clampTravel(-9000, 600)).toBe(-600)
  expect(clampTravel(28, 600)).toBe(28)
})
