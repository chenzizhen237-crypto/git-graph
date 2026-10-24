import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import zh from '../i18n.zh'

const SRC = join(__dirname, '..', '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p)
    return /\.tsx?$/.test(name) && !name.startsWith('i18n') ? [p] : []
  })
}

/** Every literal passed straight to t('…'), plus both arms of t(cond ? '…' : '…'). */
function usedKeys() {
  const keys = new Set<string>()
  for (const file of sources(SRC)) {
    const code = readFileSync(file, 'utf8')
    for (const m of code.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(fromSource(m[1]!))
    for (const m of code.matchAll(/\bt\(([^()]*?\?\s*'[^']*'\s*:\s*'[^']*')/g)) for (const k of m[1]!.matchAll(/'((?:[^'\\]|\\.)*)'/g)) keys.add(fromSource(k[1]!))
  }
  return [...keys]
}

/** Source text to the runtime string: `\\` → `\`, `\'` → `'`. */
const fromSource = (s: string) => s.replace(/\\(.)/g, '$1')

test('every UI string has a Chinese translation', () => {
  const missing = usedKeys().filter(k => !(k in zh) && /[a-z]/i.test(k) && !/^(APPROVED|CHANGES_REQUESTED|DISMISSED)$/.test(k))
  expect(missing).toEqual([])
})

test('placeholders survive translation', () => {
  for (const [en, cn] of Object.entries(zh)) {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
    expect(vars(cn), en).toEqual(vars(en))
  }
})
