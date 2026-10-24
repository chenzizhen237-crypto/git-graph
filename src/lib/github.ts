/**
 * Pull requests through the GitHub CLI (`gh`), which brings its own sign-in.
 * Reads return typed JSON; writes return the arguments, so the UI runs them
 * through the same busy / toast / refresh path as git actions.
 */
import { invoke } from '@tauri-apps/api/core'

import type { GitOutput } from './git'

export class GhError extends Error {
  constructor(readonly output: GitOutput) {
    super(output.stderr.trim() || output.stdout.trim() || `gh failed (${output.code})`)
  }
}

export const runGh = (repo: string, args: string[], stdin?: string) => invoke<GitOutput>('gh', { repo, args, stdin: stdin ?? null })

export async function gh(repo: string, args: string[], stdin?: string) {
  const out = await runGh(repo, args, stdin)
  if (out.code !== 0) throw new GhError(out)
  return out.stdout
}

export const openUrl = (url: string) => invoke<void>('open_url', { url })

export type Actor = { login: string; name?: string; is_bot?: boolean }

export type Check = {
  __typename: 'CheckRun' | 'StatusContext'
  name?: string
  context?: string
  workflowName?: string
  status?: string
  conclusion?: string
  state?: string
  detailsUrl?: string
  targetUrl?: string
}

export type PrState = 'OPEN' | 'CLOSED' | 'MERGED'
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | ''

export type PrSummary = {
  number: number
  title: string
  state: PrState
  isDraft: boolean
  author: Actor
  headRefName: string
  baseRefName: string
  reviewDecision: ReviewDecision
  statusCheckRollup: Check[]
  updatedAt: string
  additions: number
  deletions: number
  comments: unknown[]
  labels: { name: string; color: string }[]
}

export type Review = { author: Actor; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'; body: string; submittedAt: string }
export type Comment = { author: Actor; body: string; createdAt: string; url?: string }
export type PrCommit = { oid: string; messageHeadline: string; authoredDate: string; authors: { login: string; name: string }[] }
export type PrFile = { path: string; additions: number; deletions: number; changeType: string }

export type PrDetail = Omit<PrSummary, 'comments'> & {
  body: string
  url: string
  createdAt: string
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  mergeStateStatus: string
  changedFiles: number
  reviewRequests: { login?: string; name?: string }[]
  reviews: Review[]
  comments: Comment[]
  commits: PrCommit[]
  files: PrFile[]
}

export type RepoInfo = { nameWithOwner: string; url: string; defaultBranchRef: { name: string }; viewerPermission: string }

const LIST_FIELDS = 'number,title,state,isDraft,author,headRefName,baseRefName,reviewDecision,statusCheckRollup,updatedAt,additions,deletions,comments,labels'
const VIEW_FIELDS = `${LIST_FIELDS},body,url,createdAt,mergeable,mergeStateStatus,changedFiles,reviewRequests,reviews,commits,files`

export type PrFilter = 'open' | 'mine' | 'review' | 'closed' | 'merged'

export async function repoInfo(root: string): Promise<RepoInfo> {
  return JSON.parse(await gh(root, ['repo', 'view', '--json', 'nameWithOwner,url,defaultBranchRef,viewerPermission']))
}

export async function listPrs(root: string, filter: PrFilter): Promise<PrSummary[]> {
  const args = ['pr', 'list', '--json', LIST_FIELDS, '--limit', '100']
  if (filter === 'closed') args.push('--state', 'closed')
  else if (filter === 'merged') args.push('--state', 'merged')
  else if (filter === 'mine') args.push('--author', '@me')
  else if (filter === 'review') args.push('--search', 'review-requested:@me')
  return JSON.parse(await gh(root, args))
}

const detailCache = new Map<string, PrDetail>()

/** A PR's details; the last copy seen, so switching back is instant while it refreshes. */
export const cachedPr = (root: string, n: number) => detailCache.get(`${root}#${n}`)

export async function viewPr(root: string, n: number): Promise<PrDetail> {
  const pr: PrDetail = JSON.parse(await gh(root, ['pr', 'view', String(n), '--json', VIEW_FIELDS]))
  detailCache.set(`${root}#${n}`, pr)
  return pr
}

let viewer: Promise<string> | undefined
/** The signed-in GitHub login, asked once. */
export const viewerLogin = (root: string) => (viewer ??= gh(root, ['api', 'user', '--jq', '.login']).then(s => s.trim()).catch(() => ''))

/** The PR's patch, split per file so each opens in the diff viewer. */
export async function prDiff(root: string, n: number): Promise<Map<string, string>> {
  return splitPatch(await gh(root, ['pr', 'diff', String(n), '--color', 'never']))
}

/** A multi-file patch keyed by each file's new path. */
export function splitPatch(patch: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const chunk of patch.split(/^(?=diff --git )/m)) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk)
    if (m) files.set(m[2]!, chunk)
  }
  return files
}

/** The branch name of the PR for the current branch, if one is open. */
export async function prForBranch(root: string): Promise<number | null> {
  const out = await runGh(root, ['pr', 'view', '--json', 'number'])
  return out.code === 0 ? (JSON.parse(out.stdout).number as number) : null
}

/** One state for a PR's checks: what the badge shows. */
export function checkState(checks: Check[]): 'pass' | 'fail' | 'pending' | 'none' {
  if (!checks.length) return 'none'
  const result = (c: Check) => (c.conclusion || c.state || c.status || '').toUpperCase()
  if (checks.some(c => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(result(c)))) return 'fail'
  if (checks.some(c => ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING', ''].includes(result(c)) && c.status !== 'COMPLETED')) return 'pending'
  return 'pass'
}

export const prActions = {
  checkout: (n: number) => ['pr', 'checkout', String(n)],
  merge: (n: number, how: 'merge' | 'squash' | 'rebase', deleteBranch: boolean) => ['pr', 'merge', String(n), `--${how}`, ...(deleteBranch ? ['--delete-branch'] : [])],
  review: (n: number, kind: 'approve' | 'request-changes' | 'comment') => ['pr', 'review', String(n), `--${kind}`, '--body-file', '-'],
  comment: (n: number) => ['pr', 'comment', String(n), '--body-file', '-'],
  close: (n: number) => ['pr', 'close', String(n)],
  reopen: (n: number) => ['pr', 'reopen', String(n)],
  ready: (n: number) => ['pr', 'ready', String(n)],
  draft: (n: number) => ['pr', 'ready', String(n), '--undo'],
  create: (title: string, base: string, head: string, draft: boolean) => ['pr', 'create', '--title', title, '--base', base, '--head', head, '--body-file', '-', ...(draft ? ['--draft'] : [])],
}

/** `2026-10-24T13:15:57Z` → `3 hours ago`. */
export function relTime(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2629800, 'month'],
    [31557600, 'year'],
  ]
  let [div, name] = units[0]!
  for (const u of units) if (s >= u[0]) [div, name] = u
  const n = Math.floor(s / div)
  return `${n} ${name}${n > 1 ? 's' : ''} ago`
}
