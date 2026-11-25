/** General, Appearance, Fonts, Notifications, Shortcuts and About pages of Settings. */
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { homeDir } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { BellRing, Folder, FolderPlus, GitPullRequest, RefreshCcw, RotateCcw, Volume2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { cx } from '../../lib/cx'
import { openUrl } from '../../lib/github'
import { useT } from '../../lib/i18n'
import { repoFolders as suggestedFolders, SCAN_DEPTH, scanRepos } from '../../lib/local'
import { notify } from '../../lib/notify'
import { DEFAULT_FONTS, type Fonts as FontSettings, updateSettings, useSettings, ZOOMS } from '../../lib/settings'
import { playSound } from '../../lib/sound'
import { Button, IconButton, Kbd } from '../ui'
import { UpdateButton } from '../Update'
import { Check, NumberField, Row, Select, TextField } from './controls'

export const REPO_URL = 'https://github.com/chenzizhen237-crypto/git-graph'

/** Settings/Row "Repository folders": where the Welcome screen looks for repositories. */
function RepoFolders() {
  const t = useT()
  const repoFolders = useSettings(s => s.repoFolders)
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
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium" title={f}>
                {f}
              </span>
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

export function General() {
  const t = useT()
  const s = useSettings()
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
    </>
  )
}

export function Appearance() {
  const t = useT()
  const theme = useSettings(s => s.theme)
  const language = useSettings(s => s.language)
  return (
    <>
      <Row label={t('Theme')} help={t('Light, dark, or follow the system setting.')}>
        <Select
          value={theme}
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
          value={language}
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

type Family = { name: string; mono: boolean }
let families: Promise<Family[]> | null = null
const systemFonts = () => (families ??= invoke<Family[]>('system_fonts').catch(() => []))

export function Fonts() {
  const t = useT()
  const f = useSettings(s => s.fonts)
  const [all, setAll] = useState<Family[]>([])
  useEffect(() => {
    void systemFonts().then(setAll)
  }, [])
  const set = (patch: Partial<FontSettings>) => updateSettings({ fonts: { ...f, ...patch } })
  const options = (list: Family[], current: string) => [
    { value: '', label: t('Default') },
    // Keep a saved family listed even if it is not installed any more.
    ...(current && !list.some(x => x.name === current) ? [{ value: current, label: current }] : []),
    ...list.map(x => ({ value: x.name, label: x.name })),
  ]
  const isMac = navigator.userAgent.includes('Mac')
  return (
    <>
      <Row label={t('Interface font')} help={t('Used for menus, lists and labels. Chinese text falls back to the system Chinese font.')}>
        <Select width="w-65" value={f.ui} font={f.ui || undefined} options={options(all, f.ui)} onChange={ui => set({ ui })} />
        <NumberField value={f.uiSize} min={11} max={16} suffix="px" onChange={uiSize => set({ uiSize })} />
      </Row>
      <Row label={t('Code font')}>
        <Select
          width="w-65"
          value={f.mono}
          font={f.mono ? `"${f.mono}", var(--mono)` : 'var(--mono)'}
          options={options(f.monoOnly ? all.filter(x => x.mono) : all, f.mono)}
          onChange={mono => set({ mono })}
        />
        <NumberField value={f.monoSize} min={9} max={20} suffix="px" onChange={monoSize => set({ monoSize })} />
      </Row>
      <Row help={t('Used for hashes, diffs, logs and paths.')}>
        <Check checked={f.monoOnly} onChange={monoOnly => set({ monoOnly })}>
          {t('Show only monospace fonts')}
        </Check>
        <Check checked={f.ligatures} onChange={ligatures => set({ ligatures })}>
          {t('Ligatures')}
        </Check>
      </Row>
      <Row label={t('Tab width')}>
        <NumberField value={f.tabWidth} min={1} max={8} suffix={t('spaces')} onChange={tabWidth => set({ tabWidth })} />
      </Row>
      <Row label={t('Zoom')}>
        <Select width="w-30" value={String(f.zoom)} options={ZOOMS.map(z => ({ value: String(z), label: `${Math.round(z * 100)}%` }))} onChange={z => set({ zoom: Number(z) })} />
        <span className="text-sm text-muted">{isMac ? '⌘+  ⌘−  ⌘0' : 'Ctrl +  Ctrl −  Ctrl 0'}</span>
      </Row>
      <Row label={t('Preview')}>
        <div className="w-115 overflow-hidden rounded-md border border-strong bg-app">
          <div className="flex h-8.5 items-center gap-2.5 border-b border-subtle px-3">
            <span className="size-2.25 shrink-0 rounded-full bg-ref-head" />
            <span className="min-w-0 flex-1 truncate font-medium">{t('Add a Fonts page to Settings')}</span>
            <span className="font-mono text-sm text-muted">3f2a9c1</span>
          </div>
          <div className="py-1.5 font-mono text-code leading-[1.6] whitespace-pre select-text">
            <div className="px-3 text-secondary">{'  const size = settings.codeFontSize'}</div>
            <div className="bg-diff-del-bg px-3 text-status-deleted">{'- if (size != 12) return null'}</div>
            <div className="bg-diff-add-bg px-3 text-status-added">{'+ if (size !== 12) return () => size >= 10'}</div>
            <div className="px-3 text-secondary">{'\treturn size'}</div>
          </div>
        </div>
      </Row>
      <Row>
        <Button icon={RotateCcw} onClick={() => updateSettings({ fonts: DEFAULT_FONTS })}>
          {t('Reset to defaults')}
        </Button>
      </Row>
    </>
  )
}

export function Notifications() {
  const t = useT()
  const n = useSettings(s => s.notify)
  const set = (patch: Partial<typeof n>) => updateSettings({ notify: { ...n, ...patch } })
  return (
    <>
      <Row label={t('Desktop notifications')}>
        <Check checked={n.enabled} onChange={enabled => set({ enabled })}>
          {t('Allow Git Graph to show notifications')}
        </Check>
        <Button icon={BellRing} onClick={() => void notify('test', t('Notifications are working'), 'Git Graph')}>
          {t('Send test')}
        </Button>
      </Row>
      <Row label={t('Notify me when')}>
        <div className={cx('flex flex-col gap-2.5', !n.enabled && 'pointer-events-none opacity-50')}>
          <Check checked={n.ci} onChange={ci => set({ ci })}>
            {t('A CI run on my branch finishes')}
          </Check>
          <Check checked={n.fetch} onChange={fetch => set({ fetch })}>
            {t('Fetching brings new commits')}
          </Check>
          <Check checked={n.long} onChange={long => set({ long })}>
            {t('A long push, pull or clone finishes')}
          </Check>
        </div>
      </Row>
      <Row help={t('CI is checked every minute while a repository is open.')}>
        <Check checked={n.backgroundOnly} onChange={backgroundOnly => set({ backgroundOnly })}>
          {t('Only while Git Graph is in the background')}
        </Check>
      </Row>
      <Row label={t('Sound')} help={t('A soft chime for successes and news, a lower tone for errors.')}>
        <Check checked={n.sound} onChange={sound => set({ sound })}>
          {t('Play a sound with notifications and notices')}
        </Check>
        <Button icon={Volume2} onClick={() => playSound('ok', true)}>
          {t('Play')}
        </Button>
      </Row>
      <Row label={t('Updates')}>
        <Check checked={n.updates} onChange={updates => set({ updates })}>
          {t('Check for a new version on startup and show a notice')}
        </Check>
      </Row>
    </>
  )
}

const KEYS: [string, string][] = [
  ['⌘K', 'Command palette'],
  ['⌘1 · ⌘2 · ⌘3 · ⌘4 · ⌘5', 'History · Changes · Stashes · Pull requests · Actions'],
  ['⌘,', 'Settings'],
  ['⌘\\', 'Show or hide the sidebar'],
  ['⇧⌘\\', 'Show or hide the details'],
  ['⌘+ · ⌘− · ⌘0', 'Zoom in · Zoom out · Actual size'],
  ['⌘R', 'Refresh'],
  ['⌘O', 'Switch repository'],
  ['⌘⇧F · ⌘⇧P', 'Fetch · Push'],
  ['↑ ↓ · j k', 'Move through commits'],
  ['⌘↩', 'Commit'],
  ['esc', 'Close a dialog or pop-out'],
]

export function Shortcuts() {
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

export function About() {
  const t = useT()
  const n = useSettings(s => s.notify)
  return (
    <>
      <Row label={t('Version')}>
        <About.Version plain />
      </Row>
      <Row label={t('Updates')}>
        <UpdateButton />
      </Row>
      <Row>
        <Check checked={n.updates} onChange={updates => updateSettings({ notify: { ...n, updates } })}>
          {t('Check for a new version on startup and show a notice')}
        </Check>
      </Row>
      <Row label={t('Source')} help={t('Open source under the MIT license.')}>
        <Button icon={GitPullRequest} onClick={() => void openUrl(REPO_URL)}>
          chenzizhen237-crypto/git-graph
        </Button>
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
