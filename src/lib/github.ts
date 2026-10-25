/**
 * Pull requests. Reads go to GitHub's API over the app's kept-alive client
 * (one GraphQL round trip per screen, cached so revisits are instant); writes
 * go through the GitHub CLI (`gh`) and return arguments, so the UI runs them
 * through the same busy / toast / refresh path as git actions.
 */
import { invoke } from '@tauri-apps/api/core'

import { type GitOutput, git } from './git'
import { timeAgo } from './i18n'

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
  commentCount: number
  labels: { name: string; color: string }[]
}

export type Review = { author: Actor; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'; body: string; submittedAt: string }
export type Comment = { author: Actor; body: string; createdAt: string; url?: string }
export type PrCommit = { oid: string; messageHeadline: string; authoredDate: string; authors: { login: string; name: string }[] }
export type PrFile = { path: string; additions: number; deletions: number; changeType: string }

export type PrDetail = Omit<PrSummary, 'commentCount'> & {
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

export const graphql = <T>(query: string, variables: Record<string, unknown> = {}) => invoke<T>('github_graphql', { query, variables })
export const rest = (path: string, accept?: string) => invoke<string>('github_rest', { path, accept: accept ?? null })

/** owner/name of the repository's GitHub remote (origin first). */
const slugs = new Map<string, Promise<{ owner: string; name: string }>>()
export function repoSlug(root: string) {
  let p = slugs.get(root)
  if (!p) {
    p = (async () => {
      const remotes = (await git(root, ['remote'])).split('\n').filter(Boolean)
      for (const r of ['origin', ...remotes.filter(x => x !== 'origin')]) {
        if (!remotes.includes(r)) continue
        const url = (await git(root, ['remote', 'get-url', r])).trim()
        const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url)
        if (m) return { owner: m[1]!, name: m[2]! }
      }
      throw new Error('This repository has no GitHub remote.')
    })()
    p.catch(() => slugs.delete(root))
    slugs.set(root, p)
  }
  return p
}

// ─── Cache: show the last copy at once, refresh behind it ──────────────────

const memory = new Map<string, unknown>()
export function cached<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const raw = localStorage.getItem(`gh:${key}`)
    if (raw) return JSON.parse(raw) as T
  } catch {}
  return undefined
}
function remember<T>(key: string, value: T, persist = false) {
  memory.set(key, value)
  if (persist)
    try {
      localStorage.setItem(`gh:${key}`, JSON.stringify(value))
    } catch {}
  return value
}

// ─── Queries ───────────────────────────────────────────────────────────────

const PR_FIELDS = `number title state isDraft updatedAt createdAt headRefName baseRefName additions deletions reviewDecision
  author { login } comments { totalCount } labels(first: 10) { nodes { name color } }`
const CHECKS = `commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes {
  __typename
  ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
  ... on StatusContext { context state targetUrl } } } } } } }`

type RawPr = Omit<PrSummary, 'statusCheckRollup' | 'commentCount' | 'labels' | 'reviewDecision'> & {
  createdAt: string
  reviewDecision: ReviewDecision | null
  comments: { totalCount: number }
  labels: { nodes: { name: string; color: string }[] }
  commits?: { nodes: { commit: { statusCheckRollup: { state: string; contexts?: { nodes: RawCheck[] } } | null } }[] }
  rollup?: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
}
type RawCheck = Check & { checkSuite?: { workflowRun?: { workflow?: { name: string } } } }

function toSummary(p: RawPr): PrSummary {
  const lastCommit = (p.commits ?? p.rollup)?.nodes[0]?.commit.statusCheckRollup
  const contexts = (lastCommit as { contexts?: { nodes: RawCheck[] } } | null | undefined)?.contexts?.nodes
  const checks: Check[] = contexts
    ? contexts.map(c => ({ ...c, workflowName: c.checkSuite?.workflowRun?.workflow?.name }))
    : lastCommit
      ? [{ __typename: 'StatusContext', state: lastCommit.state }]
      : []
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    isDraft: p.isDraft,
    author: p.author ?? { login: 'ghost' },
    headRefName: p.headRefName,
    baseRefName: p.baseRefName,
    reviewDecision: p.reviewDecision ?? '',
    statusCheckRollup: checks,
    updatedAt: p.updatedAt,
    additions: p.additions,
    deletions: p.deletions,
    commentCount: p.comments.totalCount,
    labels: p.labels.nodes,
  }
}

export type PrFilter = 'open' | 'mine' | 'review' | 'closed' | 'merged'

const SEARCH: Record<PrFilter, string> = {
  open: 'is:open',
  mine: 'is:open author:@me',
  review: 'is:open review-requested:@me',
  merged: 'is:merged',
  closed: 'is:closed is:unmerged',
}

export type PrList = { info: RepoInfo; viewer: string; prs: PrSummary[] }

