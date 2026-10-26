/**
 * The app's own updates: checks GitHub for a newer release (on startup when
 * Settings → Notifications → Updates is on, or from the button in Settings → About),
 * and installs one through the bundled installer.
 */
import { invoke } from '@tauri-apps/api/core'
import { CircleArrowDown, Download, FileText } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { openUrl } from './github'
import { newerRelease, notify, REPO_SLUG } from './notify'
import { t } from './i18n'
import { getSettings, updateSettings } from './settings'
import { dismissToast, toast } from './toasts'

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'latest' | 'error' | 'installing'
  /** The newer release, once one is found. */
  release?: { tag: string; url: string }
  error?: string
}

let state: UpdateState = { status: 'idle' }
const listeners = new Set<() => void>()

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function useUpdate() {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

/** Asks GitHub for the latest release. `startup` checks are quiet when nothing is found or the network fails. */
export async function checkForUpdate({ startup = false } = {}) {
  if (state.status === 'checking' || state.status === 'installing') return
  set({ status: 'checking', error: undefined })
  try {
    const release = await newerRelease(REPO_SLUG)
    if (release) {
      const fresh = state.release?.tag !== release.tag
      set({ status: 'available', release })
      // A startup check announces it; a check from Settings shows the result on its button.
      if (fresh && startup) {
        showUpdate()
        void notify('updates', t('Git Graph {tag} is available', { tag: release.tag }))
      }
    } else set({ status: 'latest', release: undefined })
  } catch (e) {
    set({ status: startup ? 'idle' : 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

let startupChecked = false
export function checkOnStartup() {
  if (startupChecked || !getSettings().notify.updates) return
  startupChecked = true
  void checkForUpdate({ startup: true })
}

/** Opens the installer in Terminal; it downloads and verifies the release, quits Git Graph and opens the new version. */
export async function installUpdate() {
  set({ status: 'installing', error: undefined })
  if (shown) showUpdate()
  try {
    await invoke('install_update')
  } catch (e) {
    set({ status: 'available', error: e instanceof Error ? e.message : String(e) })
    if (shown) showUpdate()
  }
}

/** Whether the update toast is up, so install progress updates it in place. */
let shown = false

/** The update toast: stays until answered; the title bar pill brings it back. */
export function showUpdate() {
  const { release, status, error } = state
  if (!release) return
  const v = release.tag.replace(/^v/, '')
  const installing = status === 'installing'
  shown = true
  toast({
    key: 'update',
    kind: 'info',
    icon: CircleArrowDown,
    title: t('Git Graph {tag} is available', { tag: release.tag }),
    detail:
      error ??
      (installing
        ? t('The installer is running in Terminal. Git Graph quits and reopens when it is done.')
        : t('Updating downloads the new version, quits Git Graph and opens it again.')),
    mono: !!error,
    actions: [
      { label: t('Update to {v}', { v }), icon: Download, primary: true, busy: installing, keep: true, run: () => void installUpdate() },
      { label: t('Release notes'), icon: FileText, keep: true, run: () => void openUrl(release.url) },
    ],
    links: [
      {
        label: t('Remind me later'),
        run: () => {
          shown = false
        },
      },
      { label: t("Don't check for updates"), run: stopCheckingUpdates },
    ],
    onClose: () => {
      shown = false
    },
  })
}

/** "Don't check for updates": hides the toast and turns the startup check off (Settings → About turns it back on). */
export function stopCheckingUpdates() {
  updateSettings({ notify: { ...getSettings().notify, updates: false } })
  shown = false
  dismissToast('update')
}
