/**
 * Clone from GitHub (Nib: Desktop 13) and Publish to GitHub (Desktop 14):
 * repositories in and out of the user's account through the GitHub CLI.
 */
import { homeDir } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { BookMarked, ChevronsUpDown, CloudDownload, CloudUpload, Folder, FolderOpen, Globe, Loader2, Lock, Search, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { type Account, myAccount, type RemoteRepo, repoActions } from '../lib/actions'
import { cx } from '../lib/cx'
import { byGitHub, cachedLocalRepos, localRepos } from '../lib/local'
import { runGh } from '../lib/github'
import { t, timeAgo } from '../lib/i18n'
import { getSettings } from '../lib/settings'
import { readRecents, useApp } from '../state'
import { Avatar, Button, Empty, IconButton } from './ui'

const field = 'h-7.5 w-full rounded-md border border-strong bg-app px-2.5 outline-none focus:border-focus focus:ring-1 focus:ring-focus'

function Shell({ children, onClose, width }: { children: ReactNode; onClose: () => void; width: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div data-exit className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onMouseDown={onClose}>
      <div
        role="dialog"
        className={cx(
          'flex max-h-[calc(100vh-48px)] animate-dialog-in flex-col overflow-hidden rounded-xl border border-strong bg-elevated shadow-[0_24px_60px_var(--shadow)]',
          width,
        )}
        onMouseDown={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Clone ─────────────────────────────────────────────────────────────────

/** `owner/name` or a GitHub URL typed into the filter, cloned even if it is not in the list. */
function typedRepo(q: string) {
  const m = /^(?:https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(q.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

export function CloneDialog({ onClose, onCloned }: { onClose: () => void; onCloned: (path: string) => void }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState(false)
  const [local, setLocal] = useState(() => byGitHub(cachedLocalRepos() ?? []))

  useEffect(() => {
    // Repositories already on disk open instead of cloning a second copy.
    void localRepos()
      .then(r => setLocal(byGitHub(r)))
      .catch(() => {})
    myAccount()
      .then(setAccount)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
    // Settings → Git → Clone into; else next to the most recent repository, else the home folder.
    const recent = readRecents()[0]?.path
    const chosen = getSettings().cloneDir
    void homeDir().then(h => {
      const home = h.replace(/\/$/, '')
      if (chosen) setParent(chosen.replace(/^~(?=\/|$)/, home))
      else setParent(recent ? recent.slice(0, recent.lastIndexOf('/')) : home)
    })
  }, [])

  const repos = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (account?.repos ?? []).filter(
      r => (!owner || r.nameWithOwner.startsWith(`${owner}/`)) && (!needle || r.nameWithOwner.toLowerCase().includes(needle) || r.description?.toLowerCase().includes(needle)),
    )
  }, [account, q, owner])
  const typed = typedRepo(q)
  const target = pick ?? (typed && !repos.some(r => r.nameWithOwner === typed) ? typed : (repos[0]?.nameWithOwner ?? null))
  const folder = target?.split('/')[1] ?? ''
  const existing = target ? local.get(target.toLowerCase()) : undefined
  const home = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

  const clone = async () => {
    if (existing) return onCloned(existing.path)
    if (!target || !parent) return
    setBusy(true)
    setError(null)
    const out = await runGh(parent, repoActions.clone(target, folder))
    setBusy(false)
    if (out.code !== 0) setError(out.stderr.trim() || out.stdout.trim())
    else onCloned(`${parent}/${folder}`)
  }
  const choose = async () => {
    const dir = await open({ directory: true, title: t('Clone into folder'), defaultPath: parent })
    if (typeof dir === 'string') setParent(dir)
  }

  const row = (r: RemoteRepo | { nameWithOwner: string; typed: true }) => {
    const [o, n] = r.nameWithOwner.split('/')
    const full = 'typed' in r ? null : r
    const on = target === r.nameWithOwner
    return (
      <button
        key={r.nameWithOwner}
        type="button"
        onClick={() => setPick(r.nameWithOwner)}
        onDoubleClick={() => void clone()}
        className={cx('flex h-14 w-full shrink-0 items-center gap-3 rounded-lg px-3 text-left', on ? 'bg-selected' : 'hover:bg-hover')}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface text-secondary">
          {full?.isPrivate ? <Lock size={15} /> : <BookMarked size={15} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5" title={r.nameWithOwner}>
            <span className="min-w-0 truncate">
              <span className="text-muted">{o}/</span>
              <span className="font-semibold">{n}</span>
            </span>
            {full?.isPrivate && <span className="rounded-full border border-strong px-1.5 text-[10px] font-semibold text-muted">{t('Private')}</span>}
            {full?.isFork && <span className="rounded-full border border-strong px-1.5 text-[10px] font-semibold text-muted">{t('Fork')}</span>}
            {local.has(r.nameWithOwner.toLowerCase()) && <span className="rounded-full bg-ref-local-soft px-1.5 text-[10px] font-semibold text-ref-local">{t('On this Mac')}</span>}
          </span>
          <span className="truncate text-sm text-muted" title={full?.description ?? undefined}>
            {full ? full.description || t('No description') : t('Clone {name} from GitHub', { name: r.nameWithOwner })}
          </span>
        </span>
        {full?.primaryLanguage && (
          <span className="flex shrink-0 items-center gap-1.25 text-sm whitespace-nowrap text-secondary">
            <span className="size-2.25 rounded-full" style={{ background: full.primaryLanguage.color ?? 'var(--text-muted)' }} />
            {full.primaryLanguage.name}
          </span>
        )}
        {full?.pushedAt && <span className="w-26 shrink-0 text-right text-sm whitespace-nowrap text-muted">{timeAgo(new Date(full.pushedAt).getTime())}</span>}
      </button>
    )
  }

  return (
    <Shell onClose={onClose} width="h-155 w-190">
      <div className="flex items-center gap-2.5 px-5.5 pt-4.5 pb-3">
        <CloudDownload size={18} className="text-secondary" />
        <h2 className="m-0 flex-1 text-xl font-bold">{t('Clone from GitHub')}</h2>
        <IconButton icon={X} onClick={onClose} title={t('Close (esc)')} />
      </div>
      <div className="flex items-center gap-2.5 px-5.5 pb-3">
        <div className="flex h-7 flex-1 items-center gap-1.5 rounded-md bg-surface px-2 text-muted focus-within:ring-1 focus-within:ring-focus">
          <Search size={13} />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-faint"
            placeholder={t('Filter repositories, or paste owner/name or a URL')}
            value={q}
            onChange={e => {
              setQ(e.target.value)
              setPick(null)
            }}
            onKeyDown={e => e.key === 'Enter' && void clone()}
          />
        </div>
        {account && (
          <>
            <button
              type="button"
              onClick={() => setOwner(null)}
              className={cx('h-7 rounded-md px-2.5 text-sm', owner === null ? 'bg-selected font-semibold text-ref-head' : 'text-secondary hover:bg-hover')}
            >
              {t('All')}
            </button>
            {[account.login, ...account.orgs].map(o => (
              <button
                key={o}
                type="button"
                onClick={() => setOwner(o === owner ? null : o)}
                className={cx(
                  'flex h-7 max-w-45 items-center gap-1.5 rounded-md border px-2 text-sm',
                  owner === o ? 'border-transparent bg-selected font-semibold text-ref-head' : 'border-subtle text-secondary hover:bg-hover',
                )}
              >
                <Avatar name={o} />
                <span className="truncate" title={o}>
                  {o}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto border-t border-subtle p-3 pt-1.5">
        {!account && !error && <Empty>{t('Loading your repositories…')}</Empty>}
        {typed && !repos.some(r => r.nameWithOwner === typed) && row({ nameWithOwner: typed, typed: true })}
        {repos.map(r => row(r))}
        {account && !repos.length && !typed && <Empty>{t('No repositories match.')}</Empty>}
      </div>
      {error && <div className="border-t border-subtle px-5.5 py-2 text-sm whitespace-pre-wrap text-status-deleted">{error}</div>}
      <div className="flex items-center gap-2.5 border-t border-subtle bg-surface px-5.5 py-3.5">
        <span className="font-medium text-secondary">{existing ? t('Already at') : t('Clone into')}</span>
        <div className={cx(field, 'flex min-w-0 flex-1 items-center font-mono text-sm')} title={existing?.path ?? `${parent}/${folder}`}>
          <span className="truncate">{existing ? home(existing.path) : `${home(parent)}/${folder}`}</span>
        </div>
        {!existing && (
          <Button icon={Folder} onClick={() => void choose()}>
            {t('Choose…')}
          </Button>
        )}
        <Button kind="primary" icon={existing ? FolderOpen : CloudDownload} busy={busy} disabled={!target || (!existing && !parent) || busy} onClick={() => void clone()}>
          {existing ? t('Open') : t('Clone')}
        </Button>
      </div>
    </Shell>
  )
}

// ─── Publish ───────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="w-27.5 shrink-0 pt-1.5 text-right font-medium">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function PublishDialog({ onClose }: { onClose: () => void }) {
  const { repo, act } = useApp()
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [owner, setOwner] = useState('')
  const [name, setName] = useState(repo?.name ?? '')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [remote, setRemote] = useState('origin')

  useEffect(() => {
    myAccount()
      .then(a => {
        setAccount(a)
        setOwner(o => o || a.login)
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const publish = async () => {
    const ok = await act('Publish to GitHub', repoActions.publish(owner, name.trim(), visibility, description.trim(), remote.trim() || 'origin'), {
      tool: 'gh',
      done: t('Published {name} to GitHub', { name: `${owner}/${name.trim()}` }),
    })
    if (ok) onClose()
  }

  const option = (v: 'private' | 'public', Icon: typeof Lock, title: string, sub: string) => (
    <button
      type="button"
      onClick={() => setVisibility(v)}
      className={cx('flex w-full gap-2.5 rounded-lg border p-3 text-left', visibility === v ? 'border-focus bg-selected ring-1 ring-focus' : 'border-strong bg-app hover:bg-hover')}
    >
      <span className={cx('mt-0.5 size-4 shrink-0 rounded-full border bg-app', visibility === v ? 'border-[5px] border-accent' : 'border-strong')} />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon size={14} className="text-secondary" />
          {title}
        </span>
        <span className="text-sm text-muted">{sub}</span>
      </span>
    </button>
  )

  return (
    <Shell onClose={onClose} width="w-140">
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-surface text-secondary">
            <CloudUpload size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-xl font-bold">{t('Publish to GitHub')}</h2>
            <div className="text-sm text-muted">
              {t('{name} has no remote yet. This creates the repository and pushes {branch}.', { name: repo?.name ?? '', branch: repo?.branch ?? '' })}
            </div>
          </div>
        </div>
        <Row label={t('Owner')}>
          <div className="relative">
            <select className={cx(field, 'appearance-none pr-8')} value={owner} onChange={e => setOwner(e.target.value)} disabled={!account}>
              {account ? [account.login, ...account.orgs].map(o => <option key={o}>{o}</option>) : <option>{t('Loading…')}</option>}
            </select>
            <ChevronsUpDown size={14} className="pointer-events-none absolute top-2 right-2 text-muted" />
          </div>
        </Row>
        <Row label={t('Name')}>
          <input className={field} value={name} onChange={e => setName(e.target.value)} />
        </Row>
        <Row label={t('Description')}>
          <input className={field} value={description} placeholder={t('Optional')} onChange={e => setDescription(e.target.value)} />
        </Row>
        <Row label={t('Visibility')}>
          <div className="flex flex-col gap-2">
            {option('private', Lock, t('Private'), t('Only you and people you invite can see it.'))}
            {option('public', Globe, t('Public'), t('Anyone on the internet can see it.'))}
          </div>
        </Row>
        <Row label={t('Remote name')}>
          <input className={cx(field, 'w-50 font-mono text-sm')} value={remote} onChange={e => setRemote(e.target.value)} />
        </Row>
        {error && <div className="text-sm whitespace-pre-wrap text-status-deleted">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button kind="primary" icon={account ? CloudUpload : Loader2} disabled={!account || !owner || !name.trim()} onClick={() => void publish()}>
            {t('Publish repository')}
          </Button>
        </div>
      </div>
    </Shell>
  )
}
