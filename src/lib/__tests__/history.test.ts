import { expect, test } from 'vitest'

import { parseBlame, parseFileLog } from '../history'

test('reads the file log with the name the file had in each commit', () => {
  const out = '\x1eaaa\x1fa\x1fLucas\x1f100\x1fRename\n\nsrc/new.ts\n\x1ebbb\x1fb\x1fLucas\x1f50\x1fAdd\n\nsrc/old.ts\n'
  expect(parseFileLog(out, 'src/new.ts')).toEqual([
    { hash: 'aaa', short: 'a', author: 'Lucas', time: 100, subject: 'Rename', path: 'src/new.ts' },
    { hash: 'bbb', short: 'b', author: 'Lucas', time: 50, subject: 'Add', path: 'src/old.ts' },
  ])
})

test('reads porcelain blame, reusing commit info for repeated hashes', () => {
  const a = 'a'.repeat(40)
  const b = 'b'.repeat(40)
  const out = [
    `${a} 1 1 2`,
    'author Lucas',
    'author-time 100',
    'summary First',
    'filename f.ts',
    '\tline one',
    `${a} 2 2`,
    '\tline two',
    `${b} 3 3 1`,
    'author Claude',
    'author-time 200',
    'summary Second',
    'filename f.ts',
    '\tline three',
  ].join('\n')
  const lines = parseBlame(out)
  expect(lines.map(l => [l.author, l.line, l.text, l.start])).toEqual([
    ['Lucas', 1, 'line one', true],
    ['Lucas', 2, 'line two', false],
    ['Claude', 3, 'line three', true],
  ])
  expect(lines[2]!.summary).toBe('Second')
})
