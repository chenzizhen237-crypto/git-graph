/**
 * Everything the app asks of git: one `git` command in Rust, and here the
 * reads that build the repository model and the writes behind each action.
 */
import { invoke } from '@tauri-apps/api/core'

import { layoutGraph } from './graph'
import {
  REFS_FORMAT,
  SHOW_FORMAT,
  hunksOnly,
  isFiltered,
  logArgs,
  mergeNumstat,
  parseLog,
  parseNameStatus,
  parseRefs,
  parseShow,
  parseStashes,
  parseStatus,
} from './parse'
import type { CommitDetail, LogQuery, LogRow, Operation, RepoData, Worktree } from './types'

export type GitOutput = { stdout: string; stderr: string; code: number }

export class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly output: GitOutput,
  ) {
    super(output.stderr.trim() || output.stdout.trim() || `git ${args[0]} failed (${output.code})`)
  }
}

/** Runs git and returns its output whatever the exit code. */
export const run = (repo: string, args: string[], stdin?: string) =>
  invoke<GitOutput>('git', { repo, args, stdin: stdin ?? null })

/** Runs git and throws a GitError when it fails. */
export async function git(repo: string, args: string[], stdin?: string) {
  const out = await run(repo, args, stdin)
  if (out.code !== 0) throw new GitError(args, out)
  return out.stdout
}

const readGitFile = (repo: string, name: string) => invoke<string | null>('read_git_file', { repo, name })

export const watchRepo = (repo: string) => invoke<void>('watch_repo', { repo })
export const openTerminal = (path: string) => invoke<void>('open_terminal', { path })
export const reveal = (path: string) => invoke<void>('reveal', { path })

/** The top of the work tree containing `path`, or null when it is not in one. */
export async function findRoot(path: string): Promise<string | null> {
  const out = await run(path, ['rev-parse', '--show-toplevel'])
  return out.code === 0 ? out.stdout.trim() : null
}

/** The hash used for the uncommitted-changes row in the graph layout. */
export const WORK = '0000000000000000000000000000000000000000'

async function detectOperation(root: string): Promise<{ operation?: Operation; step?: string; title?: string }> {
  const has = async (ref: string) => (await run(root, ['rev-parse', '-q', '--verify', ref])).code === 0
  const [merge, rebaseHead, pick, revert, msgnum, end, headName, mergeMsg] = await Promise.all([
    has('MERGE_HEAD'),
    has('REBASE_HEAD'),
    has('CHERRY_PICK_HEAD'),
    has('REVERT_HEAD'),
    readGitFile(root, 'rebase-merge/msgnum'),
    readGitFile(root, 'rebase-merge/end'),
    readGitFile(root, 'rebase-merge/head-name'),
    readGitFile(root, 'MERGE_MSG'),
  ])
  const firstLine = (s: string | null) => s?.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim()
  if (msgnum || rebaseHead) {
    const step = msgnum && end ? `${msgnum.trim()} / ${end.trim()}` : undefined
    const branch = headName?.trim().replace('refs/heads/', '')
    return { operation: 'rebase', step, title: `Rebasing${branch ? ` ${branch}` : ''}${step ? ` — applying ${step.replace(' / ', ' of ')}` : ''}` }
  }
  if (merge) return { operation: 'merge', title: firstLine(mergeMsg) ?? 'Merging' }
  if (pick) return { operation: 'cherry-pick', title: `Cherry-picking — ${firstLine(mergeMsg) ?? ''}` }
  if (revert) return { operation: 'revert', title: firstLine(mergeMsg) ?? 'Reverting' }
  return {}
}

function parseWorktrees(stdout: string): Worktree[] {
  return stdout
    .split('\n\n')
    .filter(Boolean)
    .map((block, i) => {
      const lines = block.split('\n')
      const path = lines.find(l => l.startsWith('worktree '))?.slice(9) ?? ''
      const branch = lines.find(l => l.startsWith('branch '))?.slice(7).replace('refs/heads/', '') ?? '(detached)'
      return { path, branch, isMain: i === 0 }
    })
}

