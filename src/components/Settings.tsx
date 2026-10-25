/**
 * The Settings dialog (Nib: Desktop 08–10): a category list on the left and,
 * on the right, rows of right-aligned labels with their controls and help.
 * Changes apply at once and are remembered.
 */
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { homeDir } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import {
  ChevronsUpDown,
  CircleCheck,
  CircleX,
  FileDiff,
  Folder,
  FolderPlus,
  Settings as Gear,
  GitPullRequest,
  Globe,
  Info,
  Keyboard,
  Loader2,
  type LucideIcon,
  Palette,
  PlugZap,
  RefreshCcw,
  SquareTerminal,
  TriangleAlert,
  X,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { cx } from '../lib/cx'
import { repoFolders as suggestedFolders, SCAN_DEPTH, scanRepos } from '../lib/local'
import { openTerminal } from '../lib/git'
import { openUrl } from '../lib/github'
import { useT } from '../lib/i18n'
import { testConnection, updateSettings, useSettings } from '../lib/settings'
import { Button, IconButton, Kbd } from './ui'

type Section = 'general' | 'appearance' | 'network' | 'github' | 'diff' | 'keys' | 'about'

const SECTIONS: { id: Section; icon: LucideIcon; label: string }[] = [
  { id: 'general', icon: Gear, label: 'General' },
  { id: 'appearance', icon: Palette, label: 'Appearance' },
  { id: 'network', icon: Globe, label: 'Network' },
  { id: 'github', icon: GitPullRequest, label: 'GitHub' },
  { id: 'diff', icon: FileDiff, label: 'Diff & editor' },
  { id: 'keys', icon: Keyboard, label: 'Shortcuts' },
  { id: 'about', icon: Info, label: 'About' },
]

export const REPO_URL = 'https://github.com/chenzizhen237-crypto/git-graph'

const field = 'h-7.5 rounded-md border border-strong bg-app px-2.5 outline-none focus:border-focus focus:ring-1 focus:ring-focus disabled:opacity-50'

/** Settings/Row: right-aligned label, the control, then help and an optional warning. */
function Row({ label, children, help, warn }: { label?: string; children: ReactNode; help?: ReactNode; warn?: string }) {
  return (
    <div className="flex gap-6">
      <div className="w-50 shrink-0 pt-1.5 text-right font-medium">{label}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-h-7.5 flex-wrap items-center gap-2.5">{children}</div>
        {help && <div className="max-w-130 text-sm leading-normal text-muted">{help}</div>}
        {warn && (
          <div className="flex max-w-130 gap-1.5 text-sm leading-normal text-muted">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-status-modified" />
            {warn}
          </div>
        )}
      </div>
    </div>
  )
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2.5 text-secondary">
      <input type="checkbox" className="m-0 size-4 accent-accent" checked={checked} onChange={e => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

function Select<T extends string>({ value, options, onChange, width = 'w-75' }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; width?: string }) {
  return (
    <div className={cx('relative', width)}>
      <select className={cx(field, 'w-full appearance-none pr-8')} value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown size={14} className="pointer-events-none absolute top-2 right-2 text-muted" />
    </div>
  )
}

function NumberField({ value, min, max, suffix, onChange }: { value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div className={cx(field, 'flex w-35 items-center gap-2 focus-within:border-focus focus-within:ring-1 focus-within:ring-focus')}>
      <input
        type="number"
        className="w-full min-w-0 bg-transparent outline-none"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
        }}
      />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  )
}

/** Text that saves when you leave the field or press Enter, not on every key. */
function TextField({ value, placeholder, onCommit, width = 'w-75', mono }: { value: string; placeholder?: string; onCommit: (v: string) => void; width?: string; mono?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className={cx(field, width, mono && 'font-mono text-sm')}
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v.trim())}
      onKeyDown={e => e.key === 'Enter' && onCommit(v.trim())}
    />
  )
}

