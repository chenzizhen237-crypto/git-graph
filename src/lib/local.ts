/**
 * Repositories already on this machine: found by scanning the folders in
 * Settings, each summarised (branch, changes, ahead/behind, last commit,
 * GitHub remote) for the Welcome screen and the Clone dialog.
 */
import { invoke } from '@tauri-apps/api/core'

import { run } from './git'
import { parseStatus } from './parse'
import { getSettings, updateSettings } from './settings'

export const SCAN_DEPTH = 3

export type LocalRepo = {
  path: string
  name: string
  /** The scanned folder it was found in. */
  folder: string
  branch: string
  changes: number
  ahead: number
  behind: number
  /** Last commit, Unix seconds; 0 for a repository without commits. */
  time: number
  subject: string
  /** owner/name of its GitHub remote, if any. */
  github?: string
}

export const scanRepos = (roots: string[], depth = SCAN_DEPTH) => invoke<string[]>('scan_repos', { roots, depth })

/** The folders to scan; the first time, the usual code folders that exist here. */
export async function repoFolders(): Promise<string[]> {
  const saved = getSettings().repoFolders
  if (saved) return saved
  const found = await invoke<string[]>('suggest_repo_folders').catch(() => [] as string[])
  updateSettings({ repoFolders: found })
  return found
}

export async function summarise(path: string, folder: string): Promise<LocalRepo> {
  const [status, last, remote] = await Promise.all([
    run(path, ['status', '--porcelain=v1', '-b', '-z']),
    run(path, ['log', '-1', '--format=%ct%x1f%s']),
    run(path, ['config', '--get', 'remote.origin.url']),
  ])
  const st = status.code === 0 ? parseStatus(status.stdout) : { branch: '', changes: [], ahead: 0, behind: 0 }
  const [time = '0', subject = ''] = last.stdout.trim().split('\x1f')
  const gh = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote.stdout.trim())?.[1]
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    folder,
    branch: st.branch.replace(/^No commits yet on /, ''),
    changes: st.changes.length,
    ahead: st.ahead,
    behind: st.behind,
    time: Number(time) || 0,
    subject,
    github: gh,
  }
}

let cache: LocalRepo[] | null = null
export const cachedLocalRepos = () => cache

/** Every repository in the scan folders, summarised, in folder then name order. */
export async function localRepos(): Promise<LocalRepo[]> {
  const folders = await repoFolders()
  const groups = await Promise.all(folders.map(async f => ({ folder: f, paths: await scanRepos([f]) })))
  const all = await Promise.all(groups.flatMap(g => g.paths.map(p => summarise(p, g.folder))))
  cache = all
  return all
}

/** Local clones by GitHub owner/name (lowercase), to offer Open instead of Clone. */
export function byGitHub(repos: LocalRepo[]) {
  const map = new Map<string, LocalRepo>()
  for (const r of repos) if (r.github) map.set(r.github.toLowerCase(), r)
  return map
}
