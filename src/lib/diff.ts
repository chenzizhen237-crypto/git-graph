/** A unified diff split into hunks of numbered lines, for the diff viewer. */

export type DiffLine = {
  kind: 'ctx' | 'add' | 'del' | 'meta'
  old?: number
  new?: number
  text: string
}

export type Hunk = { header: string; lines: DiffLine[] }

/** Above this line count, DiffView collapses the diff behind a "Show diff anyway" guard. */
export const LARGE_DIFF_LINES = 2000

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

export const countDiffLines = (hunks: Hunk[]) => hunks.reduce((n, h) => n + h.lines.length, 0)

export type IndexedLine = { line: DiffLine; index: number }

/** Side-by-side rows with each line's original index in `hunk.lines` (for split-view line picking). */
export function pairLinesIndexed(lines: DiffLine[]): [IndexedLine | null, IndexedLine | null][] {
  const rows: [IndexedLine | null, IndexedLine | null][] = []
  for (let i = 0; i < lines.length;) {
    const l = lines[i]!
    if (l.kind === 'del' || l.kind === 'add') {
      const dels: IndexedLine[] = []
      const adds: IndexedLine[] = []
      while (lines[i]?.kind === 'del') {
        dels.push({ line: lines[i]!, index: i })
        i++
      }
      while (lines[i]?.kind === 'add') {
        adds.push({ line: lines[i]!, index: i })
        i++
      }
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k] ?? null, adds[k] ?? null])
    } else {
      rows.push([
        { line: l, index: i },
        { line: l, index: i },
      ])
      i++
    }
  }
  return rows
}

/** Side-by-side rows: context on both sides, a run of removals paired with the additions after it. */
export function pairLines(lines: DiffLine[]): [DiffLine | null, DiffLine | null][] {
  return pairLinesIndexed(lines).map(([a, b]) => [a?.line ?? null, b?.line ?? null])
}

export type InlineSpan = { text: string; changed?: boolean }

const MAX_INLINE_TOKENS = 300

/**
 * Word/token-level inline diff for a modified line pair.
 * Trims common prefix/suffix first (O(n)), then uses token LCS for the middle.
 */
export function inlineDiff(oldText: string, newText: string): [InlineSpan[], InlineSpan[]] {
  if (oldText === newText) return [[{ text: oldText }], [{ text: newText }]]
  const a = oldText.match(/\w+|\s+|[^\w\s]+/g) ?? []
  const b = newText.match(/\w+|\s+|[^\w\s]+/g) ?? []
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const prefix = start > 0 ? a.slice(0, start).join('') : ''
  const suffix = endA < a.length ? a.slice(endA).join('') : ''

  // Very long lines (e.g. minified JS): highlight only the trimmed middle range in O(n).
  if (midA.length * midB.length > MAX_INLINE_TOKENS * MAX_INLINE_TOKENS) {
    const oldSpans: InlineSpan[] = []
    const newSpans: InlineSpan[] = []
    if (prefix) {
      oldSpans.push({ text: prefix })
      newSpans.push({ text: prefix })
    }
    if (midA.length) oldSpans.push({ text: midA.join(''), changed: true })
    if (midB.length) newSpans.push({ text: midB.join(''), changed: true })
    if (suffix) {
      oldSpans.push({ text: suffix })
      newSpans.push({ text: suffix })
    }
    return [oldSpans, newSpans]
  }

  const m = midA.length
  const n = midB.length
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    const row = dp[i]!
    const next = dp[i + 1]!
    for (let j = n - 1; j >= 0; j--) {
      row[j] = midA[i] === midB[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!)
    }
  }

  const push = (list: InlineSpan[], text: string, changed: boolean) => {
    if (!text) return
    const last = list.at(-1)
    if (last && Boolean(last.changed) === changed) last.text += text
    else list.push(changed ? { text, changed: true } : { text })
  }

  const oldSpans: InlineSpan[] = []
  const newSpans: InlineSpan[] = []
  push(oldSpans, prefix, false)
  push(newSpans, prefix, false)

  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (midA[i] === midB[j]) {
      push(oldSpans, midA[i]!, false)
      push(newSpans, midB[j]!, false)
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push(oldSpans, midA[i]!, true)
      i++
    } else {
      push(newSpans, midB[j]!, true)
      j++
    }
  }
  while (i < m) push(oldSpans, midA[i++]!, true)
  while (j < n) push(newSpans, midB[j++]!, true)

  push(oldSpans, suffix, false)
  push(newSpans, suffix, false)
  return [oldSpans, newSpans]
}

/**
 * A patch for `git apply --recount` holding one hunk, or only `selected` lines of it
 * (indexes into hunk.lines). `forward` applies the change (stage); `reverse` is for
 * `--reverse` (unstage, discard). Lines left out keep the side the patch applies to:
 * forward, an unselected removal stays as context and an unselected addition is
 * dropped; reverse, the other way round.
 */
export function hunkPatch(path: string, hunk: Hunk, selected: Set<number> | null, direction: 'forward' | 'reverse') {
  const out: string[] = []
  let kept = true
  hunk.lines.forEach((l, i) => {
    const take = !selected || selected.has(i)
    if (l.kind === 'meta') {
      // "\ No newline at end of file" belongs to the line before it.
      if (kept) out.push(`\\ ${l.text}`)
      return
    }
    kept = true
    if (l.kind === 'ctx') out.push(` ${l.text}`)
    else if (take) out.push(`${l.kind === 'add' ? '+' : '-'}${l.text}`)
    else if ((l.kind === 'del') === (direction === 'forward')) out.push(` ${l.text}`)
    else kept = false
  })
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${hunk.header}\n${out.join('\n')}\n`
}
