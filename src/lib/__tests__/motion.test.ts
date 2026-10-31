import { expect, it } from 'vitest'

import { ROUTES } from '../motion'

it('lists each Workspace route once', () => {
  expect(new Set(ROUTES).size).toBe(ROUTES.length)
})
