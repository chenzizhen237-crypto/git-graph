import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Banner, Sidebar, StatusBar, TitleBar } from './components/Chrome'
import { PublishDialog } from './components/GitHubDialogs'
import { ContextMenu } from './components/Menu'
import { CommandPalette, DialogHost, Toasts } from './components/Overlays'
import { SettingsDialog } from './components/Settings'
import { Resizer, usePanelSize } from './components/Split'
import { actions, findRoot } from './lib/git'
import { t } from './lib/i18n'
import { checkRuns, newerRelease, notify, REPO_SLUG } from './lib/notify'
import { getSettings, stepZoom, useSettings } from './lib/settings'
import { AppProvider, openNextIn, readRecents, rememberRepo, useApp, type View } from './state'
import { ChangesView } from './views/Changes'
import { ActionsView } from './views/Actions'
import { HistoryView } from './views/History'
import { OverviewView } from './views/Overview'
import { PullRequestsView } from './views/PullRequests'
import { StashesView } from './views/Stashes'
import { Welcome } from './views/Welcome'

export function App() {
  const [root, setRoot] = useState<string | null>(null)
  // Subscribing here re-renders the whole tree when the language changes, so every t() call updates.
  useSettings()

  // A repository passed on the command line opens straight away; otherwise the last one, if that is on.
  useEffect(() => {
    let live = true
    const start = async (attempt: number): Promise<void> => {
      try {
        const path = await invoke<string | null>('initial_repo')
        const last = getSettings().openLastRepo ? readRecents()[0]?.path : undefined
        const found = (path && (await findRoot(path))) || (last && (await findRoot(last)))
        if (found && live) setRoot(r => r ?? found)
      } catch (e) {
        // A cold start can reach the backend before it is ready; try again shortly.
        if (attempt < 3 && live) {
          await new Promise(r => setTimeout(r, 250 * (attempt + 1)))
          return start(attempt + 1)
        }
        console.error('Could not open the starting repository', e)
      }
    }
    void start(0)
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    void getCurrentWindow()
      .setTitle(root ? `${root.split('/').pop()} — Git Graph` : 'Git Graph')
      .catch(() => {})
  }, [root])

  if (!root) return <Welcome onOpen={setRoot} />
  return (
    // Keyed by the repository, so switching straight from one to another starts afresh.
    <AppProvider key={root} root={root}>
      <Workspace
        onSwitchRepo={() => setRoot(null)}
        onOpenRepo={(path, view) => {
          openNextIn(view)
          setRoot(path)
        }}
      />
    </AppProvider>
  )
}

let updateChecked = false

function Workspace({ onSwitchRepo, onOpenRepo }: { onSwitchRepo: () => void; onOpenRepo: (path: string, view: View) => void }) {
  const app = useApp()
  const { repo, view, setView, paletteOpen, setPaletteOpen, refresh, act } = app
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { autoFetchMinutes } = useSettings()

  // Background fetch on the chosen interval, quietly: no busy state or toast unless it fails.
  useEffect(() => {
    if (!autoFetchMinutes) return
    const id = window.setInterval(() => void act('Fetch', actions.fetch(), { quiet: true }), autoFetchMinutes * 60_000)
    return () => window.clearInterval(id)
  }, [autoFetchMinutes, act])
  // Settings → Notifications: watch CI on the current branch once a minute.
  const { notify: notifyPrefs } = useSettings()
  const ciWatch = notifyPrefs.enabled && notifyPrefs.ci
  const branch = repo?.branch
  const root = app.root
  useEffect(() => {
    if (!ciWatch || !branch) return
    let off = false
    const tick = () =>
      void checkRuns(root, branch).catch(() => {
        // No GitHub remote or no access: stop asking for this repository.
        off = true
      })
    tick()
    const id = window.setInterval(() => !off && tick(), 60_000)
    return () => window.clearInterval(id)
  }, [ciWatch, root, branch])

  // A newer release, once per launch.
  const toastRef = useRef(app.toast)
  useEffect(() => {
    if (!getSettings().notify.updates || updateChecked) return
    updateChecked = true
    void newerRelease(REPO_SLUG)
      .then(r => {
        if (!r) return
        toastRef.current({ kind: 'ok', title: t('Git Graph {tag} is available', { tag: r.tag }), detail: t('Download it from Settings → About → Releases on GitHub.') })
        void notify('updates', t('Git Graph {tag} is available', { tag: r.tag }))
      })
      .catch(() => {})
  }, [])
  const sidebar = usePanelSize('sidebar', 248, 180, 480)
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem('sidebar:hidden') !== '1')
  const toggleSidebar = useCallback(
    () =>
      setShowSidebar(v => {
        localStorage.setItem('sidebar:hidden', v ? '1' : '0')
        return !v
      }),
    [],
  )

  const repoRoot = repo?.root
  const repoBranch = repo?.branch
  useEffect(() => {
    if (repoRoot) rememberRepo(repoRoot, repoBranch)
  }, [repoRoot, repoBranch])

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      const k = e.key.toLowerCase()
      const handled = () => e.preventDefault()
      if (k === 'k') {
        handled()
        setPaletteOpen(!paletteOpen)
      } else if (k === ',') {
        handled()
        setSettingsOpen(true)
      } else if (k === '1') {
        handled()
        setView('history')
      } else if (k === '2') {
        handled()
        setView('changes')
      } else if (k === '3') {
        handled()
        setView('stashes')
      } else if (k === '5') {
        handled()
        setView('actions')
      } else if (k === '4') {
        handled()
        setView('pulls')
      } else if (k === '6') {
        handled()
        setView('overview')
      } else if (k === '=' || k === '+' || k === '-' || k === '0') {
        handled()
        stepZoom(k === '0' ? 0 : k === '-' ? -1 : 1)
      } else if (k === 'r') {
        handled()
        void refresh()
      } else if (k === 'o') {
        handled()
        onSwitchRepo()
      } else if (k === '\\') {
        handled()
        toggleSidebar()
      } else if (k === 'f' && e.shiftKey) {
        handled()
        void act('Fetch', actions.fetch(), { done: 'Fetched' })
      } else if (k === 'p' && e.shiftKey && repo) {
        handled()
        void act('Push', actions.push(repo), { done: 'Pushed' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, setPaletteOpen, setView, refresh, onSwitchRepo, act, repo, toggleSidebar])

  return (
    <div className="flex h-full flex-col bg-app">
      <TitleBar onSwitchRepo={onSwitchRepo} sidebar={showSidebar} onToggleSidebar={toggleSidebar} onSettings={() => setSettingsOpen(true)} />
      <Banner />
      <div className="flex min-h-0 flex-1">
        {showSidebar && (
          <>
            <Sidebar width={sidebar.size} />
            <Resizer panel={sidebar} />
          </>
        )}
        {view === 'history' && <HistoryView />}
        {view === 'changes' && <ChangesView />}
        {view === 'stashes' && <StashesView />}
        {view === 'pulls' && <PullRequestsView />}
        {view === 'actions' && <ActionsView />}
        {view === 'overview' && <OverviewView onOpenRepo={path => (path === app.root ? setView('actions') : onOpenRepo(path, 'actions'))} />}
      </div>
      <StatusBar />
      {paletteOpen && <CommandPalette onSwitchRepo={onSwitchRepo} onSettings={() => setSettingsOpen(true)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {app.menu && <ContextMenu menu={app.menu} onClose={app.closeMenu} />}
      {app.publishOpen && <PublishDialog onClose={() => app.setPublishOpen(false)} />}
      <DialogHost />
      <Toasts />
    </div>
  )
}
