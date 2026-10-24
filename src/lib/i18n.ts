/**
 * English / 简体中文. Strings are written in English in the code and looked up
 * in the Chinese table by that text; `{name}` placeholders are filled from
 * `vars`. A string missing from the table shows in English.
 */

import zh from './i18n.zh'
import { getSettings, type Language, useSettings } from './settings'

export type Vars = Record<string, string | number>

const TABLES: Record<Language, Record<string, string> | null> = { en: null, zh }

export function translate(lang: Language, text: string, vars?: Vars) {
  const s = TABLES[lang]?.[text] ?? text
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** For code outside React (toasts, dialogs built in callbacks). */
export const t = (text: string, vars?: Vars) => translate(getSettings().language, text, vars)

/** Re-renders when the language changes. */
export function useT() {
  const { language } = useSettings()
  return (text: string, vars?: Vars) => translate(language, text, vars)
}

const UNITS: [number, string][] = [
  [60, 'minute'],
  [3600, 'hour'],
  [86400, 'day'],
  [604800, 'week'],
  [2629800, 'month'],
  [31557600, 'year'],
]

/** `3 hours ago` / `3 小时前`, from a timestamp in milliseconds. */
export function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return t('just now')
  let [div, name] = UNITS[0]!
  for (const u of UNITS) if (s >= u[0]) [div, name] = u
  const n = Math.floor(s / div)
  return t(n === 1 ? `{n} ${name} ago` : `{n} ${name}s ago`, { n })
}
