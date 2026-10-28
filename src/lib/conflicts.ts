/**
 * A file with conflict markers, split into plain text and conflicts (with the
 * merge base when git wrote diff3 / zdiff3 markers), and put back together
 * from a choice per conflict.
 */
import { invoke } from '@tauri-apps/api/core'

export type Conflict = { kind: 'conflict'; ours: string; base?: string; theirs: string; oursLabel: string; theirsLabel: string }
export type Segment = { kind: 'text'; text: string } | Conflict
export type Choice = 'ours' | 'theirs' | 'both' | null

export function parseConflicts(text: string): Segment[] {
  const out: Segment[] = []
  const lines = text.split(/(?<=\n)/)
  let plain = ''
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (!l.startsWith('<<<<<<<')) {
      plain += l
      continue
    }
    // Find the end first, so a stray `<<<<<<<` without one stays plain text.
    const end = lines.findIndex((x, k) => k > i && x.startsWith('>>>>>>>'))
    if (end < 0) {
      plain += l
      continue
    }
    if (plain) out.push({ kind: 'text', text: plain })
    plain = ''
    const block = lines.slice(i + 1, end)
    const mid = block.findIndex(x => x.startsWith('======='))
    const baseAt = block.findIndex(x => x.startsWith('|||||||'))
    const oursEnd = baseAt >= 0 && baseAt < mid ? baseAt : mid
    out.push({
      kind: 'conflict',
      ours: block.slice(0, oursEnd).join(''),
      base: baseAt >= 0 && baseAt < mid ? block.slice(baseAt + 1, mid).join('') : undefined,
      theirs: block.slice(mid + 1).join(''),
      oursLabel: l.slice(7).trim(),
      theirsLabel: lines[end]!.slice(7).trim(),
    })
    i = end
  }
  if (plain) out.push({ kind: 'text', text: plain })
  return out
}

/** The file with each conflict replaced by its choice; unresolved ones keep their markers. */
export function resolve(segments: Segment[], choices: Choice[]) {
  let n = 0
  return segments
    .map(s => {
      if (s.kind === 'text') return s.text
      const c = choices[n++] ?? null
      if (c === 'ours') return s.ours
      if (c === 'theirs') return s.theirs
      if (c === 'both') return s.ours + s.theirs
      const base = s.base !== undefined ? `||||||| base\n${s.base}` : ''
      return `<<<<<<< ${s.oursLabel}\n${s.ours}${base}=======\n${s.theirs}>>>>>>> ${s.theirsLabel}\n`
    })
    .join('')
}

export const hasMarkers = (text: string) => /^(<<<<<<<|>>>>>>>)( |$)/m.test(text)

export const readWorkFile = (repo: string, path: string) => invoke<string>('read_work_file', { repo, path })
export const writeWorkFile = (repo: string, path: string, contents: string) => invoke<void>('write_work_file', { repo, path, contents })
