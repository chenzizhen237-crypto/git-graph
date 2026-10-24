/** Window/Welcome: open, clone or create a repository, or pick a recent one. */
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import { CloudDownload, FolderDown, FolderGit2, FolderOpen, FolderPlus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import appIcon from '../../assets/icon/app-icon.svg'
import { Button, Chip, Empty } from '../components/ui'
import { cx } from '../lib/cx'
import { findRoot, git, run } from '../lib/git'
import { forgetRepo, readRecents, type Recent } from '../state'

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
  const [busy, setBusy] = useState(false)
  const [cloneUrl, setCloneUrl] = useState<string | null>(null)

  const openPath = async (path: string) => {
    setError(null)
    const root = await findRoot(path)
    if (root) onOpen(root)
    else setError(`${home(path)} is not inside a Git repository.`)
  }

  // Folders dropped anywhere on the window.
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pickFolder = async (title: string) => {
    const dir = await open({ directory: true, title })
    return typeof dir === 'string' ? dir : null
  }
  const openRepo = async () => {
    const dir = await pickFolder('Open repository')
    if (dir) await openPath(dir)
  }
  const createRepo = async () => {
    const dir = await pickFolder('Choose a folder for the new repository')
    if (!dir) return
    const out = await run(dir, ['init'])
    if (out.code !== 0) return setError(out.stderr.trim())
    onOpen(dir)
  }
  const cloneRepo = async (url: string) => {
    if (!url.trim()) return
    const dir = await pickFolder('Clone into folder')
    if (!dir) return
    setCloneUrl(null)
    const name = url.trim().replace(/\.git$/, '').split(/[/:]/).pop() || 'repo'
    setBusy(true)
    setError(null)
    try {
      await git(dir, ['clone', url.trim(), name])
      onOpen(`${dir}/${name}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? recents.filter(r => r.path.toLowerCase().includes(q)) : recents
  }, [recents, filter])

  return (
    <div className="flex h-full">
      <div className="flex w-80 shrink-0 flex-col items-center border-r border-subtle bg-titlebar px-7 pt-13 pb-7" data-tauri-drag-region>
        <img src={appIcon} alt="" className="mt-auto size-32" />
        <h1 className="mt-5 mb-0.5 text-2xl font-bold">Git Graph</h1>
        <div className="mb-auto text-sm text-muted">Version 0.1 · desktop</div>
        <div className="flex w-full flex-col gap-2 [&>button]:h-8.5">
          <Button kind="primary" icon={FolderOpen} onClick={() => void openRepo()}>
            Open repository…
          </Button>
          {cloneUrl === null ? (
            <Button icon={CloudDownload} busy={busy} onClick={() => setCloneUrl('')}>
              Clone from URL…
            </Button>
          ) : (
            <input
              autoFocus
              className="h-8.5 rounded-md border border-focus bg-app px-2.5 ring-1 ring-focus outline-none"
              placeholder="https://github.com/owner/repo.git ↩"
              value={cloneUrl}
              onChange={e => setCloneUrl(e.target.value)}
              onBlur={() => !cloneUrl && setCloneUrl(null)}
              onKeyDown={e => {
                if (e.key === 'Enter') void cloneRepo(cloneUrl)
                if (e.key === 'Escape') setCloneUrl(null)
              }}
            />
          )}
          <Button icon={FolderPlus} onClick={() => void createRepo()}>
            Create new repository
          </Button>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-5 pt-11 pb-5.5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex-1">Recent repositories</span>
          <div className="flex h-7 w-45 items-center gap-1.5 rounded-md bg-surface px-2 text-muted">
            <Search size={13} />
            <input className="min-w-0 flex-1 bg-transparent font-normal text-primary outline-none placeholder:text-faint" placeholder="Filter" value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {shown.map(r => (
            <button key={r.path} type="button" className="group flex h-13 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-selected" onClick={() => void openPath(r.path)}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface text-secondary">
                <FolderGit2 size={16} />
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
          {!shown.length && <Empty>{recents.length ? 'No recent repository matches.' : 'Repositories you open show up here.'}</Empty>}
        </div>
        {error && <div className="text-sm text-status-deleted">{error}</div>}
        <div className={cx('flex h-14 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed text-sm', over ? 'border-focus bg-selected text-primary' : 'border-strong text-muted')}>
          <FolderDown size={15} />
          Drop a folder here, or run <code className="font-mono">git-graph .</code> in a terminal
        </div>
      </div>
    </div>
  )
}