/** Reads everything the window shows about a repository. */
export async function loadRepo(root: string, q: LogQuery): Promise<RepoData> {
  const [log, refs, status, stash, head, op, worktrees, count] = await Promise.all([
    run(root, logArgs(q).slice(1)),
    run(root, ['for-each-ref', `--format=${REFS_FORMAT}`, '--sort=-committerdate']),
    git(root, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all']),
    run(root, ['stash', 'list', '--format=%gd%x1f%s%x1f%cr']),
    run(root, ['rev-parse', 'HEAD']),
    detectOperation(root),
    run(root, ['worktree', 'list', '--porcelain']),
    run(root, ['rev-list', '--count', '--all']),
  ])
  // An empty repository has no HEAD and `git log` fails; show it empty.
  const parsed = log.code === 0 ? parseLog(log.stdout, q.limit) : { commits: [], hasMore: false }
  const st = parseStatus(status)
  const headHash = head.code === 0 ? head.stdout.trim() : ''
  // Uncommitted work is a dashed node above HEAD, as GitKraken draws it.
  const showsHead = ['--all', '--branches', 'HEAD', st.branch].includes(q.branch)
  const withWork = !isFiltered(q) && showsHead && st.changes.length > 0 && !!headHash
  const laid = layoutGraph(
    [...(withWork ? [{ hash: WORK, parents: [headHash] }] : []), ...parsed.commits],
    !isFiltered(q),
  )
  const graphs = withWork ? laid.rows.slice(1) : laid.rows
  const rows: LogRow[] = parsed.commits.map((c, i) => ({ ...c, graph: graphs[i]! }))
  return {
    root,
    name: root.split('/').filter(Boolean).pop() ?? root,
    branch: st.branch,
    head: headHash,
    upstream: st.upstream,
    ahead: st.ahead,
    behind: st.behind,
    rows,
    laneCount: laid.laneCount,
    work: withWork ? laid.rows[0] : undefined,
    refs: parseRefs(refs.stdout),
    changes: st.changes,
    stashes: parseStashes(stash.stdout),
    worktrees: worktrees.code === 0 ? parseWorktrees(worktrees.stdout) : [],
    hasMore: parsed.hasMore,
    totalCommits: Number(count.stdout.trim()) || rows.length,
    operation: op.operation,
    operationStep: op.step,
    operationTitle: op.title,
  }
}

/** Message, author, parents and changed files of one commit (against its first parent). */
export async function commitDetail(root: string, hash: string): Promise<CommitDetail> {
  const diffArgs = ['diff-tree', '-r', '-z', '-M', '--root', '--no-commit-id', '-m', '--first-parent']
  const [show, names, nums] = await Promise.all([
    git(root, ['show', '-s', `--format=${SHOW_FORMAT}`, '--date=format:%Y-%m-%d %H:%M', hash]),
    git(root, [...diffArgs, '--name-status', hash]),
    git(root, [...diffArgs, '--numstat', hash]),
  ])
  return { ...parseShow(show), files: mergeNumstat(parseNameStatus(names), nums) }
}

/** The patch of one file in a commit, from its first hunk. */
export async function commitFileDiff(root: string, hash: string, path: string, orig?: string) {
  const paths = orig ? [orig, path] : [path]
  const out = await git(root, ['show', '--format=', '-M', '--first-parent', '--root', hash, '--', ...paths])
  return hunksOnly(out)
}

/** The patch of a working-tree file: staged, unstaged, or new. */
export async function workFileDiff(root: string, path: string, kind: 'staged' | 'unstaged' | 'untracked' | 'conflict') {
  // Against our side (stage 2), so the conflict markers show as plain added lines.
  if (kind === 'conflict') return hunksOnly((await run(root, ['diff', '-2', '--', path])).stdout)
  if (kind === 'untracked') {
    // --no-index exits 1 when the files differ, which they always do here.
    const out = await run(root, ['diff', '--no-index', '--', '/dev/null', path])
    return hunksOnly(out.stdout)
  }
  const out = await git(root, ['diff', ...(kind === 'staged' ? ['--cached'] : []), '-M', '--', path])
  return hunksOnly(out)
}

/** Line counts of working-tree changes by path, staged and unstaged apart. */
export async function workStats(root: string) {
  const [staged, unstaged] = await Promise.all([
    git(root, ['diff', '--cached', '--numstat', '-z', '-M']),
    git(root, ['diff', '--numstat', '-z', '-M']),
  ])
  const read = (out: string) => {
    const counts = new Map<string, { added?: number; deleted?: number }>()
    const parts = out.split('\0')
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue
      const [a = '', d = '', inline] = part.split('\t')
      const path = inline || parts[i + 2] || ''
      if (!inline) i += 2
      counts.set(path, a === '-' ? {} : { added: Number(a), deleted: Number(d) })
    }
    return counts
  }
  return { staged: read(staged), unstaged: read(unstaged) }
}

export async function stashDiff(root: string, ref: string) {
  return hunksOnly(await git(root, ['stash', 'show', '-p', '--include-untracked', ref]))
}

/** The arguments of each action, so the UI and the palette share them. */
export const actions = {
  fetch: () => ['fetch', '--all', '--prune'],
  pull: () => ['pull', '--ff-only'],
  push: (repo: RepoData) => (repo.upstream ? ['push'] : ['push', '--set-upstream', 'origin', repo.branch]),
  stage: (paths: string[]) => ['add', '--', ...paths],
  stageAll: () => ['add', '--all'],
  unstage: (paths: string[]) => ['restore', '--staged', '--', ...paths],
  unstageAll: () => ['restore', '--staged', '--', '.'],
  discard: (paths: string[]) => ['restore', '--worktree', '--', ...paths],
  clean: (paths: string[]) => ['clean', '-f', '--', ...paths],
  commit: (amend: boolean, signoff: boolean) => ['commit', '-F', '-', ...(amend ? ['--amend'] : []), ...(signoff ? ['--signoff'] : [])],
  checkout: (name: string) => ['switch', name],
  checkoutRemote: (name: string) => ['switch', '--track', name],
  checkoutCommit: (hash: string) => ['switch', '--detach', hash],
  createBranch: (name: string, at?: string) => ['switch', '-c', name, ...(at ? [at] : [])],
  deleteBranch: (name: string) => ['branch', '-d', name],
  merge: (name: string) => ['merge', '--no-edit', name],
  rebase: (onto: string) => ['rebase', onto],
  cherryPick: (hash: string) => ['cherry-pick', hash],
  revert: (hash: string) => ['revert', '--no-edit', hash],
  tag: (name: string, at: string) => ['tag', name, at],
  stash: (message?: string) => ['stash', 'push', '--include-untracked', ...(message ? ['-m', message] : [])],
  stashPop: (ref = 'stash@{0}') => ['stash', 'pop', ref],
  stashApply: (ref: string) => ['stash', 'apply', ref],
  stashDrop: (ref: string) => ['stash', 'drop', ref],
  abort: (op: Operation) => [op, '--abort'],
  // `--continue` opens an editor for the message; keep the prepared one.
  continue: (op: Operation) => ['-c', 'core.editor=true', op, '--continue'],
}
