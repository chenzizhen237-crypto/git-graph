/**
 * App state: the open repository, what the log shows, the selected things,
 * and `act`, which runs a git action, reports failures and refreshes.
 */
import { listen } from '@tauri-apps/api/event'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { GitError, git, loadRepo, watchRepo } from './lib/git'
import { isConflict } from './lib/parse'
import type { Stage } from './lib/tokens'
import type { LogQuery, RepoData } from './lib/types'

export type View = 'history' | 'changes' | 'stashes'

export type Toast = { id: number; kind: 'ok' | 'error'; title: string; detail?: string }

type Ask = { title: string; text?: string; confirm: string; danger?: boolean }
type Prompt = { title: string; placeholder?: string; initial?: string; confirm: string; /** An empty answer is allowed. */ optional?: boolean }
export type Dialog = (Ask & { kind: 'ask'; resolve: (ok: boolean) => void }) | (Prompt & { kind: 'prompt'; resolve: (value: string | null) => void })

const PAGE = 600

export const DEFAULT_QUERY: LogQuery = { branch: '--all', query: '', author: '', since: '', limit: PAGE }

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
  const [query, setQueryState] = useState<LogQuery>(DEFAULT_QUERY)
  const [view, setView] = useState<View>('history')
  const [selected, setSelected] = useState<string | undefined>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [lastFetch, setLastFetch] = useState<number | null>(null)
  const queryRef = useRef(query)
  queryRef.current = query
  const loading = useRef(0)

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts(ts => [...ts.slice(-3), { ...t, id }])
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), t.kind === 'error' ? 9000 : 3500)
  }, [])

  const refresh = useCallback(async () => {
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

  const setQuery = useCallback((patch: Partial<LogQuery>) => {
    setQueryState(q => {
      const next = { ...q, ...patch, limit: patch.limit ?? (patch.branch !== undefined || patch.query !== undefined || patch.author !== undefined ? PAGE : q.limit) }
      queryRef.current = next
      return next
    })
    void refresh()
  }, [refresh])

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

  /** Runs a git action: one at a time, failures as a toast, then a refresh. */
  const act = useCallback(
    async (label: string, args: string[], opts: { stdin?: string; done?: string } = {}) => {
      if (busy) return false
      setBusy(label)
      try {
        await git(root, args, opts.stdin)
        if (opts.done) toast({ kind: 'ok', title: opts.done })
        if (args[0] === 'fetch' || args[0] === 'pull') setLastFetch(Date.now())
        return true
      } catch (e) {
        const detail = e instanceof GitError ? e.message : String(e)
        toast({ kind: 'error', title: `${label} failed`, detail })
        return false
      } finally {
        setBusy(null)
        void refresh()
      }
    },
    [busy, root, refresh, toast],
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
    toast,
    toasts,
    dismissToast: (id: number) => setToasts(ts => ts.filter(t => t.id !== id)),
    dialog,
    closeDialog: () => setDialog(null),
    ask,
    prompt,
    stage,
    lastFetch,
    loadMore: () => setQuery({ limit: queryRef.current.limit + PAGE }),
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

// ─── Theme and recent repositories (per machine, so localStorage) ──────────

export type ThemePref = 'system' | 'light' | 'dark'

export function readTheme(): ThemePref {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(t: ThemePref) {
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('theme', t)
  } catch {}
}

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
