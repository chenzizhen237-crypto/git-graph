/**
 * The in-app terminal panel's state, scoped per open repository so switching
 * repository tabs keeps each repo's running shells alive.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useSyncExternalStore } from 'react'

export type TermTab = {
  key: number
  title: string
  /** Where the shell starts; the repository root when unset. */
  cwd?: string
  /** Typed into the shell once it starts (an agent CLI, for the Agents view). */
  command?: string
}
type State = { open: boolean; tabs: TermTab[]; active: number }

const EMPTY: State = { open: false, tabs: [], active: 0 }
const states = new Map<string, State>()
let activeRepo = ''
let nextKey = 1
const listeners = new Set<() => void>()

const getFor = (repo: string): State => states.get(repo) ?? EMPTY

function setFor(repo: string, patch: Partial<State>) {
  states.set(repo, { ...getFor(repo), ...patch })
  for (const l of listeners) l()
}

/** Switches which repository default helpers (`newTab`, `toggleTerminal`, …) target. */
export function setActiveTerminalRepo(repo: string) {
  if (activeRepo === repo) return
  activeRepo = repo
  for (const l of listeners) l()
}

export function useTerminal(repo?: string) {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => getFor(repo ?? activeRepo),
  )
}

/** Opens a new shell tab and shows it. */
export function newTab(opts: { cwd?: string; command?: string; title?: string; repo?: string } = {}) {
  const repo = opts.repo ?? activeRepo
  const cur = getFor(repo)
  const key = nextKey++
  const n = cur.tabs.length
  const title = opts.title ?? (n ? `zsh ${n + 1}` : 'zsh')
  setFor(repo, { open: true, tabs: [...cur.tabs, { key, title, cwd: opts.cwd, command: opts.command }], active: key })
  return key
}

/** Shows a tab that is already open. */
export const showTab = (key: number, repo = activeRepo) => setFor(repo, { open: true, active: key })

/** Shows or hides the panel; hiding keeps the shells running. Opening it the first time starts a shell. */
export function toggleTerminal(repo = activeRepo) {
  const cur = getFor(repo)
  if (cur.open) setFor(repo, { open: false })
  else if (!cur.tabs.length) newTab({ repo })
  else setFor(repo, { open: true })
}

export function closeTab(key: number, repo = activeRepo) {
  const cur = getFor(repo)
  const tabs = cur.tabs.filter(t => t.key !== key)
  const active = cur.active === key ? (tabs.at(-1)?.key ?? 0) : cur.active
  setFor(repo, { tabs, active, open: cur.open && tabs.length > 0 })
}

/** Closes the panel and ends every shell in it for the given (or active) repository. */
export function closeTerminal(repo = activeRepo) {
  states.delete(repo)
  for (const l of listeners) l()
}

export const selectTab = (key: number, repo = activeRepo) => setFor(repo, { active: key })

export const renameTab = (key: number, title: string, repo = activeRepo) => {
  const cur = getFor(repo)
  setFor(repo, { tabs: cur.tabs.map(t => (t.key === key ? { ...t, title } : t)) })
}

export const termOpen = (cwd: string, cols: number, rows: number) => invoke<number>('term_open', { cwd, cols, rows })
export const termWrite = (id: number, data: string) => invoke<void>('term_write', { id, data })
export const termResize = (id: number, cols: number, rows: number) => invoke<void>('term_resize', { id, cols, rows })
export const termClose = (id: number) => invoke<void>('term_close', { id })

/** Shell output as raw bytes (the backend sends base64, so split UTF-8 sequences survive). */
export function onTermOutput(id: number, cb: (bytes: Uint8Array) => void) {
  return listen<string>(`term://${id}`, e => cb(Uint8Array.from(atob(e.payload), c => c.charCodeAt(0))))
}

export const onTermExit = (id: number, cb: () => void) => listen(`term-exit://${id}`, cb)
