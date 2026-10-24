/** A unified diff split into hunks of numbered lines, for the diff viewer. */

export type DiffLine = {
  kind: 'ctx' | 'add' | 'del' | 'meta'
  old?: number
  new?: number
  text: string
}

export type Hunk = { header: string; lines: DiffLine[] }

export function parseDiff(text: string): Hunk[] {
  const hunks: Hunk[] = []
  let cur: Hunk | undefined
  let o = 0
  let n = 0
  for (const raw of text.split('\n')) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw)
    if (m) {
      o = Number(m[1])
      n = Number(m[2])
      cur = { header: raw, lines: [] }
      hunks.push(cur)
      continue
    }
    if (!cur) continue
    if (raw.startsWith('+')) cur.lines.push({ kind: 'add', new: n++, text: raw.slice(1) })
    else if (raw.startsWith('-')) cur.lines.push({ kind: 'del', old: o++, text: raw.slice(1) })
    else if (raw.startsWith('\\')) cur.lines.push({ kind: 'meta', text: raw.slice(2) })
    else if (raw.startsWith(' ')) cur.lines.push({ kind: 'ctx', old: o++, new: n++, text: raw.slice(1) })
    else if (raw === '' && cur.lines.length) continue
  }
  return hunks
}

export const diffStats = (hunks: Hunk[]) =>
  hunks.reduce(
    (acc, h) => {
      for (const l of h.lines) {
        if (l.kind === 'add') acc.added++
        if (l.kind === 'del') acc.deleted++
      }
      return acc
    },
    { added: 0, deleted: 0 },
  )

/** Side-by-side rows: context on both sides, a run of removals paired with the additions after it. */
export function pairLines(lines: DiffLine[]): [DiffLine | null, DiffLine | null][] {
  const rows: [DiffLine | null, DiffLine | null][] = []
  for (let i = 0; i < lines.length;) {
    const l = lines[i]!
    if (l.kind === 'del' || l.kind === 'add') {
      const dels: DiffLine[] = []
      const adds: DiffLine[] = []
      while (lines[i]?.kind === 'del') dels.push(lines[i++]!)
      while (lines[i]?.kind === 'add') adds.push(lines[i++]!)
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k] ?? null, adds[k] ?? null])
    } else {
      rows.push([l, l])
      i++
    }
  }
  return rows
}
