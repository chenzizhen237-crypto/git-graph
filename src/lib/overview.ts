/**
 * CI across repositories: the latest checks on each local repository's
 * default branch and current branch, for the CI/CD view. One GraphQL
 * request covers 20 repositories, and it reads check runs and commit
 * statuses alike, so CI that is not GitHub Actions (Buildkite, CircleCI,
 * Vercel…) shows up too. The result is kept in a small store that the
 * view and the sidebar's failing count both read.
 */
import { useSyncExternalStore } from 'react'

import type { RunState } from './actions'
import { graphql } from './github'
import { cachedLocalRepos, type LocalRepo, localRepos, summarise } from './local'

export type Check = { name: string; state: RunState; started: string | null; completed: string | null; url: string | null }
export type BranchCi = { branch: string; sha: string; subject: string; at: string; checks: Check[] }
export type RepoState = 'fail' | 'running' | 'pass' | 'none'
export type RepoCi = {
  path: string
  name: string
  /** owner/name on GitHub; missing for a repository without a GitHub remote. */
  slug?: string
  /** The checked-out branch, when it is not the default one. */
  branch?: string
  main?: BranchCi
  current?: BranchCi
  /** The latest deployment to each environment, newest first. */
  deployments?: Deployment[]
  error?: string
}

export type Deployment = { environment: string; state: RunState; ref: string | null; sha: string; at: string; url: string | null }

// ─── Reading GitHub's answer ───────────────────────────────────────────────

type CheckNode =
  | {
      __typename: 'CheckRun'
      name: string
      status: string
      conclusion: string | null
      startedAt: string | null
      completedAt: string | null
      detailsUrl: string | null
      checkSuite?: { workflowRun: { workflow: { name: string } } | null } | null
    }
  | { __typename: 'StatusContext'; context: string; state: string; targetUrl: string | null; createdAt: string }

type CommitNode = { oid: string; messageHeadline: string; committedDate: string; statusCheckRollup: { contexts: { nodes: CheckNode[] } } | null }
type RefNode = { name: string; target: CommitNode | null } | null
type DeploymentNode = {
  environment: string | null
  commitOid: string
  createdAt: string
  ref: { name: string } | null
  latestStatus: { state: string; createdAt: string; environmentUrl: string | null; logUrl: string | null } | null
}
type RepoNode = { defaultBranchRef: RefNode; cur?: RefNode; deployments?: { nodes: DeploymentNode[] } } | null

/** GitHub's deployment states; a deployment a newer one replaced (INACTIVE) went fine. */
export function deploymentState(state?: string | null): RunState {
  switch (state) {
    case 'SUCCESS':
    case 'ACTIVE':
    case 'INACTIVE':
      return 'pass'
    case 'IN_PROGRESS':
      return 'running'
    case 'FAILURE':
    case 'ERROR':
      return 'fail'
    case 'DESTROYED':
      return 'cancelled'
    default:
      // PENDING, QUEUED, WAITING (for approval), or no status yet.
      return 'queued'
  }
}

