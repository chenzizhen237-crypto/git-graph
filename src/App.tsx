import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Banner, type RepoSwitch, Sidebar, StatusBar, TitleBar } from './components/Chrome'
import { CloneDialog, PublishDialog } from './components/GitHubDialogs'
import { ContextMenu } from './components/Menu'
import { CommandPalette, DialogHost, Toasts } from './components/Overlays'
import { SettingsDialog } from './components/Settings'
import { Sheets } from './components/Sheets'
import { Resizer, usePanelSize } from './components/Split'
import { TerminalPanel, TerminalSlot } from './components/Terminal'
import { cx } from './lib/cx'
import { actions, findRoot } from './lib/git'
import { t } from './lib/i18n'
import { checkRuns } from './lib/notify'
import { getSettings, stepZoom, toggleInspector, useSettings } from './lib/settings'
import { closeSheet } from './lib/sheets'
import { closeTerminal, setActiveTerminalRepo, toggleTerminal } from './lib/terminal'
import { closeMenu, togglePalette, useMenu, usePalette } from './lib/ui-state'
import { checkOnStartup } from './lib/update'
import { AppProvider, openNextIn, readRecents, rememberRepo, useApp, type View } from './state'
import { ActionsView } from './views/Actions'
import { AgentsView } from './views/Agents'
import { ChangesView } from './views/Changes'
import { HistoryView } from './views/History'
import { IssuesView } from './views/Issues'
import { OverviewView } from './views/Overview'
import { PullRequestsView } from './views/PullRequests'
import { StashesView } from './views/Stashes'
import { Welcome } from './views/Welcome'

