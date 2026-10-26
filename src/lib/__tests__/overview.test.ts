import { expect, test } from 'vitest'

import { type BranchCi, type Check, deploymentState, overviewQuery, pollEvery, type RepoCi, readCheck, readDeployments, repoState, sortRepos, summary } from '../overview'

const check = (state: Check['state']): Check => ({ name: state, state, started: null, completed: null, url: null })
const branch = (states: Check['state'][], at = '2026-10-26T10:00:00Z'): BranchCi => ({ branch: 'main', sha: 'abc', subject: 's', at, checks: states.map(check) })
const repo = (name: string, main?: BranchCi, current?: BranchCi): RepoCi => ({ path: `/r/${name}`, name, slug: `o/${name}`, main, current })

test('check runs are named after their workflow; commit statuses keep their context', () => {
  expect(
    readCheck({
      __typename: 'CheckRun',
      name: 'Build (Linux)',
      status: 'COMPLETED',
      conclusion: 'FAILURE',
      startedAt: 'a',
      completedAt: 'b',
      detailsUrl: 'u',
      checkSuite: { workflowRun: { workflow: { name: 'Release' } } },
    }),
  ).toMatchObject({ name: 'Release / Build (Linux)', state: 'fail' })
  expect(readCheck({ __typename: 'CheckRun', name: 'buildkite', status: 'IN_PROGRESS', conclusion: null, startedAt: null, completedAt: null, detailsUrl: null })).toMatchObject({
    name: 'buildkite',
    state: 'running',
  })
  expect(readCheck({ __typename: 'StatusContext', context: 'Vercel', state: 'PENDING', targetUrl: null, createdAt: 'x' })).toMatchObject({ name: 'Vercel', state: 'running' })
  expect(readCheck({ __typename: 'StatusContext', context: 'ci/circleci', state: 'ERROR', targetUrl: null, createdAt: 'x' }).state).toBe('fail')
})

test('a repository is as bad as the worse of its two branches', () => {
  expect(repoState(repo('a', branch(['pass', 'pass'])))).toBe('pass')
  expect(repoState(repo('a', branch(['pass']), branch(['running', 'pass'])))).toBe('running')
  expect(repoState(repo('a', branch(['running']), branch(['fail'])))).toBe('fail')
  expect(repoState(repo('a', branch(['skipped'])))).toBe('none')
  expect(repoState(repo('a'))).toBe('none')
})

test('summaries count failures first, then what is still going', () => {
  expect(summary(branch(['fail', 'pass', 'running']))).toEqual({ text: '{n} of {total} failed', n: 1, total: 3 })
  expect(summary(branch(['queued', 'running', 'pass']))).toEqual({ text: '{n} of {total} running', n: 2, total: 3 })
  expect(summary(branch(['pass', 'pass']))).toEqual({ text: '{n} passed', n: 2, total: 2 })
  expect(summary(undefined).text).toBe('No checks')
})

test('failing first, then running, passing and no CI; newest first within each', () => {
  const list = [
    repo('quiet'),
    repo('old-pass', branch(['pass'], '2026-10-01T00:00:00Z')),
    repo('new-pass', branch(['pass'], '2026-10-25T00:00:00Z')),
    repo('busy', branch(['running'])),
    repo('broken', branch(['fail'])),
  ]
  expect(sortRepos(list).map(r => r.name)).toEqual(['broken', 'busy', 'new-pass', 'old-pass', 'quiet'])
  expect(pollEvery(list)).toBe(15)
  expect(pollEvery([list[1]!])).toBe(60)
})

test('the query passes names as variables and asks for the current branch only when there is one', () => {
  const { query, variables } = overviewQuery([
    { owner: 'o', name: 'a', branch: 'claude/x"y' },
    { owner: 'o', name: 'b' },
  ])
  expect(variables).toEqual({ o0: 'o', n0: 'a', b0: 'refs/heads/claude/x"y', o1: 'o', n1: 'b' })
  expect(query).toContain('r0: repository(owner: $o0, name: $n0) { defaultBranchRef { name target { ...C } } cur: ref(qualifiedName: $b0)')
  expect(query).toContain('r1: repository(owner: $o1, name: $n1) { defaultBranchRef { name target { ...C } } deployments(')
  expect(query.match(/cur: ref/g)).toHaveLength(1)
  expect(query).not.toContain('claude/x')
  expect(query).toContain('$b0: String!')
})

test('deployments keep the newest per environment, and a failed one makes the repository fail', () => {
  const dep = (environment: string, createdAt: string, state: string | null) => ({
    environment,
    commitOid: `sha-${createdAt}`,
    createdAt,
    ref: { name: 'main' },
    latestStatus: state ? { state, createdAt, environmentUrl: null, logUrl: 'log' } : null,
  })
  const deps = readDeployments([
    dep('production', '2026-10-25T00:00:00Z', 'FAILURE'),
    dep('production', '2026-10-26T00:00:00Z', 'SUCCESS'),
    dep('staging', '2026-10-24T00:00:00Z', 'FAILURE'),
    dep('preview', '2026-10-23T00:00:00Z', null),
  ])
  expect(deps.map(d => [d.environment, d.state])).toEqual([
    ['production', 'pass'],
    ['staging', 'fail'],
    ['preview', 'queued'],
  ])
  expect(deps[0]!.url).toBe('log')
  expect(deploymentState('INACTIVE')).toBe('pass')
  expect(deploymentState('IN_PROGRESS')).toBe('running')
  expect(deploymentState('WAITING')).toBe('queued')
  expect(repoState({ ...repo('a', branch(['pass'])), deployments: deps })).toBe('fail')
  expect(repoState({ ...repo('a', branch(['pass'])), deployments: deps.slice(0, 1) })).toBe('pass')
})

test('the query asks for deployments', () => {
  expect(overviewQuery([{ owner: 'o', name: 'a' }]).query).toContain('deployments(last: 30')
})
