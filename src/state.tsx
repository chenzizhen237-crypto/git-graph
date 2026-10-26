/**
 * App state: the open repository, what the log shows, the selected things,
 * and `act`, which runs a git action, reports failures and refreshes.
 */
import { listen } from '@tauri-apps/api/event'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { MenuItem, MenuState } from './components/Menu'
import { GitError, git, loadRepo, run, watchRepo } from './lib/git'
import { GhError, gh } from './lib/github'
import { t } from './lib/i18n'
import { notify } from './lib/notify'
import { isConflict } from './lib/parse'
import { getSettings } from './lib/settings'
import { toast } from './lib/toasts'
import type { Stage } from './lib/tokens'
import type { LogQuery, RepoData } from './lib/types'

export type View = 'history' | 'changes' | 'stashes' | 'pulls' | 'actions' | 'overview'

/** The view the next repository opens in (the CI/CD view opens one straight in Actions). */
let startView: View | null = null
export const openNextIn = (view: View) => {
  startView = view
}

type Ask = { title: string; text?: string; confirm: string; danger?: boolean }
type Prompt = { title: string; placeholder?: string; initial?: string; confirm: string; /** An empty answer is allowed. */ optional?: boolean }
export type Dialog = (Ask & { kind: 'ask'; resolve: (ok: boolean) => void }) | (Prompt & { kind: 'prompt'; resolve: (value: string | null) => void })

const page = () => getSettings().pageSize

export const defaultQuery = (): LogQuery => ({ branch: '--all', query: '', author: '', since: '', limit: page() })

/** The design's Stage axis, read off the repository. */
export function stageOf(repo: RepoData | null): Stage {
  if (!repo) return 'Clean'
  if (repo.operation === 'rebase') return 'Rebasing'
  if (repo.operation || repo.changes.some(isConflict)) return 'Conflict'
  if (repo.changes.length) return 'Working'
  return 'Clean'
}

