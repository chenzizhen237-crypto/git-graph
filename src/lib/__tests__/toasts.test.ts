import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { dismissToast, getToasts, toast } from '../toasts'

const read = getToasts

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const x of read()) dismissToast(x.id)
  vi.useRealTimers()
})

test('plain toasts hide on their own, toasts with actions stay', () => {
  toast({ kind: 'ok', title: 'Pushed' })
  toast({ kind: 'info', title: 'Update', actions: [{ label: 'Update now', run: () => {} }] })
  expect(read().map(x => x.title)).toEqual(['Pushed', 'Update'])
  vi.advanceTimersByTime(10_000)
  expect(read().map(x => x.title)).toEqual(['Update'])
})

test('a repeated key replaces the toast in place', () => {
  const a = toast({ key: 'update', kind: 'info', title: 'v0.5.0', sticky: true })
  toast({ kind: 'ok', title: 'Fetched' })
  const b = toast({ key: 'update', kind: 'info', title: 'v0.5.1', sticky: true })
  expect(b).toBe(a)
  expect(read().map(x => x.title)).toEqual(['v0.5.1', 'Fetched'])
})

test('a full stack drops the oldest toast that would hide anyway', () => {
  toast({ kind: 'info', title: 'sticky', sticky: true })
  for (const n of [1, 2, 3, 4]) toast({ kind: 'ok', title: `ok ${n}` })
  expect(read().map(x => x.title)).toEqual(['sticky', 'ok 2', 'ok 3', 'ok 4'])
})
