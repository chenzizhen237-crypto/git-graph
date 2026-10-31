import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Banner, type RepoSwitch, Sidebar, StatusBar, TitleBar } from './components/Chrome'
import { CloneDialog, PublishDialog } from './components/GitHubDialogs'
import { ContextMenu } from './components/Menu'
import { CommandPalette, DialogHost, Toasts } from './components/Overlays'
import { SettingsDialog } from './components/Settings'
import { Sheets } from './components/Sheets'
import { Resizer, usePanelSize } from './components/Split'
import { TerminalPanel, TerminalSlot } from './components/Terminal'
import { actions, findRoot } from './lib/git'
import { t } from './lib/i18n'
import { checkRuns } from './lib/notify'
import { checkOnStartup } from './lib/update'
import { getSettings, stepZoom, toggleInspector, useSettings } from './lib/settings'
import { closeSheet } from './lib/sheets'
import { closeTerminal, toggleTerminal } from './lib/terminal'
import { AppProvider, openNextIn, readRecents, rememberRepo, useApp, type View } from './state'
import { ChangesView } from './views/Changes'
import { ActionsView } from './views/Actions'
import { AgentsView } from './views/Agents'
import { HistoryView } from './views/History'
import { IssuesView } from './views/Issues'
import { OverviewView } from './views/Overview'
import { PullRequestsView } from './views/PullRequests'
import { StashesView } from './views/Stashes'
import { Welcome } from './views/Welcome'

export function App() {
  const [root, setRoot] = useState<string | null>(null)
  // Subscribing here re-renders the whole tree when the language changes, so every t() call updates.
  useSettings()
  // A newer release, once per launch: the title bar pill and a toast that stays until answered.
  useEffect(checkOnStartup, [])

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

  // One toast stack for every screen, so a notice survives switching repositories.
  if (!root)
    return (
      <>
        <Welcome onOpen={setRoot} />
        <Toasts />
      </>
    )
  return (
    <>
      {/* Keyed by the repository, so switching straight from one to another starts afresh. */}
      <AppProvider key={root} root={root}>
        <Workspace
          onOpen={(path, view) => {
            if (view) openNextIn(view)
            setRoot(path)
          }}
          onHome={() => setRoot(null)}
        />
      </AppProvider>
      <Toasts />
    </>
  )
}

function Workspace({ onOpen, onHome }: { onOpen: (root: string, view?: View) => void; onHome: () => void }) {
  const app = useApp()
  const { repo, view, setView, paletteOpen, setPaletteOpen, refresh, act, toast } = app
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cloning, setCloning] = useState(false)

  // The title bar's repository dropdown switches repositories in this window.
  const repos = useMemo<RepoSwitch>(
    () => ({
      open: path => onOpen(path),
      openFolder: async () => {
        const dir = await open({ directory: true, title: t('Open repository') })
        if (typeof dir !== 'string') return
        const found = await findRoot(dir).catch(() => null)
        if (found) onOpen(found)
        else toast({ kind: 'error', title: t('{path} is not inside a Git repository.', { path: dir.replace(/^\/Users\/[^/]+/, '~') }) })
      },
      clone: () => setCloning(true),
      all: onHome,
    }),
    [onOpen, onHome, toast],
  )
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

  const sidebar = usePanelSize('sidebar', 248, 180, 480)
  const terminal = usePanelSize('terminal', 260, 120, 720)
  // The shells belong to this repository: end them when the window switches to another one.
  useEffect(
    () => () => {
      closeTerminal()
      closeSheet()
    },
    [],
  )
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
      // ⌃` shows and hides the terminal, as in VS Code.
      if (e.ctrlKey && !e.metaKey && e.code === 'Backquote') {
        e.preventDefault()
        toggleTerminal()
        return
      }
      if (!e.metaKey && !e.ctrlKey) return
      // ⌘Z / ⇧⌘Z undo git actions, except where ⌘Z means undo typing.
      if (e.metaKey && e.key.toLowerCase() === 'z') {
        const el = e.target as HTMLElement | null
        if (el?.closest?.('input, textarea, [contenteditable], .xterm')) return
        e.preventDefault()
        if (e.shiftKey) app.redo()
        else app.undo()
        return
      }
      // Keys typed into the terminal belong to the shell (⌃R, ⌃O…), not to the app.
      if (e.ctrlKey && !e.metaKey && (e.target as HTMLElement | null)?.closest?.('.xterm')) return
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
      } else if (k === '7') {
        handled()
        setView('issues')
      } else if (k === '8') {
        handled()
        setView('agents')
      } else if (k === '=' || k === '+' || k === '-' || k === '0') {
        handled()
        stepZoom(k === '0' ? 0 : k === '-' ? -1 : 1)
      } else if (k === 'r') {
        handled()
        void refresh()
      } else if (k === 'o') {
        handled()
        if (e.shiftKey) repos.all()
        else void repos.openFolder()
      } else if (e.code === 'Backslash' && e.shiftKey) {
        handled()
        toggleInspector()
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
  }, [paletteOpen, setPaletteOpen, setView, refresh, repos, act, repo, toggleSidebar, app])

  return (
    <div className="flex h-full flex-col bg-app">
      <TitleBar repos={repos} sidebar={showSidebar} onToggleSidebar={toggleSidebar} onSettings={() => setSettingsOpen(true)} />
      <Banner />
      <div className="flex min-h-0 flex-1">
        <div className="panel-slide flex shrink-0 overflow-hidden" style={{ width: showSidebar ? sidebar.size : 0 }} inert={!showSidebar}>
          <Sidebar width={sidebar.size} />
        </div>
        {showSidebar && <Resizer panel={sidebar} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <div key={view} className="route flex min-h-0 flex-1">
            {view === 'history' && <HistoryView />}
            {view === 'changes' && <ChangesView />}
            {view === 'stashes' && <StashesView />}
            {view === 'pulls' && <PullRequestsView />}
            {view === 'actions' && <ActionsView />}
            {view === 'issues' && <IssuesView />}
            {view === 'agents' && <AgentsView />}
            {view === 'overview' && <OverviewView onOpenRepo={path => (path === app.root ? setView('actions') : onOpen(path, 'actions'))} />}
          </div>
          {/* History docks the terminal under its graph, beside the inspector; other views under the whole view. */}
          {view !== 'history' && <TerminalSlot />}
          <TerminalPanel cwd={app.root} panel={terminal} />
        </div>
      </div>
      <StatusBar />
      {paletteOpen && <CommandPalette onSwitchRepo={() => void repos.openFolder()} onSettings={() => setSettingsOpen(true)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {app.menu && <ContextMenu menu={app.menu} onClose={app.closeMenu} />}
      {app.publishOpen && <PublishDialog onClose={() => app.setPublishOpen(false)} />}
      {cloning && (
        <CloneDialog
          onClose={() => setCloning(false)}
          onCloned={path => {
            setCloning(false)
            onOpen(path)
          }}
        />
      )}
      <Sheets />
      <DialogHost />
    </div>
  )
}
