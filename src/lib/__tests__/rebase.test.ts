import { expect, test } from 'vitest'

import { planProblem, type RebaseStep, rebaseArgs, todo } from '../rebase'

const step = (hash: string, action: RebaseStep['action'], reword?: string): RebaseStep => ({ hash, short: hash, subject: hash, message: hash, action, reword })

test('writes the todo list, with rewords as exec steps', () => {
  const list = todo([step('a', 'pick'), step('b', 'reword', 'New — message'), step('c', 'squash'), step('d', 'drop')])
  const lines = list.trim().split('\n')
  expect(lines[0]).toBe('pick a')
  expect(lines[1]).toBe('pick b')
  expect(lines[2]).toMatch(/^exec printf %s \S+ \| base64 --decode \| git commit --amend --only --allow-empty --no-verify -F -$/)
  const encoded = lines[2]!.split(' ')[3]!
  expect(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)))).toBe('New — message')
  expect(lines.slice(3)).toEqual(['squash c', 'drop d'])
})

test('rejects plans git would refuse', () => {
  expect(planProblem([step('a', 'squash'), step('b', 'pick')])).toMatch(/first commit/)
  expect(planProblem([step('a', 'drop')])).toMatch(/at least one/)
  expect(planProblem([step('a', 'reword', ' ')])).toMatch(/message/)
  expect(planProblem([step('a', 'pick'), step('b', 'fixup')])).toBeNull()
})

test('passes the list through sequence.editor and keeps squash messages without an editor', () => {
  const args = rebaseArgs('base', [step('a', 'pick')])
  expect(args.slice(-3)).toEqual(['rebase', '-i', 'base'])
  expect(args).toContain('core.editor=true')
  expect(args[1]).toMatch(/^sequence\.editor=printf %s \S+ \| base64 --decode >$/)
})
