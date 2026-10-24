import type { BranchRef, CommitDetail, CommitFile, FileChange, LogQuery, LogRow, StashEntry } from './types'

export const SEP = '\x1f'

/** Records end in \x1e, since the body may hold newlines. */
export const LOG_FORMAT = `${['%H', '%h', '%P', '%an', '%ae', '%at', '%ar', '%D', '%s', '%b'].join('%x1f')}%x1e`
export const RS = '\x1e'

export const isFiltered = (ui: LogQuery) => !!(ui.query || ui.author || ui.since)

export function logArgs(ui: LogQuery): string[] {
  const argv = ['git', 'log', '--date-order', '--color=never', `--format=${LOG_FORMAT}`, `-n${ui.limit + 1}`]
  if (ui.query) argv.push('-i', `--grep=${ui.query}`)
  if (ui.author) argv.push('-i', `--author=${ui.author}`)
  if (ui.since) argv.push(`--since=${ui.since}`)
  if (ui.branch === '--all') argv.push('--all')
  else if (ui.branch) argv.push(ui.branch)
  argv.push('--')
  return argv
}

export type LogCommit = Omit<LogRow, 'graph'>

export function parseLog(stdout: string, limit: number) {
  const commits: LogCommit[] = []
  let hasMore = false
  for (const record of stdout.split(RS)) {
    const line = record.replace(/^\n+/, '')
    if (!line) continue
    if (commits.length === limit) {
      hasMore = true
      break
    }
    const [hash = '', short = '', parents = '', author = '', email = '', time = '0', ago = '', refs = '', subject = '', body = ''] = line.split(SEP)
    commits.push({
      hash,
      short,
      parents: parents ? parents.split(' ') : [],
      author,
      email,
      time: Number(time),
      ago,
      refs: refs ? refs.split(', ').filter(Boolean) : [],
      subject,
      body: body.split('\n').find(l => l.trim()) ?? '',
    })
  }
  return { commits, hasMore }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n: number) => String(n).padStart(2, '0')

/** `14:05` today, `Oct 22` this year, `2025-03-01` before. */
export function shortDate(time: number, now = Date.now()): string {
  const d = new Date(time * 1000)
  const n = new Date(now)
  if (d.toDateString() === n.toDateString()) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (d.getFullYear() === n.getFullYear()) return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function fullDate(time: number): string {
  const d = new Date(time * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export const REFS_FORMAT = ['%(refname)', '%(objectname)', '%(upstream:short)', '%(upstream:track)', '%(HEAD)', '%(committerdate:relative)', '%(contents:subject)'].join('%1f')

export function parseRefs(stdout: string): BranchRef[] {
  const refs: BranchRef[] = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const [ref = '', hash = '', upstream = '', track = '', head = '', date = '', subject = ''] = line.split(SEP)
    let kind: BranchRef['kind']
    let name: string
    if (ref.startsWith('refs/heads/')) {
      kind = 'local'
      name = ref.slice(11)
    } else if (ref.startsWith('refs/remotes/')) {
      kind = 'remote'
      name = ref.slice(13)
      if (name.endsWith('/HEAD')) continue
    } else if (ref.startsWith('refs/tags/')) {
      kind = 'tag'
      name = ref.slice(10)
    } else continue
    refs.push({
      name,
      kind,
      hash,
      upstream: upstream || undefined,
      track: track || undefined,
      isHead: head === '*',
      date,
      subject,
    })
  }
  return refs
}

/** `git status --porcelain=v1 -b -z`: the branch line, then the entries. */
export function parseStatus(stdout: string) {
  const parts = stdout.split('\0')
  const changes: FileChange[] = []
  let branch = ''
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    if (part.startsWith('## ')) {
      const head = part.slice(3)
      const m = /^(.*?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(head)
      branch = (m?.[1] ?? head).replace(/^No commits yet on /, '')
      upstream = m?.[2]
      const track = m?.[3] ?? ''
      ahead = Number(/ahead (\d+)/.exec(track)?.[1] ?? 0)
      behind = Number(/behind (\d+)/.exec(track)?.[1] ?? 0)
      continue
    }
    const x = part[0] ?? ' '
    const y = part[1] ?? ' '
    const path = part.slice(3)
    if (x === 'R' || x === 'C') {
      changes.push({ x, y, path, orig: parts[++i] })
    } else changes.push({ x, y, path })
  }
  return { branch, upstream, ahead, behind, changes }
}

export function parseStashes(stdout: string): StashEntry[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [ref = '', subject = '', when = ''] = line.split(SEP)
      return { ref, subject, when }
    })
}

