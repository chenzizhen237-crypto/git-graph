import { expect, test } from 'vitest'

import { hasMarkers, parseConflicts, resolve } from '../conflicts'

const file = ['a\n', '<<<<<<< HEAD\n', 'ours\n', '=======\n', 'theirs\n', '>>>>>>> feature\n', 'z\n'].join('')

test('splits a file into text and conflicts', () => {
  const s = parseConflicts(file)
  expect(s).toEqual([
    { kind: 'text', text: 'a\n' },
    { kind: 'conflict', ours: 'ours\n', base: undefined, theirs: 'theirs\n', oursLabel: 'HEAD', theirsLabel: 'feature' },
    { kind: 'text', text: 'z\n' },
  ])
})

test('resolves each conflict by its choice, keeping markers for open ones', () => {
  const s = parseConflicts(file)
  expect(resolve(s, ['ours'])).toBe('a\nours\nz\n')
  expect(resolve(s, ['both'])).toBe('a\nours\ntheirs\nz\n')
  expect(resolve(s, [null])).toBe(file)
  expect(hasMarkers(resolve(s, [null]))).toBe(true)
  expect(hasMarkers(resolve(s, ['theirs']))).toBe(false)
})

test('reads the base of diff3 markers', () => {
  const s = parseConflicts('<<<<<<< HEAD\no\n||||||| base\nb\n=======\nt\n>>>>>>> x\n')
  expect(s[0]).toMatchObject({ ours: 'o\n', base: 'b\n', theirs: 't\n' })
})