export function SettingsDialog({ onClose, initial = 'general' }: { onClose: () => void; initial?: Section }) {
  const t = useT()
  const [section, setSection] = useState<Section>(initial)
  const title = SECTIONS.find(s => s.id === section)!.label

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t('Settings')}
        className="flex h-165 max-h-[calc(100vh-48px)] w-245 max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-strong bg-app shadow-[0_24px_60px_var(--shadow)]"
        onMouseDown={e => e.stopPropagation()}
      >
        <nav className="flex w-60 shrink-0 flex-col gap-0.5 border-r border-subtle bg-sidebar px-3 py-4">
          <div className="mb-1.5 text-[11px] font-bold tracking-[0.7px] text-muted">{t('Settings')}</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cx('flex h-8.5 items-center gap-2.5 rounded-md px-3 text-left font-medium', section === s.id ? 'bg-selected font-semibold' : 'hover:bg-hover')}
            >
              <s.icon size={16} className={section === s.id ? 'text-ref-head' : 'text-secondary'} />
              {t(s.label)}
            </button>
          ))}
          <span className="flex-1" />
          <About.Version />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pt-6.5 pb-8">
          <div className="mb-5.5 flex items-center">
            <h2 className="m-0 flex-1 text-2xl font-bold">{t(title)}</h2>
            <IconButton icon={X} onClick={onClose} title={t('Close (esc)')} />
          </div>
          <div className="flex flex-col gap-5.5">
            {section === 'general' && <General />}
            {section === 'appearance' && <Appearance />}
            {section === 'network' && <Network />}
            {section === 'github' && <GitHubAccount />}
            {section === 'diff' && <DiffEditor />}
            {section === 'keys' && <Shortcuts />}
            {section === 'about' && <About />}
          </div>
        </div>
      </div>
    </div>
  )
}

const TERMINALS = ['Terminal', 'iTerm', 'Ghostty', 'Warp', 'kitty', 'Alacritty']

/** Settings/Row "Repository folders": where the Welcome screen looks for repositories. */
function RepoFolders() {
  const t = useT()
  const { repoFolders } = useSettings()
  const [counts, setCounts] = useState<Record<string, number | undefined>>({})
  const folders = repoFolders ?? []

  const count = useCallback(async (list: string[]) => {
    const entries = await Promise.all(list.map(async f => [f, (await scanRepos([f])).length] as const))
    setCounts(Object.fromEntries(entries))
  }, [])
  // First visit: fill in the usual code folders that exist here.
  useEffect(() => {
    void suggestedFolders().then(count)
  }, [count])

  const add = async () => {
    const dir = await open({ directory: true, title: t('Add a folder with repositories') })
    if (typeof dir !== 'string') return
    const home = (await homeDir()).replace(/\/$/, '')
    const pretty = dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir
    if (folders.includes(pretty)) return
    const next = [...folders, pretty]
    updateSettings({ repoFolders: next })
    void count(next)
  }
  const remove = (f: string) => updateSettings({ repoFolders: folders.filter(x => x !== f) })

  return (
    <Row
      label={t('Repository folders')}
      help={t('Git Graph lists the repositories it finds in these folders, up to {depth} levels deep, on the Welcome screen.', { depth: SCAN_DEPTH })}
    >
      <div className="flex w-115 flex-col gap-2">
        <div className="overflow-hidden rounded-md border border-strong bg-app">
          {folders.map(f => (
            <div key={f} className="flex h-8.5 items-center gap-2 border-b border-subtle px-2.5 last:border-b-0">
              <Folder size={14} className="shrink-0 text-secondary" />
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">{f}</span>
              <span className={cx('text-sm', counts[f] ? 'text-muted' : 'text-faint')}>
                {counts[f] === undefined ? '…' : counts[f] ? t(counts[f] === 1 ? '{n} repository' : '{n} repositories', { n: counts[f] }) : t('none yet')}
              </span>
              <IconButton icon={X} small size={13} title={t('Remove')} onClick={() => remove(f)} />
            </div>
          ))}
          {!folders.length && <div className="px-2.5 py-2 text-sm text-muted">{t('No folders yet.')}</div>}
        </div>
        <div className="flex gap-2">
          <Button icon={FolderPlus} onClick={() => void add()}>
            {t('Add folder…')}
          </Button>
          <Button icon={RefreshCcw} onClick={() => void count(folders)}>
            {t('Scan now')}
          </Button>
        </div>
      </div>
    </Row>
  )
}