/** The newest deployment per environment, newest first. */
export function readDeployments(nodes: DeploymentNode[]): Deployment[] {
  const seen = new Map<string, Deployment>()
  for (const d of [...nodes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const environment = d.environment ?? 'default'
    if (seen.has(environment)) continue
    const s = d.latestStatus
    seen.set(environment, {
      environment,
      state: deploymentState(s?.state),
      ref: d.ref?.name ?? null,
      sha: d.commitOid,
      at: s?.createdAt ?? d.createdAt,
      url: s?.environmentUrl || s?.logUrl || null,
    })
  }
  return [...seen.values()]
}

/** A check run (named after its workflow, as GitHub's checks list does) or a commit status. */
export function readCheck(n: CheckNode): Check {
  if (n.__typename === 'StatusContext') {
    const state: RunState = n.state === 'SUCCESS' ? 'pass' : n.state === 'PENDING' || n.state === 'EXPECTED' ? 'running' : 'fail'
    return { name: n.context, state, started: n.createdAt, completed: null, url: n.targetUrl }
  }
  const status = n.status.toLowerCase()
  const state: RunState =
    status !== 'completed'
      ? status === 'in_progress'
        ? 'running'
        : 'queued'
      : n.conclusion === 'SUCCESS'
        ? 'pass'
        : n.conclusion === 'CANCELLED'
          ? 'cancelled'
          : n.conclusion === 'SKIPPED' || n.conclusion === 'NEUTRAL'
            ? 'skipped'
            : 'fail'
  const workflow = n.checkSuite?.workflowRun?.workflow.name
  return { name: workflow ? `${workflow} / ${n.name}` : n.name, state, started: n.startedAt, completed: n.completedAt, url: n.detailsUrl }
}

const ORDER: Record<RunState, number> = { fail: 0, running: 1, queued: 2, pass: 3, cancelled: 4, skipped: 5 }

function readBranch(ref: RefNode): BranchCi | undefined {
  if (!ref?.target) return undefined
  const c = ref.target
  const checks = (c.statusCheckRollup?.contexts.nodes ?? []).map(readCheck).sort((a, b) => ORDER[a.state] - ORDER[b.state])
  return { branch: ref.name, sha: c.oid, subject: c.messageHeadline, at: c.committedDate, checks }
}

/** What one branch's checks add up to: any failure, else anything still going, else passed. */
export function branchState(b?: BranchCi): RepoState {
  if (!b?.checks.length) return 'none'
  if (b.checks.some(c => c.state === 'fail')) return 'fail'
  if (b.checks.some(c => c.state === 'running' || c.state === 'queued')) return 'running'
  return b.checks.some(c => c.state === 'pass') ? 'pass' : 'none'
}

/** What the latest deployments add up to, read like checks. */
export const deployState = (deps?: Deployment[]): RepoState =>
  branchState(
    deps?.length
      ? { branch: '', sha: '', subject: '', at: '', checks: deps.map(d => ({ name: d.environment, state: d.state, started: null, completed: null, url: null })) }
      : undefined,
  )

/** A repository is as bad as the worst of its two branches and its deployments. */
export function repoState(r: RepoCi): RepoState {
  const states = [branchState(r.main), branchState(r.current), deployState(r.deployments)]
  for (const s of ['fail', 'running', 'pass'] as const) if (states.includes(s)) return s
  return 'none'
}

/** "1 of 6 failed", "2 of 4 running", "6 passed". */
export function summary(b?: BranchCi) {
  const n = b?.checks.length ?? 0
  if (!n) return { text: 'No checks', n: 0, total: 0 }
  const failed = b!.checks.filter(c => c.state === 'fail').length
  if (failed) return { text: '{n} of {total} failed', n: failed, total: n }
  const going = b!.checks.filter(c => c.state === 'running' || c.state === 'queued').length
  if (going) return { text: '{n} of {total} running', n: going, total: n }
  return { text: '{n} passed', n, total: n }
}

const RANK: Record<RepoState, number> = { fail: 0, running: 1, pass: 2, none: 3 }
const latest = (r: RepoCi) => Math.max(...[r.main, r.current, ...(r.deployments ?? [])].map(b => (b ? new Date(b.at).getTime() : 0)))

/** Failing first, then running, passing, and repositories without CI; newest first within each. */
export const sortRepos = (list: RepoCi[]) => [...list].sort((a, b) => RANK[repoState(a)] - RANK[repoState(b)] || latest(b) - latest(a) || a.name.localeCompare(b.name))

// ─── Asking GitHub ─────────────────────────────────────────────────────────

const COMMIT = `fragment C on Commit {
  oid messageHeadline committedDate
  statusCheckRollup { contexts(first: 50) { nodes { __typename
    ... on CheckRun { name status conclusion startedAt completedAt detailsUrl checkSuite { workflowRun { workflow { name } } } }
    ... on StatusContext { context state targetUrl createdAt }
  } } }
}`

/** Enough recent deployments to find the latest one in each environment. */
const DEPLOYMENTS = `deployments(last: 30, orderBy: { field: CREATED_AT, direction: ASC }) { nodes { environment commitOid createdAt ref { name } latestStatus { state createdAt environmentUrl logUrl } } }`

type Want = { owner: string; name: string; branch?: string }

/** One aliased `repository` field per repository; names travel as variables. */
export function overviewQuery(want: Want[]) {
  const vars: Record<string, string> = {}
  const params: string[] = []
  const fields = want.map((w, i) => {
    vars[`o${i}`] = w.owner
    vars[`n${i}`] = w.name
    params.push(`$o${i}: String!`, `$n${i}: String!`)
    let cur = ''
    if (w.branch) {
      vars[`b${i}`] = `refs/heads/${w.branch}`
      params.push(`$b${i}: String!`)
      cur = ` cur: ref(qualifiedName: $b${i}) { name target { ...C } }`
    }
    return `r${i}: repository(owner: $o${i}, name: $n${i}) { defaultBranchRef { name target { ...C } }${cur} ${DEPLOYMENTS} }`
  })
  return { query: `query(${params.join(', ')}) {\n${fields.join('\n')}\n}\n${COMMIT}`, variables: vars }
}

async function ask(want: Want[]): Promise<(RepoNode | Error)[]> {
  const { query, variables } = overviewQuery(want)
  try {
    const data = await graphql<Record<string, RepoNode>>(query, variables)
    return want.map((_, i) => data[`r${i}`] ?? null)
  } catch (e) {
    // One repository that is gone or out of reach fails the whole request; ask for each on its own.
    if (want.length === 1) return [e instanceof Error ? e : new Error(String(e))]
    return (await Promise.all(want.map(w => ask([w])))).flat()
  }
}

const BATCH = 20

export async function loadOverview(repos: LocalRepo[]): Promise<RepoCi[]> {
  const base: RepoCi[] = repos.map(r => ({ path: r.path, name: r.name, slug: r.github, branch: r.branch || undefined }))
  const onGitHub = base.filter(r => r.slug)
  for (let i = 0; i < onGitHub.length; i += BATCH) {
    const batch = onGitHub.slice(i, i + BATCH)
    const want = batch.map(r => {
      const [owner = '', name = ''] = r.slug!.split('/')
      return { owner, name, branch: r.branch }
    })
    const answers = await ask(want)
    batch.forEach((r, k) => {
      const a = answers[k]
      if (a instanceof Error) r.error = a.message
      else if (!a) r.error = 'Not found on GitHub'
      else {
        r.main = readBranch(a.defaultBranchRef)
        // The current branch only when it differs from the default one (and is on GitHub).
        const cur = readBranch(a.cur ?? null)
        if (cur && cur.branch !== r.main?.branch) r.current = cur
        r.deployments = readDeployments(a.deployments?.nodes ?? [])
      }
    })
  }
  return sortRepos(base)
}

/** The scanned repositories plus any recent one outside the scan folders, once each. */
export async function overviewRepos(recent: string[]): Promise<LocalRepo[]> {
  const scanned = cachedLocalRepos() ?? (await localRepos())
  const seen = new Set(scanned.map(r => r.path))
  const extra = await Promise.all(recent.filter(p => !seen.has(p)).map(p => summarise(p, '').catch(() => null)))
  return [...scanned, ...extra.filter((r): r is LocalRepo => !!r && !!r.branch)]
}

// ─── Store: the last answer, shared by the view and the sidebar ──────────

type Snapshot = { repos: RepoCi[] | null; at: number | null; error: string | null }
let snap: Snapshot = { repos: null, at: null, error: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<Snapshot>) => {
  snap = { ...snap, ...patch }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useOverview = () => useSyncExternalStore(subscribe, () => snap)

let inFlight: Promise<void> | null = null

export function refreshOverview(recent: string[]) {
  inFlight ??= overviewRepos(recent)
    .then(loadOverview)
    .then(repos => set({ repos, at: Date.now(), error: null }))
    .catch(e => set({ error: e instanceof Error ? e.message : String(e), repos: snap.repos ?? [] }))
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** Seconds until the next refresh: quicker while something is running. */
export const pollEvery = (repos: RepoCi[] | null) => (repos?.some(r => repoState(r) === 'running') ? 15 : 60)
