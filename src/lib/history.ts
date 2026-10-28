/**
 * File history (`git log --follow`) and blame (`git blame --porcelain`), parsed
 * for the File history window.
 */
import { git } from './git'

export type FileCommit = {
  hash: string
  short: string
  author: string
  time: number
  subject: string
  /** The file's path in that commit (it may have been renamed since). */ path: string
}

const LOG_FORMAT = '%x1e%H%x1f%h%x1f%an%x1f%at%x1f%s'

export function parseFileLog(out: string, path: string): FileCommit[] {
  return out
    .split('\x1e')
    .filter(b => b.trim())
    .map(block => {
      const [head = '', ...rest] = block.split('\n')
      const [hash = '', short = '', author = '', at = '0', subject = ''] = head.split('\x1f')
      // --name-only lists the file under the name it had in that commit.
      const named = rest.map(l => l.trim()).find(Boolean)
      return { hash, short, author, time: Number(at), subject, path: named ?? path }
    })
}

export async function fileLog(root: string, path: string, limit = 300) {
  return parseFileLog(await git(root, ['log', '--follow', `-n${limit}`, `--format=${LOG_FORMAT}`, '--name-only', '--', path]), path)
}

export type BlameLine = { hash: string; author: string; time: number; summary: string; line: number; text: string; /** First line of a run from the same commit. */ start: boolean }

const ZERO = /^0{40}$/

export function parseBlame(out: string): BlameLine[] {
  const commits = new Map<string, { author: string; time: number; summary: string }>()
  const lines: BlameLine[] = []
  let cur: { hash: string; line: number } | null = null
  for (const raw of out.split('\n')) {
    if (raw.startsWith('\t')) {
      if (!cur) continue
      const info = commits.get(cur.hash) ?? { author: '', time: 0, summary: '' }
      const prev = lines.at(-1)
      lines.push({ hash: cur.hash, ...info, line: cur.line, text: raw.slice(1), start: prev?.hash !== cur.hash })
      cur = null
      continue
    }
    const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(raw)
    if (head) {
      cur = { hash: head[1]!, line: Number(head[2]) }
      if (!commits.has(cur.hash)) commits.set(cur.hash, { author: ZERO.test(cur.hash) ? 'Not committed yet' : '', time: 0, summary: '' })
      continue
    }
    if (!cur) continue
    const c = commits.get(cur.hash)!
    if (raw.startsWith('author ')) c.author = ZERO.test(cur.hash) ? 'Not committed yet' : raw.slice(7)
    else if (raw.startsWith('author-time ')) c.time = Number(raw.slice(12))
    else if (raw.startsWith('summary ')) c.summary = raw.slice(8)
  }
  return lines
}

/** Blame of the working-tree file, or of the file as it was at `rev`. */
export async function blame(root: string, path: string, rev?: string) {
  return parseBlame(await git(root, ['blame', '--porcelain', ...(rev ? [rev] : []), '--', path]))
}
