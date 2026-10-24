import { expect, test } from 'vitest'

import { diffStats, parseDiff } from '../diff'

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
