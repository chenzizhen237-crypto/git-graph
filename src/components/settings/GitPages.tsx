/** Git, Commits & Graph, External Tools, Network, GitHub and Diff pages of Settings. */
import { invoke } from '@tauri-apps/api/core'
import { homeDir } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { CircleCheck, CircleX, FolderOpen, Loader2, PlugZap, SquareTerminal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { formatDate } from '../../lib/dates'
import { openTerminal } from '../../lib/git'
import { timeAgo, useT } from '../../lib/i18n'
import { testConnection, updateSettings, useSettings } from '../../lib/settings'
import { type Editor, editors, getGlobal, gitTools, setGlobal, TOOL_NAMES } from '../../lib/tools'
import { Button } from '../ui'
import { Check, NumberField, Row, Section, Select, TextArea, TextField } from './controls'

const TERMINALS = ['Terminal', 'iTerm', 'Ghostty', 'Warp', 'kitty', 'Alacritty']

/** `~/…` for paths under the home folder, as the fields show them. */
async function tildify(path: string) {
  const home = (await homeDir()).replace(/\/$/, '')
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

/** Global git settings: read from ~/.gitconfig on open, written back as you change them. */
function useGlobalConfig(keys: string[]) {
  const [values, setValues] = useState<Record<string, string> | null>(null)
  const key = keys.join()
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the joined key list
  useEffect(() => {
    void Promise.all(keys.map(async k => [k, await getGlobal(k)] as const)).then(e => setValues(Object.fromEntries(e)))
  }, [key])
  const set = async (k: string, v: string) => {
    setValues(vs => ({ ...vs, [k]: v }))
    await setGlobal(k, v)
  }
  return [values, set] as const
}

const SIGNING = ['user.name', 'user.email', 'commit.gpgsign', 'tag.gpgsign', 'gpg.format', 'user.signingkey']

export function GitPage() {
  const t = useT()
  const autoStash = useSettings(s => s.autoStash)
  const cloneDir = useSettings(s => s.cloneDir)
  const [c, set] = useGlobalConfig(SIGNING)
  const [error, setError] = useState('')
  const save = (k: string, v: string) => void set(k, v).catch(e => setError(String(e)))
  const chooseKey = async () => {
    const file = await open({ title: t('Choose a signing key'), defaultPath: `${await homeDir()}/.ssh` })
    if (typeof file === 'string') save('user.signingkey', await tildify(file))
  }
  const chooseCloneDir = async () => {
    const dir = await open({ directory: true, title: t('Clone repositories into') })
    if (typeof dir === 'string') updateSettings({ cloneDir: await tildify(dir) })
  }
  if (!c) return <Loader2 size={15} className="animate-spin text-muted" />
  const format = c['gpg.format'] || 'openpgp'
  return (
    <>
      <Section>{t('Identity')}</Section>
      <Row label={t('Name')}>
        <TextField value={c['user.name'] ?? ''} placeholder="Your Name" onCommit={v => save('user.name', v)} />
      </Row>
      <Row label={t('Email')} help={t('Saved in ~/.gitconfig. Repositories that set their own keep it.')} warn={error || undefined}>
        <TextField value={c['user.email'] ?? ''} placeholder="you@example.com" onCommit={v => save('user.email', v)} />
      </Row>
      <Section>{t('Commit signing')}</Section>
      <Row label={t('Sign by default')}>
        <div className="flex flex-col gap-2.5">
          <Check checked={c['commit.gpgsign'] === 'true'} onChange={v => save('commit.gpgsign', v ? 'true' : '')}>
            {t('Commits')}
          </Check>
          <Check checked={c['tag.gpgsign'] === 'true'} onChange={v => save('tag.gpgsign', v ? 'true' : '')}>
            {t('Tags')}
          </Check>
        </div>
      </Row>
      <Row label={t('Format')}>
        <Select
          width="w-35"
          value={format}
          options={[
            { value: 'openpgp', label: 'GPG' },
            { value: 'ssh', label: 'SSH' },
            { value: 'x509', label: 'X.509' },
          ]}
          onChange={v => save('gpg.format', v === 'openpgp' ? '' : v)}
        />
      </Row>
      <Row label={t('Signing key')} help={t('Signed commits show a Verified badge in the commit details.')}>
        <TextField value={c['user.signingkey'] ?? ''} mono placeholder={format === 'ssh' ? '~/.ssh/id_ed25519.pub' : t('Key ID')} onCommit={v => save('user.signingkey', v)} />
        {format === 'ssh' && (
          <Button icon={FolderOpen} onClick={() => void chooseKey()}>
            {t('Choose…')}
          </Button>
        )}
      </Row>
      <Section>{t('Branches')}</Section>
      <Row label={t('Uncommitted changes')}>
        <Check checked={autoStash} onChange={v => updateSettings({ autoStash: v })}>
          {t('Stash and reapply them when switching branches or pulling')}
        </Check>
      </Row>
      <Row label={t('Clone into')} help={t('Where Clone from GitHub puts new repositories. Empty asks each time.')}>
        <TextField value={cloneDir} mono placeholder={t('Ask each time')} onCommit={v => updateSettings({ cloneDir: v })} />
        <Button icon={FolderOpen} onClick={() => void chooseCloneDir()}>
          {t('Choose…')}
        </Button>
      </Row>
    </>
  )
}

export function CommitsGraph() {
  const t = useT()
  const g = useSettings(s => s.graph)
  const c = useSettings(s => s.commit)
  const setG = (patch: Partial<typeof g>) => updateSettings({ graph: { ...g, ...patch } })
  const setC = (patch: Partial<typeof c>) => updateSettings({ commit: { ...c, ...patch } })
  const sample = new Date(Date.now() - 3 * 3600_000)
  return (
    <>
      <Section>{t('Graph')}</Section>
      <Row label={t('Columns')}>
        <div className="flex flex-col gap-2.5">
          <Check checked={g.author} onChange={author => setG({ author })}>
            {t('Author')}
          </Check>
          <Check checked={g.date} onChange={date => setG({ date })}>
            {t('Date')}
          </Check>
          <Check checked={g.sha} onChange={sha => setG({ sha })}>
            SHA
          </Check>
          <Check checked={g.ci} onChange={ci => setG({ ci })}>
            {t('CI status')}
          </Check>
          <Check checked={g.tags} onChange={tags => setG({ tags })}>
            {t('Tags on commits')}
          </Check>
        </div>
      </Row>
      <Row label={t('Dates')}>
        <Select
          width="w-55"
          value={g.dates}
          options={[
            { value: 'relative', label: t('Relative — {example}', { example: timeAgo(sample.getTime()) }) },
            { value: 'absolute', label: t('Absolute') },
          ]}
          onChange={dates => setG({ dates })}
        />
        <Select
          width="w-50"
          value={g.dateFormat}
          options={(['locale', 'iso', 'dmy', 'mdy'] as const).map(f => ({ value: f, label: formatDate(sample.getTime(), { ...g, dateFormat: f }) }))}
          onChange={dateFormat => setG({ dateFormat })}
        />
      </Row>
      <Row>
        <Check checked={g.hour24} onChange={hour24 => setG({ hour24 })}>
          {t('24-hour clock')}
        </Check>
      </Row>
      <Section>{t('Commit message')}</Section>
      <Row label={t('Subject guide')} help={t('The counter turns amber past this length. 0 turns it off.')}>
        <NumberField value={c.subjectGuide} min={0} max={200} suffix={t('chars')} onChange={subjectGuide => setC({ subjectGuide })} />
      </Row>
      <Row label={t('Template')} help={t('Fills an empty message box. Empty uses git’s commit.template.')}>
        <TextArea value={c.template} placeholder={'feat: \n\nRefs #'} onCommit={template => setC({ template })} />
      </Row>
      <Row label={t('Hooks')}>
        <Check checked={c.skipHooks} onChange={skipHooks => setC({ skipHooks })}>
          {t('Skip hooks by default (--no-verify)')}
        </Check>
      </Row>
    </>
  )
}

export function ExternalTools() {
  const t = useT()
  const tools = useSettings(s => s.tools)
  const terminal = useSettings(s => s.terminal)
  const [eds, setEds] = useState<Editor[]>([])
  const [diffs, setDiffs] = useState<string[]>([])
  const [merges, setMerges] = useState<string[]>([])
  useEffect(() => {
    void editors().then(setEds)
    void gitTools('difftool').then(setDiffs)
    void gitTools('mergetool').then(setMerges)
  }, [])
  const set = (patch: Partial<typeof tools>) => updateSettings({ tools: { ...tools, ...patch } })
  const toolOptions = (list: string[], current: string) => [
    { value: '', label: t('Git default') },
    ...(current && !list.includes(current) ? [current] : []).concat(list).map(n => ({ value: n, label: TOOL_NAMES[n] ?? n })),
  ]
  const isMac = navigator.userAgent.includes('Mac')
  return (
    <>
      <Row
        label={t('Editor')}
        help={
          eds.length
            ? t('Open in editor on files and repositories. Found here: {list}.', { list: eds.map(e => e.name).join(', ') })
            : t('Open in editor on files and repositories.')
        }
      >
        <Select
          width="w-65"
          value={tools.editor}
          options={[{ value: '', label: t('System default') }, ...eds.map(e => ({ value: e.id, label: e.name }))]}
          onChange={editor => set({ editor })}
        />
      </Row>
      <Row label={t('Diff tool')} help={t('Open in diff tool on changed files.')}>
        <Select width="w-65" value={tools.diffTool} options={toolOptions(diffs, tools.diffTool)} onChange={diffTool => set({ diffTool })} />
      </Row>
      <Row label={t('Merge tool')} help={t('Open in merge tool on conflicted files. Git default uses your merge.tool setting.')}>
        <Select width="w-65" value={tools.mergeTool} options={toolOptions(merges, tools.mergeTool)} onChange={mergeTool => set({ mergeTool })} />
      </Row>
      {isMac && (
        <Row label={t('Terminal')} help={t('Used by Open in external terminal; the Terminal button opens the panel inside Git Graph.')}>
          <Select width="w-65" value={terminal} options={TERMINALS.map(v => ({ value: v, label: v }))} onChange={v => updateSettings({ terminal: v })} />
        </Row>
      )}
    </>
  )
}

export function Network() {
  const t = useT()
  const p = useSettings(s => s.proxy)
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

export function GitHubAccount() {
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

export function DiffEditor() {
  const t = useT()
  const diffMode = useSettings(s => s.diffMode)
  const diffWrap = useSettings(s => s.diffWrap)
  const diffWhitespace = useSettings(s => s.diffWhitespace)
  return (
    <>
      <Row label={t('Diff view')} help={t('Narrow panels switch to unified automatically.')}>
        <Select
          value={diffMode}
          options={[
            { value: 'unified', label: t('Unified') },
            { value: 'split', label: t('Side by side') },
          ]}
          onChange={v => updateSettings({ diffMode: v })}
        />
      </Row>
      <Row label={t('Wrap lines')}>
        <Check checked={diffWrap} onChange={v => updateSettings({ diffWrap: v })}>
          {t('Wrap long lines in diffs')}
        </Check>
      </Row>
      <Row label={t('Whitespace')} help={t('Show all, ignore changes at line ends (including CR), or ignore all whitespace changes.')}>
        <Select
          value={diffWhitespace}
          options={[
            { value: 'all', label: t('Show all changes') },
            { value: 'eol', label: t('Ignore at line ends') },
            { value: 'ignore', label: t('Ignore all whitespace') },
          ]}
          onChange={v => updateSettings({ diffWhitespace: v })}
        />
      </Row>
    </>
  )
}
