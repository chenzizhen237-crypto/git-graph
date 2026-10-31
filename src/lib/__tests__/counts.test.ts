import { describe, expect, it } from 'vitest'

import type { Run } from '../actions'
import { failingRuns } from '../counts'

const run = (name: string, conclusion: string | null, status = 'completed') => ({ name, status, conclusion }) as Run

describe('failingRuns', () => {
  it('counts a workflow by its latest run only', () => {
    expect(failingRuns([run('CI', 'success'), run('CI', 'failure')])).toBe(0)
    expect(failingRuns([run('CI', 'failure'), run('CI', 'success')])).toBe(1)
  })

  it('counts each failing workflow once and ignores running ones', () => {
    expect(failingRuns([run('CI', 'failure'), run('CI', 'failure'), run('Release', 'failure'), run('Docs', null, 'in_progress')])).toBe(2)
  })
})
