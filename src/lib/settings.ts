/**
 * User settings: one JSON object in localStorage, a tiny store React reads
 * with useSettings(), and the side effects that apply each setting (theme,
 * language, proxy) wherever it lands.
 */
import { invoke } from '@tauri-apps/api/core'
import { useSyncExternalStore } from 'react'

export type ProxyMode = 'off' | 'system' | 'custom'
export type Language = 'en' | 'zh'

export type Settings = {
  autoFetchMinutes: number
  pruneOnFetch: boolean
  pageSize: number
  openLastRepo: boolean
  defaultBranch: string
  terminal: string
  theme: 'system' | 'light' | 'dark'
  language: Language
  diffMode: 'unified' | 'split'
  diffWrap: boolean
  proxy: { mode: ProxyMode; url: string; bypass: string; git: boolean; github: boolean }
  /** Folders scanned for repositories; null until first suggested. */
  repoFolders: string[] | null
}

export const DEFAULTS: Settings = {
  autoFetchMinutes: 5,
  pruneOnFetch: true,
  pageSize: 600,
  openLastRepo: true,
  defaultBranch: 'main',
  terminal: 'Terminal',
  theme: 'system',
  language: navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en',
  diffMode: 'unified',
  diffWrap: false,
  proxy: { mode: 'system', url: '', bypass: 'localhost, 127.0.0.1, *.local', git: true, github: true },
  repoFolders: null,
}

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem('settings') ?? '{}') as Partial<Settings>
    // Older builds kept the theme on its own.
    const theme = (localStorage.getItem('theme') as Settings['theme'] | null) ?? undefined
    return { ...DEFAULTS, ...(theme ? { theme } : {}), ...raw, proxy: { ...DEFAULTS.proxy, ...raw.proxy } }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()

export const getSettings = () => current

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch, proxy: { ...current.proxy, ...patch.proxy } }
  try {
    localStorage.setItem('settings', JSON.stringify(current))
  } catch {}
  apply(current, patch)
  for (const l of listeners) l()
}

export function useSettings() {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

/** Puts settings into effect: on start (no patch) everything, later only what changed. */
export function apply(s: Settings, patch?: Partial<Settings>) {
  const root = document.documentElement
  if (!patch || 'theme' in patch) {
    if (s.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = s.theme
  }
  if (!patch || 'language' in patch) root.lang = s.language
  if (!patch || 'proxy' in patch) void invoke('set_network', { network: s.proxy }).catch(() => {})
}

export const testConnection = () => invoke<number>('test_github')
