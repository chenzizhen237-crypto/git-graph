import { expect, test } from 'vitest'

import { duration, links, parseJobLog, runState } from '../actions'

test('a job log splits into its ##[group] steps without timestamps', () => {
  const raw = [
    '2026-10-24T14:08:00.1Z Runner info',
    '2026-10-24T14:08:01.1Z ##[group]Run pnpm install',
    '2026-10-24T14:08:02.1Z installing',
    '2026-10-24T14:08:03.1Z ##[endgroup]',
    '2026-10-24T14:08:04.1Z ##[group]Run tauri build',
    "2026-10-24T14:08:05.1Z ##[error]Couldn't find a .ico icon",
  ].join('\n')
  const s = parseJobLog(raw)
  expect(s.map(x => x.title)).toEqual(['Set up job', 'Run pnpm install', 'Run tauri build'])
  expect(s[1]!.lines.map(l => l.text)).toEqual(['installing'])
  expect(s[2]!.failed).toBe(true)
  expect(s[2]!.lines[0]).toMatchObject({ error: true, text: "Couldn't find a .ico icon" })
})

test('run state from status and conclusion', () => {
  expect(runState({ status: 'in_progress', conclusion: null })).toBe('running')
  expect(runState({ status: 'queued', conclusion: null })).toBe('queued')
  expect(runState({ status: 'completed', conclusion: 'success' })).toBe('pass')
  expect(runState({ status: 'completed', conclusion: 'timed_out' })).toBe('fail')
  expect(runState({ status: 'completed', conclusion: 'cancelled' })).toBe('cancelled')
})

test('durations and links', () => {
  expect(duration('2026-10-24T14:00:00Z', '2026-10-24T14:04:12Z')).toBe('4m 12s')
  expect(duration('2026-10-24T14:00:00Z', '2026-10-24T15:30:00Z')).toBe('1h 30m')
  const base = 'https://github.com/o/r'
  expect(links.file(base, 'abc', 'src/a b.ts', 12)).toBe('https://github.com/o/r/blob/abc/src/a%20b.ts#L12')
  expect(links.branch(base, 'claude/x')).toBe('https://github.com/o/r/tree/claude/x')
})

test('colour codes are stripped and tool errors before the marker are lit', () => {
  const raw = [
    '2026-10-24T14:08:00.1Z \x1b[1m\x1b[92m    Finished\x1b[0m release',
    '2026-10-24T14:08:01.1Z failed to bundle project: no .ico',
    '2026-10-24T14:08:02.1Z all good',
  ].join('\n')
  const lines = parseJobLog(raw)[0]!.lines
  expect(lines.map(l => l.text)).toEqual(['    Finished release', 'failed to bundle project: no .ico', 'all good'])
  expect(lines.map(l => l.error)).toEqual([false, true, false])
})
