/** Window/Welcome: open, clone or create a repository, or pick a recent one. */
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getVersion } from '@tauri-apps/api/app'
import { open } from '@tauri-apps/plugin-dialog'
import { CloudDownload, Folder, FolderGit2, FolderOpen, FolderPlus, RefreshCcw, ScanSearch, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import appIcon from '../../assets/icon/app-icon.svg'
import { CloneDialog } from '../components/GitHubDialogs'
import { SettingsDialog } from '../components/Settings'
import { Button, Chip, Empty, IconButton } from '../components/ui'
import { cx } from '../lib/cx'
import { findRoot, run } from '../lib/git'
import { t } from '../lib/i18n'
import { cachedLocalRepos, type LocalRepo, localRepos, SCAN_DEPTH } from '../lib/local'
import { getSettings, useSettings } from '../lib/settings'
import { forgetRepo, type Recent, readRecents } from '../state'

const home = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 60) return `${Math.max(1, m)}m`
  if (m < 60 * 24) return `${Math.round(m / 60)}h`
  if (m < 60 * 24 * 7) return `${Math.round(m / 1440)}d`
  return `${Math.round(m / 10080)}w`
}

export function Welcome({ onOpen }: { onOpen: (root: string) => void }) {
  const [recents, setRecents] = useState<Recent[]>(readRecents)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [version, setVersion] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [local, setLocal] = useState<LocalRepo[] | null>(cachedLocalRepos)
  // A scan that takes this long is usually waiting on the macOS folder-access prompt.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (local) return
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [local])
  const [tab, setTab] = useState<'recent' | 'mac'>(() => (localStorage.getItem('welcome:tab') as 'recent' | null) ?? 'mac')
  const { repoFolders: savedFolders } = useSettings()
  const folders = savedFolders ?? []
  const chooseTab = (k: 'recent' | 'mac') => {
    setTab(k)
    localStorage.setItem('welcome:tab', k)
  }
  const rescan = async () => {
    try {
      setLocal(await localRepos())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLocal([])
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: scan once when the screen opens
  useEffect(() => {
    void rescan()
  }, [])
  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])

  const openPath = async (path: string) => {
    setError(null)
    const root = await findRoot(path)
    if (root) onOpen(root)
    else setError(t('{path} is not inside a Git repository.', { path: home(path) }))
  }

  // Folders dropped anywhere on the window.
  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe once; openPath only reads stable setters
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent(e => {
      if (e.payload.type === 'over') setOver(true)
      else if (e.payload.type === 'drop') {
        setOver(false)
        const path = e.payload.paths[0]
        if (path) void openPath(path)
      } else setOver(false)
    })
    return () => void un.then(f => f())
  }, [])

  const pickFolder = async (title: string) => {
    const dir = await open({ directory: true, title })
    return typeof dir === 'string' ? dir : null
  }
  const openRepo = async () => {
    const dir = await pickFolder(t('Open repository'))
    if (dir) await openPath(dir)
  }
  const createRepo = async () => {
    const dir = await pickFolder(t('Choose a folder for the new repository'))
    if (!dir) return
    const out = await run(dir, ['init', '-b', getSettings().defaultBranch])
    if (out.code !== 0) return setError(out.stderr.trim())
    onOpen(dir)
  }
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const map = new Map<string, LocalRepo[]>()
    for (const r of local ?? []) {
      if (q && !r.name.toLowerCase().includes(q) && !r.subject.toLowerCase().includes(q)) continue
      map.set(r.folder, [...(map.get(r.folder) ?? []), r])
    }
    return [...map]
  }, [local, filter])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? recents.filter(r => r.path.toLowerCase().includes(q)) : recents
  }, [recents, filter])

  return (
    <div className="flex h-full">
      <div className="flex w-80 shrink-0 flex-col items-center border-r border-subtle bg-titlebar px-7 pt-13 pb-7" data-tauri-drag-region>
        <img src={appIcon} alt="" className="mt-auto size-32" />
        <h1 className="mt-5 mb-0.5 text-2xl font-bold">{t('Git Graph')}</h1>
        <div className="mb-auto text-sm text-muted">{t('Version {v}', { v: version })}</div>
        <div className="flex w-full flex-col gap-2 [&>button]:h-8.5">
          <Button kind="primary" icon={FolderOpen} onClick={() => void openRepo()}>
            {t('Open repository…')}
          </Button>
          <Button icon={CloudDownload} onClick={() => setCloning(true)}>
            {t('Clone from GitHub…')}
          </Button>
          <Button icon={FolderPlus} onClick={() => void createRepo()}>
            {t('Create new repository')}
          </Button>
        </div>
      </div>
      <div className={cx('flex min-w-0 flex-1 flex-col gap-2.5 px-4.5 pt-11 pb-4', over && 'bg-selected')}>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-md bg-surface p-0.5">
            {(['recent', 'mac'] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => chooseTab(k)}
                className={cx('flex h-6.5 items-center gap-1.5 rounded-sm px-2.5 text-sm', tab === k ? 'bg-elevated font-semibold shadow-[0_1px_2px_var(--shadow)]' : 'text-muted')}
              >
                {k === 'recent' ? t('Recent') : t('On this Mac')}
                {k === 'mac' && local && <span className="rounded-full bg-surface px-1.5 text-xs font-semibold text-muted">{local.length}</span>}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <div className="flex h-7 w-50 items-center gap-1.5 rounded-md bg-surface px-2 text-muted focus-within:ring-1 focus-within:ring-focus">
            <Search size={13} />
            <input
              className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-faint"
              placeholder={t('Filter')}
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {tab === 'recent' && (
            <>
              {shown.map(r => (
                <button
                  key={r.path}
                  type="button"
                  className="group flex h-12 w-full shrink-0 items-center gap-3 rounded-lg px-3 text-left hover:bg-selected"
                  onClick={() => void openPath(r.path)}
                >
                  <span className="flex size-7.5 shrink-0 items-center justify-center rounded-md bg-surface text-secondary">
                    <FolderGit2 size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{r.path.split('/').pop()}</span>
                    <span className="block truncate text-sm text-muted">{home(r.path)}</span>
                  </span>
                  {r.branch && <Chip kind="local" name={r.branch} />}
                  <span className="w-10 text-right text-sm text-muted">{ago(r.at)}</span>
                  <X
                    size={14}
                    className="hidden shrink-0 text-muted group-hover:block"
                    onClick={e => {
                      e.stopPropagation()
                      forgetRepo(r.path)
                      setRecents(readRecents())
                    }}
                  />
                </button>
              ))}
              {!shown.length && <Empty>{recents.length ? t('No recent repository matches.') : t('Repositories you open show up here.')}</Empty>}
            </>
          )}
          {tab === 'mac' && (
            <>
              {local === null && (
                <Empty>
                  {t('Looking for repositories…')}
                  {slow && (
                    <div className="mt-1.5 max-w-90 text-sm text-faint">{t('If macOS asks whether Git Graph may open files in a folder, allow it so the scan can finish.')}</div>
                  )}
                </Empty>
              )}
              {local && !folders.length && (
                <Empty>
                  {t('No code folders found yet.')}
                  <Button icon={FolderPlus} onClick={() => setSettingsOpen(true)}>
                    {t('Add a folder…')}
                  </Button>
                </Empty>
              )}
              {groups.map(([folder, repos]) => (
                <div key={folder} className="flex flex-col gap-0.5">
                  <div className="flex h-7 shrink-0 items-center gap-1.5 pr-1 pl-3 text-sm">
                    <Folder size={13} className="text-muted" />
                    <span className="font-semibold text-secondary">{home(folder)}</span>
                    <span className="text-muted">· {repos.length}</span>
                    <span className="flex-1" />
                    <IconButton icon={RefreshCcw} small size={13} title={t('Scan again')} onClick={() => void rescan()} />
                  </div>
                  {repos.map(r => (
                    <button
                      key={r.path}
                      type="button"
                      className="flex h-12 w-full shrink-0 items-center gap-3 rounded-lg px-3 text-left hover:bg-selected"
                      onClick={() => void openPath(r.path)}
                      title={r.path}
                    >
                      <span className="flex size-7.5 shrink-0 items-center justify-center rounded-md bg-surface text-secondary">
                        <FolderGit2 size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{r.name}</span>
                        <span className="block truncate text-sm text-muted">{r.subject || home(r.path)}</span>
                      </span>
                      {r.branch && <Chip kind="local" name={r.branch} />}
                      {r.changes > 0 && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-sm bg-diff-hunk-bg px-1.5 py-0.5 text-xs font-semibold text-status-modified"
                          title={t('{n} uncommitted changes', { n: r.changes })}
                        >
                          <span className="size-1.5 rounded-full bg-status-modified" />
                          {r.changes}
                        </span>
                      )}
                      {r.ahead > 0 && <span className="text-sm font-medium text-ref-head">↑{r.ahead}</span>}
                      {r.behind > 0 && <span className="text-sm font-medium text-status-deleted">↓{r.behind}</span>}
                      <span className="w-10 shrink-0 text-right text-sm text-muted">{r.time ? ago(r.time * 1000) : ''}</span>
                    </button>
                  ))}
                </div>
              ))}
              {local && folders.length > 0 && !groups.length && <Empty>{t('No repository matches.')}</Empty>}
            </>
          )}
        </div>
        {error && <div className="text-sm text-status-deleted">{error}</div>}
        <div className="flex shrink-0 items-center gap-1.5 border-t border-subtle px-1 pt-2 text-sm text-muted">
          <ScanSearch size={13} />
          {tab === 'mac' ? (
            <span>
              {t(folders.length === 1 ? 'Found in {n} folder, up to {depth} levels deep.' : 'Found in {n} folders, up to {depth} levels deep.', {
                n: folders.length,
                depth: SCAN_DEPTH,
              })}
            </span>
          ) : (
            <span>{t('Drop a folder here, or run git-graph . in a terminal')}</span>
          )}
          <button type="button" className="font-medium text-link hover:underline" onClick={() => setSettingsOpen(true)}>
            {t('Manage folders…')}
          </button>
        </div>
      </div>
      {settingsOpen && (
        <SettingsDialog
          onClose={() => {
            setSettingsOpen(false)
            void rescan()
          }}
        />
      )}
      {cloning && (
        <CloneDialog
          onClose={() => setCloning(false)}
          onCloned={path => {
            setCloning(false)
            onOpen(path)
          }}
        />
      )}
    </div>
  )
}
