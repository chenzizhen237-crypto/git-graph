/**
 * User settings: one JSON object in localStorage, a tiny store React reads
 * with useSettings(), and the side effects that apply each setting (theme,
 * language, proxy) wherever it lands.
 */
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useSyncExternalStore } from 'react'

export type ProxyMode = 'off' | 'system' | 'custom'
export type Language = 'en' | 'zh'

export type Fonts = {
  /** Interface font family; '' for the built-in one. */
  ui: string
  uiSize: number
  /** Code font family; '' for the built-in one. */
  mono: string
  monoSize: number
  monoOnly: boolean
  ligatures: boolean
  tabWidth: number
  /** Whole-window zoom, 1 = 100%. */
  zoom: number
}

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
  fonts: Fonts
}

export const DEFAULT_FONTS: Fonts = { ui: '', uiSize: 13, mono: '', monoSize: 12, monoOnly: true, ligatures: false, tabWidth: 4, zoom: 1 }
export const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]

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
  fonts: DEFAULT_FONTS,
}

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem('settings') ?? '{}') as Partial<Settings>
    // Older builds kept the theme on its own.
    const theme = (localStorage.getItem('theme') as Settings['theme'] | null) ?? undefined
    return { ...DEFAULTS, ...(theme ? { theme } : {}), ...raw, proxy: { ...DEFAULTS.proxy, ...raw.proxy }, fonts: { ...DEFAULT_FONTS, ...raw.fonts } }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()

export const getSettings = () => current

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch, proxy: { ...current.proxy, ...patch.proxy }, fonts: { ...current.fonts, ...patch.fonts } }
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
  if (!patch || 'fonts' in patch) applyFonts(s.fonts)
}

/** The token sizes at the default 13px interface size; the others scale with it. */
const SIZES = { xs: 11, sm: 12, md: 13, lg: 15, xl: 20, '2xl': 28 }
const quote = (family: string) => `"${family.replace(/"/g, '')}"`
let zoom = 1

function applyFonts(f: Fonts) {
  const style = document.documentElement.style
  const set = (name: string, value: string | null) => (value === null ? style.removeProperty(name) : style.setProperty(name, value))
  // Chinese falls back to the CJK fonts in --sans whichever family comes first.
  set('--ff-sans', f.ui ? `${quote(f.ui)}, var(--sans)` : null)
  set('--ff-mono', f.mono ? `${quote(f.mono)}, var(--mono)` : null)
  const scale = f.uiSize / SIZES.md
  for (const [k, px] of Object.entries(SIZES)) set(`--fs-${k}`, scale === 1 ? null : `${Math.round(px * scale)}px`)
  set('--fs-code', `${f.monoSize}px`)
  set('--mono-liga', f.ligatures ? 'normal' : 'none')
  set('--tab-size', String(f.tabWidth))
  if (f.zoom !== zoom) {
    zoom = f.zoom
    void getCurrentWebview()
      .setZoom(f.zoom)
      .catch(() => {})
  }
}

/** ⌘+ / ⌘− step through ZOOMS, ⌘0 resets. */
export function stepZoom(dir: -1 | 0 | 1) {
  const now = current.fonts.zoom
  const next = dir === 0 ? 1 : dir > 0 ? (ZOOMS.find(z => z > now + 0.001) ?? now) : ([...ZOOMS].reverse().find(z => z < now - 0.001) ?? now)
  updateSettings({ fonts: { ...current.fonts, zoom: next } })
}

export const testConnection = () => invoke<number>('test_github')
