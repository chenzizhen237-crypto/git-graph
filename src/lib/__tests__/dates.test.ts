import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ setZoom: vi.fn(() => Promise.resolve()) }) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }))
vi.mock('@tauri-apps/plugin-notification', () => ({}))

const { formatDate } = await import('../dates')
const { compareVersions } = await import('../notify')

// 25 Oct 2026, 14:05 local time.
const at = new Date(2026, 9, 25, 14, 5).getTime()

describe('formatDate', () => {
  it('formats ISO, day-first and month-first', () => {
    expect(formatDate(at, { dateFormat: 'iso', hour24: true })).toBe('2026-10-25 14:05')
    expect(formatDate(at, { dateFormat: 'dmy', hour24: true })).toBe('25/10/2026 14:05')
    expect(formatDate(at, { dateFormat: 'mdy', hour24: false })).toBe('10/25/2026 2:05 PM')
  })
})

describe('compareVersions', () => {
  it('orders releases', () => {
    expect(compareVersions('v0.3.0', '0.2.0')).toBeGreaterThan(0)
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0)
    expect(compareVersions('v0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('v0.1.9', '0.2.0')).toBeLessThan(0)
  })
})
