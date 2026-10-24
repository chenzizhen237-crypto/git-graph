import type { BranchRef } from './types'

/** One ref the branch picker lists: the `git log` argument it scopes to. */
export type PickItem = { ref: BranchRef; value: string; synced: boolean }

export type PickSections = { local: PickItem[]; remote: PickItem[]; tag: PickItem[] }

/** The scopes above the ref list, by the `git log` argument each stands for. */
export const QUICK_SCOPES = [
  { value: '--all', label: 'All branches' },
  { value: 'HEAD', label: 'Current branch' },
  { value: '--branches', label: 'Local only' },
] as const

/**
 * The refs the picker lists, in three sections. A remote whose local
 * namesake or tracking branch exists folds into that local row (`synced`),
 * so `main` and `origin/main` are one row, not two. HEAD comes first.
 */
export function pickSections(refs: BranchRef[]): PickSections {
  const locals = refs.filter(r => r.kind === 'local')
  const names = new Set(locals.map(r => r.name))
  const upstreams = new Set(locals.map(r => r.upstream).filter(Boolean))
  const folds = (r: BranchRef) => upstreams.has(r.name) || names.has(r.name.slice(r.name.indexOf('/') + 1))
  const remotes = refs.filter(r => r.kind === 'remote')
  const mirrored = new Set(remotes.filter(folds).map(r => r.name))
  const synced = (r: BranchRef) =>
    (!!r.upstream && mirrored.has(r.upstream)) || remotes.some(m => m.name.endsWith(`/${r.name}`))
  return {
    local: [...locals]
      .sort((a, b) => Number(b.isHead) - Number(a.isHead))
      .map(ref => ({ ref, value: ref.name, synced: synced(ref) })),
    remote: remotes.filter(r => !folds(r)).map(ref => ({ ref, value: ref.name, synced: false })),
    tag: refs.filter(r => r.kind === 'tag').map(ref => ({ ref, value: `refs/tags/${ref.name}`, synced: false })),
  }
}

/** Items whose name holds `query`, ignoring case; all of them when it is empty. */
export function matchItems(items: PickItem[], query: string) {
  const q = query.trim().toLowerCase()
  return q ? items.filter(i => i.ref.name.toLowerCase().includes(q)) : items
}

export type NamePart = { text: string; dim?: true; hit?: true }

/**
 * A name in runs to draw: the prefix up to the last `/` dim, the tail
 * strong, and the match of `query` lit (in the tail when it is there).
 */
export function nameParts(name: string, query: string): NamePart[] {
  const at = name.lastIndexOf('/') + 1
  const q = query.trim().toLowerCase()
  const lower = name.toLowerCase()
  let hit = q ? lower.indexOf(q, at) : -1
  if (q && hit < 0) hit = lower.indexOf(q)
  const end = hit + q.length
  const cuts = [...new Set([0, at, ...(hit >= 0 ? [hit, end] : []), name.length])].sort((a, b) => a - b)
  const parts: NamePart[] = []
  for (let k = 0; k < cuts.length - 1; k++) {
    const [from, to] = [cuts[k]!, cuts[k + 1]!]
    if (from === to) continue
    parts.push({
      text: name.slice(from, to),
      ...(from < at ? { dim: true as const } : {}),
      ...(hit >= 0 && from >= hit && to <= end ? { hit: true as const } : {}),
    })
  }
  return parts
}

/** What the scope button reads for a `git log` argument. */
export function scopeLabel(branch: string) {
  const quick = QUICK_SCOPES.find(s => s.value === branch)
  if (quick) return quick.label
  const name = branch.replace(/^refs\/tags\//, '')
  return name.includes('..') ? name : name.slice(name.lastIndexOf('/') + 1)
}

/** `3 days ago` as `3d`, `2 months ago` as `2mo`. */
export function compactAgo(ago: string) {
  const m = /(\d+) (second|minute|hour|day|week|month|year)/.exec(ago)
  if (!m) return ago
  return `${m[1]}${m[2] === 'month' ? 'mo' : m[2]![0]}`
}