function General() {
  const t = useT()
  const s = useSettings()
  const isMac = navigator.userAgent.includes('Mac')
  return (
    <>
      <RepoFolders />
      <Row label={t('Auto-fetch interval')} help={t('Fetches every remote in the background. 0 turns it off.')}>
        <NumberField value={s.autoFetchMinutes} min={0} max={60} suffix={t('min')} onChange={v => updateSettings({ autoFetchMinutes: v })} />
      </Row>
      <Row label={t('Prune on fetch')}>
        <Check checked={s.pruneOnFetch} onChange={v => updateSettings({ pruneOnFetch: v })}>
          {t('Remove remote branches that were deleted upstream')}
        </Check>
      </Row>
      <Row
        label={t('Commits loaded at a time')}
        help={t('More load as you scroll the graph.')}
        warn={s.pageSize > 2000 ? t('Large numbers make big repositories slower to open.') : undefined}
      >
        <NumberField value={s.pageSize} min={100} max={10000} onChange={v => updateSettings({ pageSize: v })} />
      </Row>
      <Row label={t('Open last repository')}>
        <Check checked={s.openLastRepo} onChange={v => updateSettings({ openLastRepo: v })}>
          {t('Reopen the repository you used last when the app starts')}
        </Check>
      </Row>
      <Row label={t('Default branch name')} help={t('Used when creating new repositories.')}>
        <TextField value={s.defaultBranch} width="w-50" onCommit={v => updateSettings({ defaultBranch: v || 'main' })} />
      </Row>
      {isMac && (
        <Row label={t('Terminal')} help={t('Opened by the Terminal button in the toolbar.')}>
          <Select value={s.terminal} options={TERMINALS.map(v => ({ value: v, label: v }))} onChange={v => updateSettings({ terminal: v })} />
        </Row>
      )}
    </>
  )
}

function Appearance() {
  const t = useT()
  const s = useSettings()
  return (
    <>
      <Row label={t('Theme')} help={t('Light, dark, or follow the system setting.')}>
        <Select
          value={s.theme}
          options={[
            { value: 'system', label: t('Follow system') },
            { value: 'light', label: t('Light') },
            { value: 'dark', label: t('Dark') },
          ]}
          onChange={v => updateSettings({ theme: v })}
        />
      </Row>
      <Row label={t('Language')} help={t('Takes effect immediately.')}>
        <Select
          value={s.language}
          options={[
            { value: 'en', label: 'English' },
            { value: 'zh', label: '简体中文' },
          ]}
          onChange={v => updateSettings({ language: v })}
        />
      </Row>
    </>
  )
}

function Network() {
  const t = useT()
  const s = useSettings()
  const p = s.proxy
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'fail'; text?: string }>({ state: 'idle' })
  const run = async () => {
    setTest({ state: 'busy' })
    try {
      const ms = await testConnection()
      setTest({ state: 'ok', text: `api.github.com · ${ms} ms` })
    } catch (e) {
      setTest({ state: 'fail', text: e instanceof Error ? e.message : String(e) })
    }
  }
  const custom = p.mode === 'custom'
  return (
    <>
      <Row label={t('Proxy')} help={t('Off, the system proxy, or the address below. Applies to git, the GitHub CLI and pull requests.')}>
        <Select
          value={p.mode}
          options={[
            { value: 'off', label: t('No proxy') },
            { value: 'system', label: t('System proxy') },
            { value: 'custom', label: t('Custom proxy') },
          ]}
          onChange={mode => updateSettings({ proxy: { ...p, mode } })}
        />
      </Row>
      {custom && (
        <>
          <Row label={t('Proxy address')} help={t('http://, https:// or socks5:// — add user:password@ if your proxy needs it.')}>
            <TextField value={p.url} placeholder="http://127.0.0.1:7890" mono onCommit={url => updateSettings({ proxy: { ...p, url } })} />
          </Row>
          <Row label={t('Bypass for')} help={t('Hosts that connect directly, separated by commas.')}>
            <TextField value={p.bypass} mono onCommit={bypass => updateSettings({ proxy: { ...p, bypass } })} />
          </Row>
        </>
      )}
      <Row label={t('Use for')}>
        <div className="flex flex-col gap-2.5">
          <Check checked={p.git} onChange={git => updateSettings({ proxy: { ...p, git } })}>
            {t('Git — fetch, pull, push and clone')}
          </Check>
          <Check checked={p.github} onChange={github => updateSettings({ proxy: { ...p, github } })}>
            {t('GitHub — pull requests and the gh CLI')}
          </Check>
        </div>
      </Row>
      <Row label={t('Connection')} help={t('Checks that GitHub answers through the proxy.')}>
        <Button icon={test.state === 'busy' ? Loader2 : PlugZap} busy={test.state === 'busy'} onClick={() => void run()}>
          {t('Test connection')}
        </Button>
        {test.state === 'ok' && (
          <span className="flex items-center gap-1.5 rounded-md bg-ref-local-soft px-2 py-0.75 text-sm font-medium text-ref-local">
            <CircleCheck size={13} />
            {test.text}
          </span>
        )}
        {test.state === 'fail' && (
          <span className="flex max-w-110 items-start gap-1.5 rounded-md bg-diff-del-bg px-2 py-0.75 text-sm font-medium text-status-deleted">
            <CircleX size={13} className="mt-0.5 shrink-0" />
            {test.text}
          </span>
        )}
      </Row>
    </>
  )
}

