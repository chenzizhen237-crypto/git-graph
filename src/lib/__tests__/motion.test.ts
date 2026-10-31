import { describe, expect, it } from 'vitest'

import { ROUTE_TONE, ROUTES, routeDirection } from '../motion'

describe('routeDirection', () => {
  it('follows the sidebar', () => {
    expect(routeDirection('history', 'actions')).toBe(1)
    expect(routeDirection('actions', 'changes')).toBe(-1)
  })
})

it('gives every route a tone', () => {
  for (const route of ROUTES) expect(ROUTE_TONE[route]).toBeTruthy()
})