function useAppState(root: string) {
  const [repo, setRepo] = useState<RepoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQueryState] = useState<LogQuery>(defaultQuery)
  const [view, setView] = useState<View>(() => startView ?? 'history')
  useEffect(() => {
    startView = null
  }, [])
  const [selected, setSelected] = useState<string | undefined>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [lastFetch, setLastFetch] = useState<number | null>(null)
  const queryRef = useRef(query)
  queryRef.current = query
  const loading = useRef(0)

  const refreshNow = useCallback(async () => {
    const ticket = ++loading.current
    try {
      const data = await loadRepo(root, queryRef.current)
      // A newer refresh started while this one ran; keep its result.
      if (ticket !== loading.current) return
      setRepo(data)
      setError(null)
    } catch (e) {
      if (ticket === loading.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [root])

  const running = useRef<Promise<void> | null>(null)
  const again = useRef(false)
  const refresh = useCallback(async (): Promise<void> => {
    // Coalesce bursts (a checkout touches hundreds of files): one load at a time, one more after it.
    if (running.current) {
      again.current = true
      return running.current
    }
    running.current = refreshNow().finally(() => {
      running.current = null
      if (again.current) {
        again.current = false
        void refresh()
      }
    })
    return running.current
  }, [refreshNow])

  const setQuery = useCallback(
    (patch: Partial<LogQuery>) => {
      setQueryState(q => {
        const next = { ...q, ...patch, limit: patch.limit ?? (patch.branch !== undefined || patch.query !== undefined || patch.author !== undefined ? page() : q.limit) }
        queryRef.current = next
        return next
      })
      void refresh()
    },
    [refresh],
  )

  // Load, watch the repository, and refresh when it changes or the window comes back.
  useEffect(() => {
    setRepo(null)
    setSelected(undefined)
    void refresh()
    void watchRepo(root).catch(() => {})
    const un = listen<string>('repo-changed', () => void refresh())
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      void un.then(f => f())
      window.removeEventListener('focus', onFocus)
    }
  }, [root, refresh])

  const ask = useCallback((a: Ask) => new Promise<boolean>(resolve => setDialog({ ...a, kind: 'ask', resolve })), [])
  const prompt = useCallback((p: Prompt) => new Promise<string | null>(resolve => setDialog({ ...p, kind: 'prompt', resolve })), [])

  /** Runs a git (or gh) action: one at a time, failures as a toast, then a refresh. */
  const act = useCallback(
    async (label: string, args: string[], opts: { stdin?: string; done?: string; tool?: 'git' | 'gh'; quiet?: boolean } = {}) => {
      if (busy) return false
      if (!opts.quiet) setBusy(label)
      const isGit = opts.tool !== 'gh'
      const verb = (isGit && args[0]) || ''
      const { autoStash } = getSettings()
      // Settings → Git: carry uncommitted changes across a pull or a branch switch.
      const stashing = autoStash && verb === 'switch' && !!repo?.changes.some(c => c.x !== '?' && c.y !== '?')
      const argv = autoStash && verb === 'pull' ? [...args, '--autostash'] : args
      // Upstream before a fetch, to tell how many commits it brought.
      const before = verb === 'fetch' ? (await run(root, ['rev-parse', '--verify', '-q', '@{u}'])).stdout.trim() : ''
      const started = Date.now()
      try {
        if (stashing) await git(root, ['stash', 'push', '-m', 'git-graph: auto-stash before switching'])
        try {
          await (isGit ? git : gh)(root, argv, opts.stdin)
        } finally {
          if (stashing) await git(root, ['stash', 'pop'])
        }
        if (opts.done) toast({ kind: 'ok', title: t(opts.done) })
        if (verb === 'fetch' || verb === 'pull') setLastFetch(Date.now())
        if (before) {
          const n = Number((await run(root, ['rev-list', '--count', `${before}..@{u}`])).stdout.trim()) || 0
          if (n) void notify('fetch', t(n === 1 ? '{n} new commit on {branch}' : '{n} new commits on {branch}', { n, branch: repo?.upstream ?? '' }), repo?.name)
        }
        if (['push', 'pull', 'fetch', 'clone'].includes(verb) && !opts.quiet && Date.now() - started > 15_000)
          void notify('long', t('{label} finished', { label: t(label) }), repo?.name)
        return true
      } catch (e) {
        const detail = e instanceof GitError || e instanceof GhError ? e.message : String(e)
        toast({ kind: 'error', title: t('{label} failed', { label: t(label) }), detail })
        return false
      } finally {
        if (!opts.quiet) setBusy(null)
        void refresh()
      }
    },
    [busy, root, refresh, repo],
  )

  const stage = stageOf(repo)

  return {
    root,
    repo,
    error,
    query,
    setQuery,
    refresh,
    view,
    setView,
    selected,
    setSelected,
    paletteOpen,
    setPaletteOpen,
    busy,
    act,
    /** The app-wide toast stack (lib/toasts), here for components that already use the context. */
    toast,
    dialog,
    menu,
    closeMenu: () => setMenu(null),
    /** Opens the right-click menu at the pointer. */
    openMenu: (e: { preventDefault: () => void; clientX: number; clientY: number }, items: MenuItem[]) => {
      e.preventDefault()
      setMenu({ x: e.clientX, y: e.clientY, items })
    },
    publishOpen,
    setPublishOpen,
    closeDialog: () => setDialog(null),
    ask,
    prompt,
    stage,
    lastFetch,
    loadMore: () => setQuery({ limit: queryRef.current.limit + page() }),
  }
}

export type AppState = ReturnType<typeof useAppState>

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ root, children }: { root: string; children: ReactNode }) {
  const state = useAppState(root)
  useEffect(() => {
    document.documentElement.dataset.stage = state.stage
  }, [state.stage])
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export function useApp() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useApp outside AppProvider')
  return s
}

/** Remote ref names, to tell `origin/main` from a local branch called `origin/main`. */
export function useRemoteNames() {
  const { repo } = useApp()
  return useMemo(() => new Set(repo?.refs.filter(r => r.kind === 'remote').map(r => r.name) ?? []), [repo?.refs])
}

// ─── Recent repositories (per machine, so localStorage) ─────────────────────

export type Recent = { path: string; branch?: string; at: number }

export function readRecents(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem('recents') ?? '[]') as Recent[]
  } catch {
    return []
  }
}

export function rememberRepo(path: string, branch?: string) {
  const list = [{ path, branch, at: Date.now() }, ...readRecents().filter(r => r.path !== path)].slice(0, 12)
  try {
    localStorage.setItem('recents', JSON.stringify(list))
  } catch {}
}

export function forgetRepo(path: string) {
  try {
    localStorage.setItem('recents', JSON.stringify(readRecents().filter(r => r.path !== path)))
  } catch {}
}
