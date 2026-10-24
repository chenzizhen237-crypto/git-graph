import { expect, test } from 'vitest'

import { diffStats, pairLines, parseDiff } from '../diff'
import { splitPatch } from '../github'

test('hunks number old and new lines apart', () => {
  const hunks = parseDiff(['@@ -3,3 +3,4 @@ function f', ' a', '-b', '+c', '+d', ' e', '\\ No newline at end of file'].join('\n'))
  expect(hunks).toHaveLength(1)
  expect(hunks[0]!.lines.map(l => [l.kind, l.old, l.new])).toEqual([
    ['ctx', 3, 3],
    ['del', 4, undefined],
    ['add', undefined, 4],
    ['add', undefined, 5],
    ['ctx', 5, 6],
    ['meta', undefined, undefined],
  ])
  expect(diffStats(hunks)).toEqual({ added: 2, deleted: 1 })
})

test('side by side pairs a run of removals with the additions after it', () => {
  const [h] = parseDiff(['@@ -1,4 +1,3 @@', ' a', '-b', '-c', '+B', ' d'].join('\n'))
  expect(pairLines(h!.lines).map(([l, r]) => [l?.text ?? null, r?.text ?? null])).toEqual([
    ['a', 'a'],
    ['b', 'B'],
    ['c', null],
    ['d', 'd'],
  ])
})

test('a PR patch splits per file by its new path', () => {
  const patch = ['diff --git a/x.ts b/x.ts', '@@ -1 +1 @@', '-a', '+b', 'diff --git a/old.ts b/new.ts', 'similarity index 90%', '@@ -1 +1 @@', '-c', '+d', ''].join('\n')
  const files = splitPatch(patch)
  expect([...files.keys()]).toEqual(['x.ts', 'new.ts'])
  expect(parseDiff(files.get('new.ts')!)[0]!.lines.map(l => l.text)).toEqual(['c', 'd'])
})
