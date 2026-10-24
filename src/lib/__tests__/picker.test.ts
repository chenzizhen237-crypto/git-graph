import { expect, test } from 'vitest'
import { compactAgo, matchItems, nameParts, pickSections, scopeLabel } from '../picker'
import type { BranchRef } from '../types'

const ref = (name: string, kind: BranchRef['kind'], extra: Partial<BranchRef> = {}): BranchRef => ({
  name,
  kind,
  hash: 'h',
  isHead: false,
  date: '2 days ago',
  subject: '',
  ...extra,
})

const REFS = [
  ref('feature/picker', 'local'),
  ref('main', 'local', { isHead: true, upstream: 'origin/main' }),
  ref('origin/main', 'remote'),
  ref('origin/feature/picker', 'remote'),
  ref('origin/claude/dark-mode', 'remote'),
  ref('v1.0', 'tag'),
]

test('a remote with a local copy folds into the local row; HEAD comes first', async () => {
  const s = pickSections(REFS)
  expect(s.local.map(i => [i.value, i.synced])).toEqual([
    ['main', true],
    ['feature/picker', true],
  ])
  expect(s.remote.map(i => i.value)).toEqual(['origin/claude/dark-mode'])
  expect(s.tag.map(i => i.value)).toEqual(['refs/tags/v1.0'])
})

test('typing narrows by substring, ignoring case', async () => {
  const s = pickSections(REFS)
  expect(matchItems(s.remote, 'DARK').length).toBe(1)
  expect(matchItems(s.local, 'dark').length).toBe(0)
  expect(matchItems(s.local, '').length).toBe(2)
})

test('a name splits into a dim prefix and a tail, the match lit', async () => {
  expect(nameParts('claude/dark-mode', 'dark')).toEqual([{ text: 'claude/', dim: true }, { text: 'dark', hit: true }, { text: '-mode' }])
  expect(nameParts('claude/dark-mode', 'aud')).toEqual([{ text: 'cl', dim: true }, { text: 'aud', dim: true, hit: true }, { text: 'e/', dim: true }, { text: 'dark-mode' }])
  expect(nameParts('main', '')).toEqual([{ text: 'main' }])
})

test('the scope button names the scope briefly', async () => {
  expect(scopeLabel('--all')).toBe('All branches')
  expect(scopeLabel('--branches')).toBe('Local only')
  expect(scopeLabel('origin/claude/dark-mode')).toBe('dark-mode')
  expect(scopeLabel('refs/tags/v1.0')).toBe('v1.0')
  expect(scopeLabel('main..feature')).toBe('main..feature')
  expect(compactAgo('3 weeks ago')).toBe('3w')
  expect(compactAgo('2 months ago')).toBe('2mo')
})