/** The repository, the signed-in user and one page of PRs, in one round trip. */
export async function listPrs(root: string, filter: PrFilter): Promise<PrList> {
  const { owner, name } = await repoSlug(root)
  const data = await graphql<{
    repository: RepoInfo & { defaultBranchRef: { name: string } | null }
    viewer: { login: string }
    search: { nodes: RawPr[] }
  }>(
    `query($owner: String!, $name: String!, $q: String!) {
      repository(owner: $owner, name: $name) { nameWithOwner url viewerPermission defaultBranchRef { name } }
      viewer { login }
      search(query: $q, type: ISSUE, first: 60) { nodes { ... on PullRequest { ${PR_FIELDS}
        rollup: commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } } }
    }`,
    { owner, name, q: `repo:${owner}/${name} is:pr ${SEARCH[filter]} sort:updated-desc` },
  )
  const info = { ...data.repository, defaultBranchRef: data.repository.defaultBranchRef ?? { name: 'main' } }
  return remember(`${root}|list|${filter}`, { info, viewer: data.viewer.login, prs: data.search.nodes.filter(n => n.number).map(toSummary) }, true)
}

export const cachedList = (root: string, filter: PrFilter) => cached<PrList>(`${root}|list|${filter}`)
export const cachedPr = (root: string, n: number) => cached<PrDetail>(`${root}|pr|${n}`)

const inflight = new Map<string, Promise<unknown>>()
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const p = (inflight.get(key) as Promise<T> | undefined) ?? run().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function viewPr(root: string, n: number): Promise<PrDetail> {
  return once(`${root}|pr|${n}`, async () => {
    const { owner, name } = await repoSlug(root)
    const data = await graphql<{ repository: { pullRequest: RawPr & Record<string, unknown> } }>(
      `query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $n) {
        ${PR_FIELDS} ${CHECKS}
        body url mergeable mergeStateStatus changedFiles
        reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } ... on Team { name } } } }
        reviews(last: 50) { nodes { author { login } state body submittedAt } }
        commentList: comments(last: 100) { nodes { author { login } body createdAt url } }
        commitList: commits(first: 100) { nodes { commit { oid messageHeadline authoredDate authors(first: 5) { nodes { name user { login } } } } } }
        files(first: 100) { nodes { path additions deletions changeType } }
      } } }`,
      { owner, name, n },
    )
    const raw = data.repository.pullRequest as RawPr & {
      body: string
      url: string
      mergeable: PrDetail['mergeable']
      mergeStateStatus: string
      changedFiles: number
      reviewRequests: { nodes: { requestedReviewer: { login?: string; name?: string } | null }[] }
      reviews: { nodes: (Omit<Review, 'author'> & { author: Actor | null })[] }
      commentList: { nodes: (Omit<Comment, 'author'> & { author: Actor | null })[] }
      commitList: { nodes: { commit: { oid: string; messageHeadline: string; authoredDate: string; authors: { nodes: { name: string; user: { login: string } | null }[] } } }[] }
      files: { nodes: PrFile[] } | null
    }
    const ghost = { login: 'ghost' }
    const { commentCount: _count, ...summary } = toSummary(raw)
    const pr: PrDetail = {
      ...summary,
      body: raw.body,
      url: raw.url,
      createdAt: raw.createdAt,
      mergeable: raw.mergeable,
      mergeStateStatus: raw.mergeStateStatus,
      changedFiles: raw.changedFiles,
      reviewRequests: raw.reviewRequests.nodes.map(r => r.requestedReviewer ?? {}),
      reviews: raw.reviews.nodes.map(r => ({ ...r, author: r.author ?? ghost })),
      comments: raw.commentList.nodes.map(c => ({ ...c, author: c.author ?? ghost })),
      commits: raw.commitList.nodes.map(({ commit: c }) => ({
        oid: c.oid,
        messageHeadline: c.messageHeadline,
        authoredDate: c.authoredDate,
        authors: c.authors.nodes.map(a => ({ name: a.name, login: a.user?.login ?? '' })),
      })),
      files: raw.files?.nodes ?? [],
    }
    return remember(`${root}|pr|${n}`, pr)
  })
}

/** The PR's patch, split per file so each opens in the diff viewer. */
export function prDiff(root: string, n: number): Promise<Map<string, string>> {
  return once(`${root}|diff|${n}`, async () => {
    const { owner, name } = await repoSlug(root)
    return remember(`${root}|diff|${n}`, splitPatch(await rest(`/repos/${owner}/${name}/pulls/${n}`, 'application/vnd.github.diff')))
  })
}
export const cachedDiff = (root: string, n: number) => memory.get(`${root}|diff|${n}`) as Map<string, string> | undefined

/** Warms the cache for a PR the user is likely to open next. */
export function prefetchPr(root: string, n: number) {
  if (!memory.has(`${root}|pr|${n}`)) void viewPr(root, n).catch(() => {})
}

/** Drops cached copies after a write, so the next read is fresh. */
export function forgetPr(root: string, n?: number) {
  for (const k of [...memory.keys()]) if (k.startsWith(`${root}|`) && (n === undefined || k.includes(`|${n}`) || k.includes('|list|'))) memory.delete(k)
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
  create: (title: string, base: string, head: string, draft: boolean) => [
    'pr',
    'create',
    '--title',
    title,
    '--base',
    base,
    '--head',
    head,
    '--body-file',
    '-',
    ...(draft ? ['--draft'] : []),
  ],
}

/** `2026-10-24T13:15:57Z` → `3 hours ago`, in the UI language. */
export const relTime = (iso: string) => timeAgo(new Date(iso).getTime())
