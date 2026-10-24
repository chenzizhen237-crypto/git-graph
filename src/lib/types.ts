/** One commit of the log, with its place in the graph. */
export type LogRow = {
  hash: string
  short: string
  parents: string[]
  author: string
  email: string
  /** Unix seconds. */
  time: number
  /** `3 days ago`. */
  ago: string
  refs: string[]
  subject: string
  /** The first line of the body. */
  body: string
  graph: GraphRow
}

/** An edge between two lanes across half a row. */
export type GraphEdge = { from: number; to: number; color: string }

/** Where a commit sits in the graph and what joins it to its neighbours. */
export type GraphRow = {
  lane: number
  color: string
  /** A child above continues into this node. */
  hasTop: boolean
  /** A parent below continues from this node. */
  hasBottom: boolean
  isMerge: boolean
  /** Lanes passing straight through this row. */
  through: { lane: number; color: string }[]
  /** Edges from the row above ending at this node. */
  inbound: GraphEdge[]
  /** Edges from this node into the row below. */
  outbound: GraphEdge[]
}

export type BranchRef = {
  name: string
  kind: 'local' | 'remote' | 'tag'
  hash: string
  upstream?: string
  track?: string
  isHead: boolean
  date: string
  subject: string
}

export type FileChange = { x: string; y: string; path: string; orig?: string }

export type StashEntry = { ref: string; subject: string; when: string }

export type Worktree = { path: string; branch: string; isMain: boolean }

export type Operation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

/** What the log shows: a `git log` revision argument plus filters. */
export type LogQuery = {
  branch: string
  query: string
  author: string
  since: string
  limit: number
}

export type RepoData = {
  root: string
  name: string
  branch: string
  head: string
  upstream?: string
  ahead: number
  behind: number
  rows: LogRow[]
  /** How many lanes the widest row of the graph uses. */
  laneCount: number
  /** Uncommitted changes drawn as a row above HEAD. */
  work?: GraphRow
  refs: BranchRef[]
  changes: FileChange[]
  stashes: StashEntry[]
  worktrees: Worktree[]
  hasMore: boolean
  totalCommits: number
  /** A merge, rebase, cherry-pick or revert stopped midway. */
  operation?: Operation
  /** `2 of 5` while rebasing. */
  operationStep?: string
  /** `Merge branch 'main' into x`, from MERGE_MSG or the rebase state. */
  operationTitle?: string
  lastFetch?: number
}

export type CommitFile = {
  status: string
  path: string
  orig?: string
  /** Lines added and deleted; absent for a binary file. */
  added?: number
  deleted?: number
}

export type CommitDetail = {
  hash: string
  parents: string[]
  author: string
  date: string
  committer: string
  body: string
  files: CommitFile[]
}
