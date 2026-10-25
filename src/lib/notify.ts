/**
 * Desktop notifications (Settings → Notifications): CI runs on your branch
 * finishing, new commits after a fetch, long operations, and a new release.
 */
import { getVersion } from '@tauri-apps/api/app'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

import { listRuns, type Run } from './actions'
import { rest } from './github'
import { t } from './i18n'
import { getSettings, type Notify } from './settings'

/** This app's GitHub repository, for the update check. */
export const REPO_SLUG = 'chenzizhen237-crypto/git-graph'

async function allowed() {
  if (await isPermissionGranted()) return true
  return (await requestPermission()) === 'granted'
}

/** Shows a notification if `kind` is switched on (and, if asked, only while the window is in the background). */
export async function notify(kind: keyof Notify | 'test', title: string, body?: string) {
  const n = getSettings().notify
  if (kind !== 'test') {
    if (!n.enabled || !n[kind]) return
    if (kind !== 'updates' && n.backgroundOnly && (await getCurrentWindow().isFocused())) return
  }
  if (await allowed()) sendNotification({ title, body })
}

/** Run ids already seen finishing, so each is announced once. */
const seen = new Set<number>()
const live = new Set<number>()

/** Checks the branch's runs: remembers the running ones, announces the ones that just finished. */
export async function checkRuns(root: string, branch: string) {
  const runs = await listRuns(root, branch)
  const finished: Run[] = []
  for (const r of runs) {
    if (r.status !== 'completed') live.add(r.id)
    else if (live.has(r.id) && !seen.has(r.id)) {
      live.delete(r.id)
      seen.add(r.id)
      finished.push(r)
    }
  }
  for (const r of finished) {
    const ok = r.conclusion === 'success'
    await notify('ci', t(ok ? '{name} passed on {branch}' : '{name} failed on {branch}', { name: r.name, branch }), r.display_title)
  }
  return live.size > 0
}

/** Semver-ish compare of `a` and `b`: >0 when a is newer. */
export function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** The latest release's tag and page, when it is newer than this build. */
export async function newerRelease(repo: string): Promise<{ tag: string; url: string } | null> {
  const [mine, latest] = await Promise.all([getVersion(), rest(`/repos/${repo}/releases/latest`)])
  const { tag_name, html_url } = JSON.parse(latest) as { tag_name: string; html_url: string }
  return compareVersions(tag_name, mine) > 0 ? { tag: tag_name, url: html_url } : null
}
