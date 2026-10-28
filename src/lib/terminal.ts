/**
 * The in-app terminal panel's state, shared by the toolbar button, the
 * command palette and the panel itself, plus the calls to the shell backend
 * (src-tauri/src/term.rs).
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useSyncExternalStore } from 'react'

export type TermTab = { key: number; title: string }
type State = { open: boolean; tabs: TermTab[]; active: number }

let state: State = { open: false, tabs: [], active: 0 }
let nextKey = 1
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function useTerminal() {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export function newTab() {
  const key = nextKey++
  const n = state.tabs.length
  set({ open: true, tabs: [...state.tabs, { key, title: n ? `zsh ${n + 1}` : 'zsh' }], active: key })
}

/** Shows or hides the panel; hiding keeps the shells running. Opening it the first time starts a shell. */
export function toggleTerminal() {
  if (state.open) set({ open: false })
  else if (!state.tabs.length) newTab()
  else set({ open: true })
}

export function closeTab(key: number) {
  const tabs = state.tabs.filter(t => t.key !== key)
  const active = state.active === key ? (tabs.at(-1)?.key ?? 0) : state.active
  set({ tabs, active, open: state.open && tabs.length > 0 })
}

/** Closes the panel and ends every shell in it. */
export function closeTerminal() {
  set({ open: false, tabs: [], active: 0 })
}

export const selectTab = (key: number) => set({ active: key })

export const renameTab = (key: number, title: string) => set({ tabs: state.tabs.map(t => (t.key === key ? { ...t, title } : t)) })

export const termOpen = (cwd: string, cols: number, rows: number) => invoke<number>('term_open', { cwd, cols, rows })
export const termWrite = (id: number, data: string) => invoke<void>('term_write', { id, data })
export const termResize = (id: number, cols: number, rows: number) => invoke<void>('term_resize', { id, cols, rows })
export const termClose = (id: number) => invoke<void>('term_close', { id })

/** Shell output as raw bytes (the backend sends base64, so split UTF-8 sequences survive). */
export function onTermOutput(id: number, cb: (bytes: Uint8Array) => void) {
  return listen<string>(`term://${id}`, e => cb(Uint8Array.from(atob(e.payload), c => c.charCodeAt(0))))
}

export const onTermExit = (id: number, cb: () => void) => listen(`term-exit://${id}`, cb)
