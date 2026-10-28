import { expect, test } from 'vitest'

import { hunkPatch, parseDiff } from '../diff'

const [hunk] = parseDiff(['@@ -1,3 +1,3 @@', ' a', '-b', '+B', '+C', ' d'].join('\n'))

test('a whole hunk patches as it is', () => {
  expect(hunkPatch('f.txt', hunk!, null, 'forward')).toBe('diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n+C\n d\n')
})

test('staging some lines keeps unselected removals as context and drops unselected additions', () => {
  // Lines: 0 ' a', 1 '-b', 2 '+B', 3 '+C', 4 ' d'. Stage only "+C".
  const body = hunkPatch('f.txt', hunk!, new Set([3]), 'forward')
    .split('\n')
    .slice(4)
    .join('\n')
  expect(body).toBe(' a\n b\n+C\n d\n')
})

test('unstaging some lines keeps unselected additions as context and drops unselected removals', () => {
  const body = hunkPatch('f.txt', hunk!, new Set([1]), 'reverse')
    .split('\n')
    .slice(4)
    .join('\n')
  expect(body).toBe(' a\n-b\n B\n C\n d\n')
})