export function App() {
  const [tabs, setTabs] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  // Subscribe only to language at the root so unrelated setting edits never re-render the whole tree.
  useSettings(s => s.language)
  // A newer release, once per launch: the title bar pill and a toast that stays until answered.
  useEffect(checkOnStartup, [])

  const openRepo = useCallback((path: string, view?: View) => {
    if (view) openNextIn(view)
    setTabs(prev => (prev.includes(path) ? prev : [...prev, path]))
    setActive(path)
  }, [])

  const closeRepo = useCallback((path: string) => {
    closeTerminal(path)
    setTabs(prev => {
      const next = prev.filter(p => p !== path)
      setActive(cur => (cur === path ? (next.at(-1) ?? null) : cur))
      return next
    })
  }, [])

  // A repository passed on the command line opens straight away; otherwise the last one, if that is on.
  useEffect(() => {
    let live = true
    const start = async (attempt: number): Promise<void> => {
      try {
        const path = await invoke<string | null>('initial_repo')
        const last = getSettings().openLastRepo ? readRecents()[0]?.path : undefined
        const found = (path && (await findRoot(path))) || (last && (await findRoot(last)))
        if (found && live) {
          setTabs(prev => (prev.length ? prev : [found]))
          setActive(cur => cur ?? found)
        }
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
    if (active) setActiveTerminalRepo(active)
    void getCurrentWindow()
      .setTitle(active ? `${active.split('/').pop()} — Git Graph` : 'Git Graph')
      .catch(() => {})
  }, [active])

  // One toast stack for every screen, so a notice survives switching repositories.
  if (!active || !tabs.length)
    return (
      <>
        <Welcome onOpen={path => openRepo(path)} />
        <Toasts />
      </>
    )

  return (
    <div className="flex h-full flex-col bg-app">
      {tabs.length > 1 && <RepoTabStrip tabs={tabs} active={active} onSelect={setActive} onClose={closeRepo} onHome={() => setActive(null)} />}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {tabs.map(root => {
          const isActive = root === active
          return (
            <div key={root} className={cx('flex min-h-0 flex-1 flex-col', !isActive && 'hidden')}>
              <AppProvider root={root} active={isActive}>
                <Workspace active={isActive} onOpen={openRepo} onHome={() => setActive(null)} />
              </AppProvider>
            </div>
          )
        })}
      </div>
      <Toasts />
    </div>
  )
}

function RepoTabStrip({
  tabs,
  active,
  onSelect,
  onClose,
  onHome,
}: {
  tabs: string[]
  active: string
  onSelect: (path: string) => void
  onClose: (path: string) => void
  onHome: () => void
}) {
  return (
    <div className="flex h-8.5 shrink-0 items-center gap-1 overflow-x-auto border-b border-subtle bg-titlebar px-2.5">
      {tabs.map(path => {
        const name = path.split('/').filter(Boolean).pop() ?? path
        const on = path === active
        return (
          <div
            key={path}
            className={cx(
              'group flex h-6.5 max-w-52 shrink-0 items-center gap-1.5 rounded-md border pr-1 pl-2.5 text-sm',
              on ? 'border-strong bg-app font-semibold text-primary' : 'border-transparent text-secondary hover:bg-hover',
            )}
          >
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(path)} title={path}>
              {name}
            </button>
            <button
              type="button"
              className="rounded-sm p-0.5 text-faint opacity-70 hover:bg-hover hover:text-primary hover:opacity-100"
              title={t('Close tab')}
              onClick={e => {
                e.stopPropagation()
                onClose(path)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-hover hover:text-primary"
        title={t('Open repository')}
        onClick={onHome}
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

function Workspace({ active, onOpen, onHome }: { active: boolean; onOpen: (root: string, view?: View) => void; onHome: () => void }) {
  const app = useApp()
  const { repo, view, setView, act, toast } = app
  const menu = useMenu()
  const paletteOpen = usePalette()
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
  const autoFetchMinutes = useSettings(s => s.autoFetchMinutes)

  // Background fetch on the chosen interval, quietly: no busy state or toast unless it fails.
  useEffect(() => {
    if (!autoFetchMinutes) return
    const id = window.setInterval(() => void act('Fetch', actions.fetch(), { quiet: true }), autoFetchMinutes * 60_000)
    return () => window.clearInterval(id)
  }, [autoFetchMinutes, act])

  // Settings → Notifications: watch CI on the current branch once a minute.
  const ciWatch = useSettings(s => s.notify.enabled && s.notify.ci)
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
  // Close sheets when this repository tab unmounts.
  useEffect(
    () => () => {
      closeTerminal(root)
      closeSheet()
    },
    [root],
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

  // Keep a ref to latest callbacks/state so the global keydown listener never rebinds on state changes.
  const stateRef = useRef({ app, repos, toggleSidebar })
  stateRef.current = { app, repos, toggleSidebar }

  // Global shortcuts (only for the active repository tab).
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const { app: a, repos: r, toggleSidebar: toggleSide } = stateRef.current
      // ⌃` shows and hides the terminal, as in VS Code.
      if (e.ctrlKey && !e.metaKey && e.code === 'Backquote') {
        e.preventDefault()
        toggleTerminal(a.root)
        return
      }
      if (!e.metaKey && !e.ctrlKey) return
      // ⌘Z / ⇧⌘Z undo git actions, except where ⌘Z means undo typing.
      if (e.metaKey && e.key.toLowerCase() === 'z') {
        const el = e.target as HTMLElement | null
        if (el?.closest?.('input, textarea, [contenteditable], .xterm')) return
        e.preventDefault()
        if (e.shiftKey) a.redo()
        else a.undo()
        return
      }
      // Keys typed into the terminal belong to the shell (⌃R, ⌃O…), not to the app.
      if (e.ctrlKey && !e.metaKey && (e.target as HTMLElement | null)?.closest?.('.xterm')) return
      const k = e.key.toLowerCase()
      const handled = () => e.preventDefault()
      if (k === 'k') {
        handled()
        togglePalette()
      } else if (k === ',') {
        handled()
        setSettingsOpen(true)
      } else if (k === '1') {
        handled()
        a.setView('history')
      } else if (k === '2') {
        handled()
        a.setView('changes')
      } else if (k === '3') {
        handled()
        a.setView('stashes')
      } else if (k === '5') {
        handled()
        a.setView('actions')
      } else if (k === '4') {
        handled()
        a.setView('pulls')
      } else if (k === '6') {
        handled()
        a.setView('overview')
      } else if (k === '7') {
        handled()
        a.setView('issues')
      } else if (k === '8') {
        handled()
        a.setView('agents')
      } else if (k === '=' || k === '+' || k === '-' || k === '0') {
        handled()
        stepZoom(k === '0' ? 0 : k === '-' ? -1 : 1)
      } else if (k === 'r') {
        handled()
        void a.refresh('full')
      } else if (k === 'o') {
        handled()
        if (e.shiftKey) r.all()
        else void r.openFolder()
      } else if (e.code === 'Backslash' && e.shiftKey) {
        handled()
        toggleInspector()
      } else if (k === '\\') {
        handled()
        toggleSide()
      } else if (k === 'f' && e.shiftKey) {
        handled()
        void a.act('Fetch', actions.fetch(), { done: 'Fetched' })
      } else if (k === 'p' && e.shiftKey && a.repo) {
        handled()
        void a.act('Push', actions.push(a.repo), { done: 'Pushed' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-app">
      <TitleBar repos={repos} sidebar={showSidebar} onToggleSidebar={toggleSidebar} onSettings={() => setSettingsOpen(true)} />
      <Banner />
      <div className="flex min-h-0 flex-1">
        {showSidebar && (
          <>
            <Sidebar width={sidebar.size} />
            <Resizer panel={sidebar} />
          </>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
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
      {active && paletteOpen && <CommandPalette onSwitchRepo={() => void repos.openFolder()} onSettings={() => setSettingsOpen(true)} />}
      {active && settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {active && menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {active && app.publishOpen && <PublishDialog onClose={() => app.setPublishOpen(false)} />}
      {active && cloning && (
        <CloneDialog
          onClose={() => setCloning(false)}
          onCloned={path => {
            setCloning(false)
            onOpen(path)
          }}
        />
      )}
      {active && <Sheets />}
      {active && <DialogHost />}
    </div>
  )
}
