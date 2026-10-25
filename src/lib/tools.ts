/**
 * Things outside the app that Settings points at: the global git config
 * (identity, signing), the editor, and git's diff and merge tools.
 */
import { invoke } from '@tauri-apps/api/core'
import { homeDir } from '@tauri-apps/api/path'

import { git, run } from './git'
import { getSettings } from './settings'

export type Editor = { id: string; name: string }

let editorList: Promise<Editor[]> | null = null
export const editors = () => (editorList ??= invoke<Editor[]>('editors').catch(() => []))

/** Opens a file or folder in the editor from Settings, or the system default. */
export const openInEditor = (path: string) => invoke<void>('open_in_editor', { editor: getSettings().tools.editor, path })

// --- Global git config ------------------------------------------------------

let home: Promise<string> | null = null
const homePath = () => (home ??= homeDir())

export async function getGlobal(key: string) {
  const out = await run(await homePath(), ['config', '--global', '--get', key])
  return out.code === 0 ? out.stdout.trim() : ''
}

/** Sets a global git config value; an empty value removes it. */
export async function setGlobal(key: string, value: string) {
  const dir = await homePath()
  if (value) await git(dir, ['config', '--global', key, value])
  // Exit code 5 means it was not set, which is fine.
  else await run(dir, ['config', '--global', '--unset', key])
}

// --- Diff and merge tools ---------------------------------------------------

/** Windowed tools git says are usable here, from `git difftool|mergetool --tool-help`. Terminal ones (vimdiff) can't run from the app. */
export function parseToolHelp(out: string): string[] {
  const lines = out.split('\n')
  const start = lines.findIndex(l => /may be set to one of the following/.test(l))
  if (start < 0) return []
  const names: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) {
      if (names.length) break
      continue
    }
    // Tool lines are indented; the next section's heading is not.
    if (!/^\s/.test(line)) break
    const name = line.trim().split(/\s+/)[0]
    if (name && /^[\w.-]+$/.test(name) && /graphical session/.test(line)) names.push(name)
  }
  return names
}

const toolLists = new Map<string, Promise<string[]>>()
export function gitTools(kind: 'difftool' | 'mergetool') {
  let list = toolLists.get(kind)
  if (!list) {
    list = homePath()
      .then(dir => run(dir, [kind, '--tool-help']))
      .then(out => parseToolHelp(out.stdout))
      .catch(() => [])
    toolLists.set(kind, list)
  }
  return list
}

/** Friendly names for the tools people usually have. */
export const TOOL_NAMES: Record<string, string> = {
  opendiff: 'FileMerge (opendiff)',
  vscode: 'Visual Studio Code',
  smerge: 'Sublime Merge',
  bc: 'Beyond Compare',
  kdiff3: 'KDiff3',
  meld: 'Meld',
  p4merge: 'P4Merge',
  vimdiff: 'Vim',
  nvimdiff: 'Neovim',
}

const toolArg = (name: string) => (name ? [`--tool=${name}`] : [])

/** Opens one changed file in the diff tool: working tree, staged, or a commit against its parent. */
export function openDiffTool(root: string, path: string, from: { staged?: boolean; commit?: string } = {}) {
  const tool = getSettings().tools.diffTool
  const what = from.commit ? [`${from.commit}^!`] : from.staged ? ['--cached'] : []
  return git(root, ['difftool', '-y', ...toolArg(tool), ...what, '--', path])
}

/** Opens a conflicted file in the merge tool; git stages it when the tool says it is resolved. */
export function openMergeTool(root: string, path: string) {
  return git(root, ['mergetool', '-y', ...toolArg(getSettings().tools.mergeTool), '--', path])
}
