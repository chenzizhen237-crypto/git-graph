import { expect, test } from 'vitest'

import { blocked, nameOf, redoCommands, type UndoEntry, undoCommands, undoKind, verbOf } from '../undo'

test('finds the subcommand behind -c options', () => {
  expect(verbOf(['-c', 'core.editor=true', 'rebase', '--continue'])).toBe('rebase')
  expect(verbOf(['commit', '-F', '-'])).toBe('commit')
})

test('classifies actions', () => {
  expect(undoKind(['commit', '-F', '-', '--amend'])).toBe('soft')
  expect(undoKind(['merge', '--no-edit', 'main'])).toBe('move')
  expect(undoKind(['merge', '--abort'])).toBeNull()
  expect(undoKind(['switch', '-c', 'feature/x'])).toBe('create')
  expect(undoKind(['switch', 'main'])).toBe('switch')
  expect(undoKind(['branch', '-d', 'old'])).toBe('delete-branch')
  expect(undoKind(['fetch', '--all'])).toBeNull()
  expect(nameOf(['switch', '-c', 'feature/x', 'abc'], 'create')).toBe('feature/x')
  expect(nameOf(['tag', 'v1', 'abc'], 'tag')).toBe('v1')
})

const commit: UndoEntry = { label: 'Commit', kind: 'soft', before: { branch: 'main', sha: 'a' }, after: { branch: 'main', sha: 'b' } }

test('undoing a commit keeps its changes staged, redo puts it back', () => {
  expect(undoCommands(commit)).toEqual([['reset', '--soft', 'a']])
  expect(redoCommands(commit)).toEqual([['reset', '--soft', 'b']])
})

test('a deleted branch comes back at its commit', () => {
  const e: UndoEntry = { label: 'Delete', kind: 'delete-branch', before: commit.after, after: commit.after, name: 'old', target: 'c' }
  expect(undoCommands(e)).toEqual([['branch', 'old', 'c']])
  expect(redoCommands(e)).toEqual([['branch', '-D', 'old']])
})

test('refuses once the branch has moved or HEAD switched', () => {
  expect(blocked(commit, { branch: 'main', sha: 'b' }, true)).toBeNull()
  expect(blocked(commit, { branch: 'main', sha: 'z' }, true)).toMatch(/moved/)
  expect(blocked(commit, { branch: 'dev', sha: 'b' }, true)).toMatch(/another branch/)
  expect(blocked(commit, { branch: 'main', sha: 'a' }, false)).toBeNull()
})
