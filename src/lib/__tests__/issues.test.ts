import { expect, test } from 'vitest'

import { issueBranch } from '../issues'

test('names a branch after the issue', () => {
  expect(issueBranch(42, 'Sidebar rows squeeze when it scrolls!')).toBe('issue-42-sidebar-rows-squeeze-when-it-scrolls')
  expect(issueBranch(7, 'Café: déjà vu, again and again and again')).toBe('issue-7-cafe-deja-vu-again-and-again')
  expect(issueBranch(9, '中文标题')).toBe('issue-9')
})
