/** The sidebar's GitHub numbers: open pull requests, open issues and failing Actions workflows on the branch. */
import { useEffect, useState } from 'react'

import { listRuns, type Run, runState } from './actions'
import { graphql, repoSlug } from './github'

export type SidebarCounts = { pulls?: number; issues?: number; failing?: number }

const REFRESH_MS = 60_000

/** Workflows whose latest run failed. Runs arrive newest first. */
export function failingRuns(runs: Run[]) {
  const latest = new Map<string, Run>()
  for (const r of runs) if (!latest.has(r.name)) latest.set(r.name, r)
  return [...latest.values()].filter(r => runState(r) === 'fail').length
}

async function openCounts(root: string) {
  const { owner, name } = await repoSlug(root)
  const { repository } = await graphql<{ repository: { pullRequests: { totalCount: number }; issues: { totalCount: number } } }>(
    `
      query ($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          pullRequests(states: OPEN) {
            totalCount
          }
          issues(states: OPEN) {
            totalCount
          }
        }
      }
    `,
    { owner, name },
  )
  return { pulls: repository.pullRequests.totalCount, issues: repository.issues.totalCount }
}

/** Without a GitHub remote or sign-in the numbers stay undefined and the rows show none. */
async function readCounts(root: string, branch?: string): Promise<SidebarCounts> {
  const [open, runs] = await Promise.allSettled([openCounts(root), listRuns(root, branch)])
  return { ...(open.status === 'fulfilled' ? open.value : {}), ...(runs.status === 'fulfilled' ? { failing: failingRuns(runs.value) } : {}) }
}

export function useSidebarCounts(root: string, branch: string | undefined, view: string) {
  const [counts, setCounts] = useState<SidebarCounts>({})
  // biome-ignore lint/correctness/useExhaustiveDependencies: leaving a view is when its list may have changed
  useEffect(() => {
    let live = true
    const load = () => void readCounts(root, branch).then(c => live && setCounts(c))
    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [root, branch, view])
  // biome-ignore lint/correctness/useExhaustiveDependencies: another repository's numbers must not linger
  useEffect(() => setCounts({}), [root])
  return counts
}