function GitHubAccount() {
  const t = useT()
  const [login, setLogin] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')
  const check = () => {
    setLogin(undefined)
    invoke<{ viewer: { login: string } }>('github_graphql', { query: 'query { viewer { login } }', variables: {} })
      .then(d => setLogin(d.viewer.login))
      .catch(e => {
        setLogin(null)
        setError(String(e))
      })
  }
  useEffect(check, [])
  return (
    <>
      <Row label={t('Account')} help={t('Pull requests use your GitHub CLI sign-in. The token stays in the app and is never shown.')}>
        {login === undefined && <Loader2 size={15} className="animate-spin text-muted" />}
        {login && (
          <span className="flex items-center gap-1.5 font-medium">
            <CircleCheck size={15} className="text-status-added" />
            {t('Signed in as {login}', { login })}
          </span>
        )}
        {login === null && (
          <span className="flex max-w-110 items-start gap-1.5 text-status-deleted">
            <CircleX size={15} className="mt-0.5 shrink-0" />
            {error || t('Not signed in')}
          </span>
        )}
        <Button small onClick={check}>
          {t('Check again')}
        </Button>
      </Row>
      <Row label={t('Sign in')} help={t('Run `gh auth login` in a terminal, then check again.')}>
        <Button icon={SquareTerminal} onClick={() => void openTerminal('')}>
          {t('Open Terminal')}
        </Button>
      </Row>
    </>
  )
}

function DiffEditor() {
  const t = useT()
  const s = useSettings()
  return (
    <>
      <Row label={t('Diff view')} help={t('Narrow panels switch to unified automatically.')}>
        <Select
          value={s.diffMode}
          options={[
            { value: 'unified', label: t('Unified') },
            { value: 'split', label: t('Side by side') },
          ]}
          onChange={v => updateSettings({ diffMode: v })}
        />
      </Row>
      <Row label={t('Wrap lines')}>
        <Check checked={s.diffWrap} onChange={v => updateSettings({ diffWrap: v })}>
          {t('Wrap long lines in diffs')}
        </Check>
      </Row>
    </>
  )
}

const KEYS: [string, string][] = [
  ['⌘K', 'Command palette'],
  ['⌘1 · ⌘2 · ⌘3 · ⌘4', 'History · Changes · Stashes · Pull requests'],
  ['⌘,', 'Settings'],
  ['⌘\\', 'Show or hide the sidebar'],
  ['⌘R', 'Refresh'],
  ['⌘O', 'Switch repository'],
  ['⌘⇧F · ⌘⇧P', 'Fetch · Push'],
  ['↑ ↓ · j k', 'Move through commits'],
  ['⌘↩', 'Commit'],
  ['esc', 'Close a dialog or pop-out'],
]

function Shortcuts() {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      {KEYS.map(([k, what]) => (
        <Row key={k} label={t(what)}>
          <Kbd>{k}</Kbd>
        </Row>
      ))}
    </div>
  )
}

function About() {
  const t = useT()
  return (
    <>
      <Row label={t('Version')}>
        <About.Version plain />
      </Row>
      <Row label={t('Source')} help={t('Open source under the MIT license.')}>
        <Button icon={GitPullRequest} onClick={() => void openUrl(REPO_URL)}>
          chenzizhen237-crypto/git-graph
        </Button>
      </Row>
      <Row label={t('Updates')}>
        <Button onClick={() => void openUrl(`${REPO_URL}/releases`)}>{t('Releases on GitHub')}</Button>
      </Row>
    </>
  )
}

About.Version = function Version({ plain }: { plain?: boolean }) {
  const [v, setV] = useState('')
  useEffect(() => {
    void getVersion()
      .then(setV)
      .catch(() => {})
  }, [])
  return <span className={plain ? 'font-mono' : 'text-sm text-faint'}>{plain ? v : `Git Graph ${v}`}</span>
}
