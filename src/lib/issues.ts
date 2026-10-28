/** GitHub Issues through `gh`: the list, one issue with its comments, commenting, and a branch name for working on one. */
import { gh } from './github'

export type IssueFilter = 'open' | 'mine' | 'closed'
export type Label = { name: string; color: string }
export type IssueSummary = {
  number: number
  title: string
  url: string
  state: 'OPEN' | 'CLOSED'
  updatedAt: string
  author: { login: string }
  assignees: { login: string }[]
  labels: Label[]
  comments: unknown[]
}
export type IssueDetail = Omit<IssueSummary, 'comments'> & { body: string; createdAt: string; comments: { author: { login: string }; body: string; createdAt: string }[] }

const LIST = 'number,title,url,state,updatedAt,author,assignees,labels,comments'

export async function listIssues(root: string, filter: IssueFilter): Promise<IssueSummary[]> {
  const args = ['issue', 'list', '--limit', '200', '--json', LIST, '--state', filter === 'closed' ? 'closed' : 'open', ...(filter === 'mine' ? ['--assignee', '@me'] : [])]
  return JSON.parse(await gh(root, args)) as IssueSummary[]
}

export async function viewIssue(root: string, n: number): Promise<IssueDetail> {
  return JSON.parse(await gh(root, ['issue', 'view', String(n), '--json', `${LIST},body,createdAt`])) as IssueDetail
}

export const commentIssue = (root: string, n: number, body: string) => gh(root, ['issue', 'comment', String(n), '--body-file', '-'], body)

/** `issue-42-sidebar-rows-squeeze`: the number and the first words of the title. */
export function issueBranch(n: number, title: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    // é → e: drop the accents NFKD split off.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-')
  return slug ? `issue-${n}-${slug}` : `issue-${n}`
}
