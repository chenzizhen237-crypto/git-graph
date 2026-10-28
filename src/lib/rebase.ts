/**
 * Interactive rebase without an editor: the todo list is built here and handed
 * to `git rebase -i` through sequence.editor, and rewordings run as `exec`
 * steps, so git never waits for a terminal.
 */
import { git } from './git'

export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'
export type RebaseStep = { hash: string; short: string; subject: string; message: string; action: RebaseAction; /** The new message, for reword. */ reword?: string }

export const ACTIONS: RebaseAction[] = ['pick', 'reword', 'squash', 'fixup', 'drop']

/** UTF-8 safe base64, so any message survives the shell. */
const b64 = (s: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(s)))

/** The commits after `base` up to HEAD, oldest first, and whether merges are among them (a rebase flattens them). */
export async function rebaseSteps(root: string, base: string) {
  const [log, merges] = await Promise.all([
    git(root, ['log', '--reverse', '--no-merges', '--format=%x1e%H%x1f%h%x1f%s%x1f%B', `${base}..HEAD`]),
    git(root, ['rev-list', '--merges', '--count', `${base}..HEAD`]),
  ])
  const steps: RebaseStep[] = log
    .split('\x1e')
    .filter(b => b.trim())
    .map(b => {
      const [hash = '', short = '', subject = '', message = ''] = b.split('\x1f')
      return { hash, short, subject, message: message.trim(), action: 'pick' }
    })
  return { steps, merges: Number(merges.trim()) || 0 }
}

/** Why the plan cannot run, or null. */
export function planProblem(steps: RebaseStep[]): string | null {
  const kept = steps.filter(s => s.action !== 'drop')
  if (!kept.length) return 'Keep at least one commit, or reset the branch instead.'
  if (kept[0]!.action === 'squash' || kept[0]!.action === 'fixup') return 'The first commit kept cannot be squashed or fixed up: there is nothing above it to meld into.'
  if (steps.some(s => s.action === 'reword' && !s.reword?.trim())) return 'A reworded commit needs a message.'
  return null
}

/** The todo list git runs. */
export function todo(steps: RebaseStep[]) {
  const lines: string[] = []
  for (const s of steps) {
    if (s.action === 'reword') {
      lines.push(`pick ${s.hash}`)
      lines.push(`exec printf %s ${b64(s.reword!.trim())} | base64 --decode | git commit --amend --only --allow-empty --no-verify -F -`)
    } else lines.push(`${s.action} ${s.hash}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * The rebase arguments. git runs sequence.editor through the shell with the todo
 * file's path appended, so this writes our list over it; core.editor=true keeps
 * squash messages as git combines them.
 */
export function rebaseArgs(base: string, steps: RebaseStep[]) {
  const editor = `printf %s ${b64(todo(steps))} | base64 --decode >`
  return ['-c', `sequence.editor=${editor}`, '-c', 'core.editor=true', 'rebase', '-i', base]
}
