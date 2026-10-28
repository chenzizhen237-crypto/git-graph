/**
 * Undo / redo for git actions, as GitKraken does it: each action that moves a
 * ref is recorded with where things stood before and after, and undoing puts
 * them back. Uncommitted edits are never lost: `reset --keep` refuses rather
 * than overwrite them, and undoing a commit keeps its changes staged.
 */

/** Where HEAD stood: the checked-out branch (null when detached) and its commit. */
export type Spot = { branch: string | null; sha: string }

export type UndoEntry = {
  label: string
  /** move: the branch moved (commit, merge, pull…); soft: a commit or amend, undone with changes kept staged. */
  kind: 'move' | 'soft' | 'switch' | 'create' | 'delete-branch' | 'tag'
  before: Spot
  after: Spot
  /** The branch or tag the action created or deleted. */
  name?: string
  /** The commit a deleted branch or a created tag points at. */
  target?: string
}

/** The git subcommand in `args`, skipping `-c key=value` options in front of it. */
export function verbOf(args: string[]) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '-c' || a === '-C') i++
    else if (!a.startsWith('-')) return a
  }
  return ''
}

/** Whether an action is undoable, and how; null for the rest (fetch, push, stage…). */
export function undoKind(args: string[]): UndoEntry['kind'] | null {
  const verb = verbOf(args)
  const rest = args.slice(args.indexOf(verb) + 1)
  switch (verb) {
    case 'commit':
      return 'soft'
    case 'merge':
    case 'pull':
    case 'rebase':
    case 'cherry-pick':
    case 'revert':
    case 'reset':
      return rest.includes('--abort') ? null : 'move'
    case 'switch':
    case 'checkout':
      return rest.includes('-c') || rest.includes('-b') ? 'create' : 'switch'
    case 'branch':
      return rest.includes('-d') || rest.includes('-D') ? 'delete-branch' : null
    case 'tag':
      return rest.includes('-d') ? null : 'tag'
    default:
      return null
  }
}

/** The branch or tag name an action names: `switch -c NAME`, `branch -d NAME`, `tag NAME`. */
export function nameOf(args: string[], kind: UndoEntry['kind']) {
  const verb = verbOf(args)
  const rest = args.slice(args.indexOf(verb) + 1).filter(a => !a.startsWith('-'))
  if (kind === 'create' || kind === 'delete-branch' || kind === 'tag') return rest[0]
  return undefined
}

const at = (s: Spot) => (s.branch ? ['switch', s.branch] : ['switch', '--detach', s.sha])

/** The git commands that undo `e`, in order. */
export function undoCommands(e: UndoEntry): string[][] {
  switch (e.kind) {
    case 'soft':
      return [['reset', '--soft', e.before.sha]]
    case 'move':
      return [['reset', '--keep', e.before.sha]]
    case 'switch':
      return [at(e.before)]
    case 'create':
      return [at(e.before), ['branch', '-D', e.name!]]
    case 'delete-branch':
      return [['branch', e.name!, e.target!]]
    case 'tag':
      return [['tag', '-d', e.name!]]
  }
}

/** The git commands that redo `e`, in order. */
export function redoCommands(e: UndoEntry): string[][] {
  switch (e.kind) {
    case 'soft':
      return [['reset', '--soft', e.after.sha]]
    case 'move':
      return [['reset', '--keep', e.after.sha]]
    case 'switch':
      return [at(e.after)]
    case 'create':
      return [['switch', '-c', e.name!, e.after.sha]]
    case 'delete-branch':
      return [['branch', '-D', e.name!]]
    case 'tag':
      return [['tag', e.name!, e.target!]]
  }
}

/**
 * Why `e` cannot be undone from `now`, or null when it can. Moves and commits are
 * only undone on the branch they happened on, still at the commit they left.
 */
export function blocked(e: UndoEntry, now: Spot, undo: boolean): string | null {
  const expect = undo ? e.after : e.before
  if (e.kind === 'soft' || e.kind === 'move') {
    if (now.branch !== expect.branch) return 'HEAD is on another branch now'
    if (now.sha !== expect.sha) return 'the branch has moved since'
  }
  if ((e.kind === 'switch' || e.kind === 'create') && (now.branch !== expect.branch || now.sha !== expect.sha)) return 'HEAD has moved since'
  return null
}
