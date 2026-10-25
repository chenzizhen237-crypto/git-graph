/**
 * GitHub Actions and repositories: CI state per commit (batched, cached),
 * workflow runs with their jobs and logs, the user's repositories for
 * cloning, and links to things on github.com. Writes go through `gh`.
 */
import { graphql, repoSlug, rest } from './github'

// ─── CI state per commit ───────────────────────────────────────────────────

export type CiState = 'pass' | 'fail' | 'pending' | 'none'

const fromRollup = (state?: string | null): CiState => (!state ? 'none' : state === 'SUCCESS' ? 'pass' : state === 'FAILURE' || state === 'ERROR' ? 'fail' : 'pending')

type Entry = { state: CiState; at: number }
const ciCache = new Map<string, Entry>()
/** Pending results are asked again after this long; settled ones are kept. */
const PENDING_TTL = 30_000

export const cachedCi = (sha: string) => ciCache.get(sha)?.state

/**
 * CI state for many commits in one GraphQL request (100 at a time), so a
 * screen of History costs one call, not one per row.
 */
export async function commitStates(root: string, shas: string[]): Promise<Map<string, CiState>> {
  const now = Date.now()
  const want = [...new Set(shas)].filter(s => {
    const hit = ciCache.get(s)
    return !hit || (hit.state === 'pending' && now - hit.at > PENDING_TTL)
  })
  if (want.length) {
    const { owner, name } = await repoSlug(root)
    for (let i = 0; i < want.length; i += 100) {
      const batch = want.slice(i, i + 100)
      const fields = batch.map((sha, k) => `c${k}: object(oid: "${sha}") { ... on Commit { statusCheckRollup { state } } }`).join('\n')
      const data = await graphql<{ repository: Record<string, { statusCheckRollup: { state: string } | null } | null> }>(
        `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
        { owner, name },
      )
      batch.forEach((sha, k) => {
        ciCache.set(sha, { state: fromRollup(data.repository[`c${k}`]?.statusCheckRollup?.state), at: now })
      })
    }
  }
  return new Map(shas.map(s => [s, ciCache.get(s)?.state ?? 'none']))
}

// ─── Workflow runs ─────────────────────────────────────────────────────────

export type Run = {
  id: number
  name: string
  display_title: string
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'neutral' | 'action_required' | 'startup_failure' | null
  event: string
  head_branch: string
  head_sha: string
  run_number: number
  run_attempt: number
  run_started_at: string
  updated_at: string
  html_url: string
}

export type Step = { name: string; number: number; status: string; conclusion: string | null; started_at?: string; completed_at?: string }
export type Job = { id: number; name: string; status: string; conclusion: string | null; started_at: string; completed_at: string | null; html_url: string; steps: Step[] }

export type RunState = 'pass' | 'fail' | 'running' | 'queued' | 'cancelled' | 'skipped'

export function runState(r: { status: string; conclusion: string | null }): RunState {
  if (r.status !== 'completed') return r.status === 'in_progress' ? 'running' : 'queued'
  if (r.conclusion === 'success') return 'pass'
  if (r.conclusion === 'cancelled') return 'cancelled'
  if (r.conclusion === 'skipped' || r.conclusion === 'neutral') return 'skipped'
  return 'fail'
}

export async function listRuns(root: string, branch?: string): Promise<Run[]> {
  const { owner, name } = await repoSlug(root)
  const q = branch ? `&branch=${encodeURIComponent(branch)}` : ''
  const data = JSON.parse(await rest(`/repos/${owner}/${name}/actions/runs?per_page=40${q}`)) as { workflow_runs: Run[] }
  return data.workflow_runs
}

export async function runJobs(root: string, runId: number): Promise<Job[]> {
  const { owner, name } = await repoSlug(root)
  const data = JSON.parse(await rest(`/repos/${owner}/${name}/actions/runs/${runId}/jobs?per_page=100`)) as { jobs: Job[] }
  return data.jobs
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const TOOL_ERROR = /^\s*(error\b|Error:|failed to |npm ERR!|\[ELIFECYCLE\])/

export type LogSection = { title: string; lines: { n: number; text: string; error: boolean }[]; failed: boolean }

/** A job's log split into the steps GitHub marks with `##[group]`, timestamps removed. */
export function parseJobLog(raw: string): LogSection[] {
  const sections: LogSection[] = []
  let cur: LogSection = { title: 'Set up job', lines: [], failed: false }
  let n = 0
  for (const rawLine of raw.split(/\r?\n/)) {
    // Drop the timestamp (and a leading byte-order mark) and terminal colour codes.
    const line = rawLine.replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(ANSI, '')
    if (line.startsWith('##[group]')) {
      if (cur.lines.length || sections.length) sections.push(cur)
      cur = { title: line.slice(9), lines: [], failed: false }
      continue
    }
    if (line.startsWith('##[endgroup]')) continue
    const marked = line.startsWith('##[error]')
    if (marked) cur.failed = true
    const text = marked ? line.slice(9) : line.replace(/^##\[\w+\]/, '')
    // Tools print their own errors before GitHub's marker; light those up too.
    cur.lines.push({ n: ++n, text, error: marked || TOOL_ERROR.test(text) })
  }
  sections.push(cur)
  return sections.filter(s => s.lines.length || s.title)
}

export async function jobLog(root: string, jobId: number): Promise<LogSection[]> {
  const { owner, name } = await repoSlug(root)
  // GitHub answers with a redirect to the plain-text log; the default JSON Accept header is required.
  return parseJobLog(await rest(`/repos/${owner}/${name}/actions/jobs/${jobId}/logs`))
}

export const runActions = {
  rerunFailed: (runId: number) => ['run', 'rerun', String(runId), '--failed'],
  rerunAll: (runId: number) => ['run', 'rerun', String(runId)],
  rerunJob: (jobId: number) => ['run', 'rerun', '--job', String(jobId)],
  cancel: (runId: number) => ['run', 'cancel', String(runId)],
}

/** "4m 12s" from two timestamps. */
export function duration(from?: string | null, to?: string | null) {
  if (!from) return ''
  const s = Math.max(0, Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// ─── Your repositories (clone) and publishing ─────────────────────────────

export type RemoteRepo = {
  nameWithOwner: string
  description: string | null
  isPrivate: boolean
  isFork: boolean
  url: string
  pushedAt: string | null
  stargazerCount: number
  primaryLanguage: { name: string; color: string | null } | null
}

export type Account = { login: string; orgs: string[]; repos: RemoteRepo[] }

/** The signed-in user, their organisations and the repositories they can push to, newest first. */
export async function myAccount(): Promise<Account> {
  const data = await graphql<{
    viewer: { login: string; organizations: { nodes: { login: string }[] }; repositories: { nodes: RemoteRepo[] } }
  }>(`
    query {
      viewer {
        login
        organizations(first: 50) {
          nodes {
            login
          }
        }
        repositories(first: 100, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: PUSHED_AT, direction: DESC }) {
          nodes {
            nameWithOwner
            description
            isPrivate
            isFork
            url
            pushedAt
            stargazerCount
            primaryLanguage {
              name
              color
            }
          }
        }
      }
    }
  `)
  return { login: data.viewer.login, orgs: data.viewer.organizations.nodes.map(o => o.login), repos: data.viewer.repositories.nodes }
}

export const repoActions = {
  /** Run in the parent folder; gh sets up `upstream` for forks. */
  clone: (nameWithOwner: string, folder: string) => ['repo', 'clone', nameWithOwner, folder],
  publish: (owner: string, name: string, visibility: 'private' | 'public', description: string, remote: string) => [
    'repo',
    'create',
    `${owner}/${name}`,
    `--${visibility}`,
    '--source',
    '.',
    '--remote',
    remote,
    '--push',
    ...(description ? ['--description', description] : []),
  ],
  /** Forks the current repo; the original becomes `upstream`, the fork `origin`. */
  fork: () => ['repo', 'fork', '--remote', '--remote-name', 'origin'],
}

// ─── Links to github.com ──────────────────────────────────────────────────

export async function webUrl(root: string) {
  const { owner, name } = await repoSlug(root)
  return `https://github.com/${owner}/${name}`
}

export const links = {
  commit: (base: string, sha: string) => `${base}/commit/${sha}`,
  file: (base: string, sha: string, path: string, line?: number) => `${base}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`,
  branch: (base: string, branch: string) => `${base}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`,
  compare: (base: string, branch: string, onto: string) => `${base}/compare/${encodeURIComponent(onto)}...${encodeURIComponent(branch)}`,
  tag: (base: string, tag: string) => `${base}/releases/tag/${encodeURIComponent(tag)}`,
  actions: (base: string) => `${base}/actions`,
}
