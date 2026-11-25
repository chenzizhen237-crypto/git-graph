/** Window/Title bar, Banner/Operation, Window/Sidebar and Window/Status bar. */
import { ArrowDown, ArrowUp, Check, GitBranch, Monitor, Moon, Sun, TriangleAlert, X } from 'lucide-react'

import { actions } from '../lib/git'
import { t } from '../lib/i18n'
import { isConflict } from '../lib/parse'
import { type Settings, updateSettings, useSettings } from '../lib/settings'
import { useApp } from '../state'
import { Button, StageDot } from './ui'

export { Sidebar } from './chrome/Sidebar'
export { type RepoSwitch, TitleBar } from './chrome/TitleBar'

export function Banner() {
  const { repo, act, ask } = useApp()
  if (!repo?.operation) return null
  const op = repo.operation
  const conflicts = repo.changes.filter(isConflict).length
  const need = conflicts ? ` — ${t(conflicts === 1 ? '{n} file needs resolving' : '{n} files need resolving', { n: conflicts })}` : ''
  const text = `${repo.operationTitle ?? t(op)}${need}`
  const abort = async () => {
    if (
      await ask({
        title: t('Abort {op}?', { op: t(op) }),
        text: t('Your work tree goes back to how it was before it started.'),
        confirm: t('Abort {op}', { op: t(op) }),
        danger: true,
      })
    )
      await act(t('Abort {op}', { op: t(op) }), actions.abort(op), { done: t('{op} aborted', { op: t(op) }) })
  }
  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-subtle bg-stage-banner-bg px-4 font-medium text-stage-banner-fg">
      <TriangleAlert size={15} />
      <span className="flex-1 truncate" title={text}>
        {text}
      </span>
      <Button small icon={X} onClick={() => void abort()}>
        Abort {op}
      </Button>
      <Button small kind="primary" icon={Check} disabled={conflicts > 0} onClick={() => void act(t('Continue {op}', { op: t(op) }), actions.continue(op))}>
        {t('Continue')}
      </Button>
    </div>
  )
}

type ThemePref = Settings['theme']
const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon }

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return t('{s} min ago', { s: Math.round(s / 60) })
  return t('{s} h ago', { s: Math.round(s / 3600) })
}

export function StatusBar() {
  const { repo, stage, lastFetch, refresh } = useApp()
  const theme = useSettings(s => s.theme)
  const shell = 'flex h-statusbar shrink-0 items-center gap-3.5 border-t border-subtle bg-titlebar px-3 text-sm text-muted'
  if (!repo) return <footer className={shell} />
  const conflicts = repo.changes.filter(isConflict).length
  const label =
    stage === 'Rebasing'
      ? t('Rebasing {step}', { step: repo.operationStep ?? '' }).trim()
      : stage === 'Conflict'
        ? conflicts
          ? t(conflicts === 1 ? '{n} conflict' : '{n} conflicts', { n: conflicts })
          : t('{operation} in progress', { operation: t(repo.operation ?? '') })
        : stage === 'Working'
          ? t(repo.changes.length === 1 ? '{n} uncommitted change' : '{n} uncommitted changes', { n: repo.changes.length })
          : t('Up to date')
  const ThemeIcon = THEME_ICON[theme]
  return (
    <footer className={shell}>
      <span className="flex items-center gap-1.5 font-medium text-secondary">
        <StageDot />
        {label}
      </span>
      <span className="flex items-center gap-1.25">
        <GitBranch size={12} />
        <span className="font-medium text-secondary">{repo.branch}</span>
        {repo.upstream && <span>→ {repo.upstream}</span>}
      </span>
      {repo.upstream && (
        <span className="flex items-center gap-1">
          <ArrowUp size={12} />
          {repo.ahead}
          <ArrowDown size={12} />
          {repo.behind}
        </span>
      )}
      {lastFetch && <span>Fetched {ago(lastFetch)}</span>}
      <span className="min-w-4 flex-1" />
      <button type="button" className="hover:text-primary" onClick={() => void refresh()} title={t('Refresh (⌘R)')}>
        {repo.totalCommits.toLocaleString()} commits · {repo.refs.length} refs
      </button>
      <button
        type="button"
        className="flex items-center gap-1.25 hover:text-primary"
        title={t('Appearance: {theme}', { theme })}
        onClick={() => updateSettings({ theme: THEME_NEXT[theme] })}
      >
        <ThemeIcon size={12} />
        {theme[0]!.toUpperCase() + theme.slice(1)}
      </button>
    </footer>
  )
}