export function parseNameStatus(stdout: string): CommitFile[] {
  const files: CommitFile[] = []
  const parts = stdout.split('\0').filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i] ?? ''
    if (/^[RC]/.test(status)) {
      files.push({ status: status.charAt(0), orig: parts[i + 1], path: parts[i + 2] ?? '' })
      i += 2
    } else {
      files.push({ status: status.charAt(0), path: parts[i + 1] ?? '' })
      i += 1
    }
  }
  return files
}

/**
 * `git diff-tree --numstat -z`: `added\tdeleted\tpath\0`, or for a rename
 * `added\tdeleted\t\0old\0new\0`; `-` for a binary file. Merged into `files`
 * by path.
 */
export function mergeNumstat(files: CommitFile[], stdout: string): CommitFile[] {
  const counts = new Map<string, { added?: number; deleted?: number }>()
  const parts = stdout.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    const [a = '', d = '', inline] = part.split('\t')
    const path = inline || parts[i + 2] || ''
    if (!inline) i += 2
    counts.set(path, a === '-' ? {} : { added: Number(a), deleted: Number(d) })
  }
  return files.map(f => ({ ...f, ...(counts.get(f.path) ?? {}) }))
}

/** The first-parent line through `hash`: its ancestors down and the chain of children up. */
export function branchPath(rows: { hash: string; parents: string[]; graph: { lane: number } }[], hash: string): Set<string> {
  const byHash = new Map(rows.map(r => [r.hash, r]))
  const path = new Set<string>([hash])
  let cur = byHash.get(hash)
  while (cur?.parents[0]) {
    const p = byHash.get(cur.parents[0])
    if (!p || path.has(p.hash)) break
    path.add(p.hash)
    cur = p
  }
  cur = byHash.get(hash)
  while (cur) {
    const here = cur
    const children = rows.filter(r => r.parents[0] === here.hash)
    const next = children.find(r => r.graph.lane === here.graph.lane) ?? children[0]
    if (!next || path.has(next.hash)) break
    path.add(next.hash)
    cur = next
  }
  return path
}

export const SHOW_FORMAT = ['%H', '%P', '%an <%ae>', '%ad', '%cn', '%B'].join('%x1f')

export function parseShow(stdout: string): Omit<CommitDetail, 'files'> {
  const [hash = '', parents = '', author = '', date = '', committer = '', ...body] = stdout.split(SEP)
  return {
    hash,
    parents: parents ? parents.split(' ') : [],
    author,
    date,
    committer,
    body: body.join(SEP).trim(),
  }
}

/** Drops everything before the first hunk, so `Code format="diff"` parses it. */
export function hunksOnly(diff: string): string {
  const at = diff.indexOf('\n@@')
  if (diff.startsWith('@@')) return diff
  return at < 0 ? '' : diff.slice(at + 1)
}

/** What a status letter means, for chips and tooltips. */
export const STATUS_NAMES: Record<string, string> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'conflict',
  T: 'type changed',
  '?': 'untracked',
}

export const STATUS_COLORS: Record<string, string> = {
  M: 'var(--status-modified)',
  A: 'var(--status-added)',
  D: 'var(--status-deleted)',
  R: 'var(--status-renamed)',
  C: 'var(--status-renamed)',
  U: 'var(--status-conflict)',
  T: 'var(--status-modified)',
  '?': 'var(--text-muted)',
}

export const isConflict = (c: FileChange) => c.x === 'U' || c.y === 'U' || (c.x === 'A' && c.y === 'A') || (c.x === 'D' && c.y === 'D')
export const isStaged = (c: FileChange) => c.x !== ' ' && c.x !== '?' && !isConflict(c)
export const isUnstaged = (c: FileChange) => c.y !== ' ' || c.x === '?'
