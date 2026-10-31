/** Command palette (⌘K), the ask/prompt dialog, and toasts. */
import {
  Archive,
  Bell,
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CirclePlay,
  Cloud,
  CloudUpload,
  ExternalLink,
  GitFork,
  FileDiff,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitGraph,
  GitMerge,
  GitPullRequest,
  Languages,
  LayoutDashboard,
  type LucideIcon,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  SquareTerminal,
  Code2,
  SunMoon,
  Tag,
  X,
} from 'lucide-react'
import { type CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { cx } from '../lib/cx'
import { repoActions, webUrl } from '../lib/actions'
import { actions, openTerminal } from '../lib/git'
import { toggleTerminal } from '../lib/terminal'
import { openInEditor } from '../lib/tools'
import { openUrl } from '../lib/github'
import { t } from '../lib/i18n'
import { getSettings, updateSettings } from '../lib/settings'
import { dismissToast, isSticky, LIFETIME, type Toast, type ToastAction, useToasts } from '../lib/toasts'
import { useApp } from '../state'
import { Button, caps, Empty, Kbd } from './ui'

const scrim = 'fixed inset-0 z-50 flex items-start justify-center bg-scrim pt-27.5'

type Item = { id: string; group: 'BRANCHES' | 'COMMITS' | 'ACTIONS'; icon: LucideIcon; color: string; label: string; hint?: string; kbd?: string; run: () => void }

function highlight(text: string, q: string) {
  if (!q) return text
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-accent">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

export function CommandPalette({ onSwitchRepo, onSettings }: { onSwitchRepo: () => void; onSettings: () => void }) {
  const app = useApp()
  const { repo, act, setPaletteOpen, setView, setSelected, setQuery, prompt, toast, ask, setPublishOpen } = app
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const close = () => setPaletteOpen(false)

  const items = useMemo<Item[]>(() => {
    if (!repo) return []
    const needle = q.trim().toLowerCase()
    const match = (s: string) => !needle || s.toLowerCase().includes(needle)
    const branches: Item[] = repo.refs
      .filter(r => r.kind !== 'tag' && match(r.name))
      .slice(0, needle ? 12 : 6)
      .map(r => ({
        id: `b:${r.name}`,
        group: 'BRANCHES',
        icon: r.kind === 'remote' ? Cloud : GitBranch,
        color: r.kind === 'remote' ? 'var(--ref-remote)' : r.isHead ? 'var(--ref-head)' : 'var(--ref-local)',
        label: r.name,
        hint: `${r.date.replace(/ ago$/, '')} · ${r.kind}${r.isHead ? ' · current' : ''}`,
        kbd: '↩',
        run: () => {
          if (r.isHead) return
          void act('Checkout', r.kind === 'remote' ? actions.checkoutRemote(r.name) : actions.checkout(r.name), { done: t('Switched to {name}', { name: r.name }) })
        },
      }))
    const tags: Item[] = needle
      ? repo.refs
          .filter(r => r.kind === 'tag' && match(r.name))
          .slice(0, 4)
          .map(r => ({
            id: `t:${r.name}`,
            group: 'BRANCHES',
            icon: Tag,
            color: 'var(--ref-tag-text)',
            label: r.name,
            hint: 'tag',
            run: () => {
              setView('history')
              setQuery({ branch: `refs/tags/${r.name}` })
            },
          }))
      : []
    const commits: Item[] = needle
      ? repo.rows
          .filter(r => match(r.subject) || r.short.startsWith(needle) || match(r.author))
          .slice(0, 8)
          .map(r => ({
            id: `c:${r.hash}`,
            group: 'COMMITS',
            icon: GitCommitHorizontal,
            color: 'var(--text-muted)',
            label: r.subject,
            hint: `${r.short} · ${r.author}`,
            run: () => {
              setView('history')
              setSelected(r.hash)
            },
          }))
      : []
    const all = (
      [
        {
          id: 'a:fetch',
          group: 'ACTIONS',
          icon: RefreshCcw,
          color: 'var(--text-secondary)',
          label: t('Fetch all remotes'),
          kbd: '⌘⇧F',
          run: () => void act('Fetch', actions.fetch(), { done: t('Fetched') }),
        },
        { id: 'a:pull', group: 'ACTIONS', icon: ArrowDown, color: 'var(--text-secondary)', label: t('Pull'), run: () => void act('Pull', actions.pull(), { done: t('Pulled') }) },
        {
          id: 'a:push',
          group: 'ACTIONS',
          icon: ArrowUp,
          color: 'var(--text-secondary)',
          label: t('Push'),
          kbd: '⌘⇧P',
          run: () => void act('Push', actions.push(repo), { done: t('Pushed') }),
        },
        {
          id: 'a:branch',
          group: 'ACTIONS',
          icon: GitBranchPlus,
          color: 'var(--text-secondary)',
          label: needle ? t('Create branch “{name}”', { name: q.trim() }) : 'New branch…',
          kbd: '⌘B',
          run: async () => {
            const name = needle ? q.trim() : await prompt({ title: t('New branch'), placeholder: 'feature/name', confirm: t('Create and switch') })
            if (name) void act('Create branch', actions.createBranch(name), { done: t('Switched to {name}', { name }) })
          },
        },
        ...repo.refs
          .filter(r => r.kind === 'local' && !r.isHead && needle && match(r.name))
          .slice(0, 2)
          .map<Item>(r => ({
            id: `m:${r.name}`,
            group: 'ACTIONS',
            icon: GitMerge,
            color: 'var(--text-secondary)',
            label: t('Merge {name} into {branch}', { name: r.name, branch: repo.branch }),
            run: () => void act('Merge', actions.merge(r.name), { done: t('Merged {name}', { name: r.name }) }),
          })),
        { id: 'a:history', group: 'ACTIONS', icon: GitGraph, color: 'var(--text-secondary)', label: t('Show History'), kbd: '⌘1', run: () => setView('history') },
        { id: 'a:changes', group: 'ACTIONS', icon: FileDiff, color: 'var(--text-secondary)', label: t('Show Changes'), kbd: '⌘2', run: () => setView('changes') },
        { id: 'a:stashes', group: 'ACTIONS', icon: Archive, color: 'var(--text-secondary)', label: t('Show Stashes'), kbd: '⌘3', run: () => setView('stashes') },
        { id: 'a:pulls', group: 'ACTIONS', icon: GitPullRequest, color: 'var(--text-secondary)', label: t('Show Pull requests'), kbd: '⌘4', run: () => setView('pulls') },
        { id: 'a:actions', group: 'ACTIONS', icon: CirclePlay, color: 'var(--text-secondary)', label: t('Show Actions'), kbd: '⌘5', run: () => setView('actions') },
        { id: 'a:overview', group: 'ACTIONS', icon: LayoutDashboard, color: 'var(--text-secondary)', label: t('Show CI/CD'), kbd: '⌘6', run: () => setView('overview') },
        {
          id: 'a:web',
          group: 'ACTIONS',
          icon: ExternalLink,
          color: 'var(--text-secondary)',
          label: t('Open repository on GitHub'),
          run: () =>
            void webUrl(repo.root)
              .then(openUrl)
              .catch(e => toast({ kind: 'error', title: t('Not on GitHub'), detail: String(e) })),
        },
        ...(!repo.refs.some(r => r.kind === 'remote')
          ? [{ id: 'a:publish', group: 'ACTIONS' as const, icon: CloudUpload, color: 'var(--text-secondary)', label: t('Publish to GitHub…'), run: () => setPublishOpen(true) }]
          : []),
        {
          id: 'a:fork',
          group: 'ACTIONS',
          icon: GitFork,
          color: 'var(--text-secondary)',
          label: t('Fork on GitHub'),
          run: async () => {
            if (await ask({ title: t('Fork this repository?'), text: t('Creates your fork on GitHub, makes it origin, and keeps the original as upstream.'), confirm: t('Fork') }))
              await act('Fork', repoActions.fork(), { tool: 'gh', done: t('Forked — origin is now your fork') })
          },
        },
        { id: 'a:term', group: 'ACTIONS', icon: SquareTerminal, color: 'var(--text-secondary)', label: t('Show or hide terminal'), kbd: '⌃`', run: toggleTerminal },
        {
          id: 'a:term-ext',
          group: 'ACTIONS',
          icon: SquareTerminal,
          color: 'var(--text-secondary)',
          label: t('Open in external terminal'),
          run: () => void openTerminal(repo.root),
        },
        { id: 'a:editor', group: 'ACTIONS', icon: Code2, color: 'var(--text-secondary)', label: t('Open in editor'), run: () => void openInEditor(repo.root).catch(() => {}) },
        { id: 'a:repo', group: 'ACTIONS', icon: FolderOpen, color: 'var(--text-secondary)', label: t('Open another repository…'), kbd: '⌘O', run: onSwitchRepo },
        { id: 'a:settings', group: 'ACTIONS', icon: SettingsIcon, color: 'var(--text-secondary)', label: t('Settings…'), kbd: '⌘,', run: onSettings },
        {
          id: 'a:lang',
          group: 'ACTIONS',
          icon: Languages,
          color: 'var(--text-secondary)',
          label: getSettings().language === 'zh' ? 'Switch to English' : '切换到简体中文',
          run: () => updateSettings({ language: getSettings().language === 'zh' ? 'en' : 'zh' }),
        },
        {
          id: 'a:theme',
          group: 'ACTIONS',
          icon: SunMoon,
          color: 'var(--text-secondary)',
          label: t('Toggle dark appearance'),
          run: () => {
            const { theme } = getSettings()
            const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
            updateSettings({ theme: dark ? 'light' : 'dark' })
          },
        },
      ] satisfies Item[]
    ).filter(a => a.id === 'a:branch' || a.id.startsWith('m:') || match(a.label))
    return [...branches, ...tags, ...commits, ...all]
  }, [repo, q, act, prompt, setQuery, setSelected, setView, onSwitchRepo, onSettings, toast, ask, setPublishOpen])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the query is the trigger: a new search selects the first result
  useEffect(() => setAt(0), [q])
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll the newly highlighted item into view
  useEffect(() => {
    list.current?.querySelector('[data-on]')?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const run = (item: Item | undefined) => {
    if (!item) return
    close()
    item.run()
  }

  let lastGroup = ''
  return (
    <div className={scrim} onMouseDown={close}>
      <div
        className="flex max-h-130 w-150 flex-col overflow-hidden rounded-xl border border-strong bg-elevated shadow-[0_20px_50px_var(--shadow),0_2px_6px_var(--shadow)]"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex h-13 shrink-0 items-center gap-2.5 border-b border-subtle px-4 text-muted">
          <Search size={17} />
          <input
            autoFocus
            className="flex-1 bg-transparent text-lg font-medium text-primary outline-none placeholder:text-faint"
            placeholder={t('Search branches, commits and actions')}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') close()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setAt(a => Math.min(items.length - 1, a + 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setAt(a => Math.max(0, a - 1))
              }
              if (e.key === 'Enter') run(items[at])
            }}
          />
        </div>
        <div className="overflow-y-auto p-2" ref={list}>
          {items.map((item, i) => {
            const head = item.group !== lastGroup ? <div className={cx('px-2.5 pt-2.5 pb-1', caps)}>{item.group}</div> : null
            lastGroup = item.group
            const Icon = item.icon
            return (
              <div key={item.id}>
                {head}
                <button
                  type="button"
                  data-on={i === at || undefined}
                  className={cx('flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left', i === at && 'bg-selected')}
                  onMouseMove={() => setAt(i)}
                  onClick={() => run(item)}
                  title={item.hint ? `${item.label}\n${item.hint}` : item.label}
                >
                  <Icon size={15} color={item.color} className="shrink-0" />
                  <span className="flex-1 truncate">{highlight(item.label, q.trim())}</span>
                  {item.hint && <span className="text-sm text-muted">{item.hint}</span>}
                  {item.kbd && <Kbd>{item.kbd}</Kbd>}
                </button>
              </div>
            )
          })}
          {!items.length && <Empty>Nothing matches “{q}”</Empty>}
        </div>
        <div className="flex h-9 shrink-0 items-center gap-3.5 border-t border-subtle bg-surface px-3.5 text-sm text-muted [&>span]:flex [&>span]:items-center [&>span]:gap-1.25">
          <span>
            <Kbd>↑↓</Kbd> Navigate
          </span>
          <span>
            <Kbd>↩</Kbd> Run
          </span>
          <span>
            <Kbd>esc</Kbd> Close
          </span>
          <span className="min-w-4 flex-1" />
          {items.length} results
        </div>
      </div>
    </div>
  )
}

export function DialogHost() {
  const { dialog, closeDialog } = useApp()
  const [value, setValue] = useState('')
  useEffect(() => setValue(dialog?.kind === 'prompt' ? (dialog.initial ?? '') : ''), [dialog])
  if (!dialog) return null
  const done = (ok: boolean) => {
    closeDialog()
    if (dialog.kind === 'ask') dialog.resolve(ok)
    else dialog.resolve(ok ? value : null)
  }
  return (
    <div className={scrim} onMouseDown={() => done(false)}>
      <form
        className="mt-15 flex w-105 flex-col gap-3 rounded-xl border border-strong bg-elevated p-4.5 shadow-[0_20px_50px_var(--shadow)]"
        onMouseDown={e => e.stopPropagation()}
        onSubmit={e => {
          e.preventDefault()
          done(true)
        }}
        onKeyDown={e => e.key === 'Escape' && done(false)}
      >
        <div className="text-lg font-semibold">{dialog.title}</div>
        {dialog.kind === 'ask' && dialog.text && <div className="leading-normal text-secondary">{dialog.text}</div>}
        {dialog.kind === 'prompt' && (
          <input
            autoFocus
            className="h-8 rounded-md border border-focus bg-app px-2.5 ring-1 ring-focus outline-none"
            placeholder={dialog.placeholder}
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={() => done(false)}>{t('Cancel')}</Button>
          <Button kind="primary" type="submit" danger={dialog.kind === 'ask' && dialog.danger} disabled={dialog.kind === 'prompt' && !dialog.optional && !value.trim()}>
            {dialog.confirm}
          </Button>
        </div>
        {dialog.kind === 'ask' && <AutoFocus />}
      </form>
    </div>
  )
}

/** Focuses the confirm button so Enter confirms and Escape cancels. */
function AutoFocus() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    ref.current?.parentElement?.querySelector<HTMLButtonElement>('button[type=submit]')?.focus()
  }, [])
  return <span ref={ref} hidden />
}

const TOAST_ICON = { ok: CircleCheck, error: CircleAlert, info: Bell }
/** Each kind's colour: the accent bar, the icon, the wash behind the card and the time-left bar. */
const TOAST_TONE = { ok: 'var(--status-added)', error: 'var(--status-deleted)', info: 'var(--accent)' }

/** The app-wide toast stack (lib/toasts), mounted once at the root. */
export function Toasts() {
  const toasts = useToasts()
  if (!toasts.length) return null
  return (
    <div className="fixed right-4 bottom-10 z-60 flex w-100 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map(item => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  )
}

function ToastCard({ item }: { item: Toast }) {
  const Icon = item.icon ?? TOAST_ICON[item.kind]
  const mono = item.mono ?? item.kind === 'error'
  const run = (a: ToastAction) => {
    a.run()
    if (!a.keep) dismissToast(item.id)
  }
  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      style={{ '--tone': TOAST_TONE[item.kind] } as CSSProperties}
      className="relative flex animate-toast-in flex-col gap-2.5 overflow-hidden rounded-lg border border-strong bg-[color-mix(in_srgb,var(--tone)_8%,var(--bg-elevated))] py-3.5 pr-3.5 pl-4.25 text-sm shadow-[0_12px_32px_var(--shadow),0_2px_6px_var(--shadow)]"
    >
      <span className="absolute inset-y-0 left-0 w-0.75 bg-(--tone)" />
      {!isSticky(item) && (
        <span
          // Keyed by the toast's content, so a replaced toast starts its bar again.
          key={`${item.kind}:${item.title}:${item.detail ?? ''}`}
          className="absolute bottom-0 left-0.75 h-0.5 w-full origin-left bg-(--tone) opacity-50"
          style={{ animation: `toast-life ${LIFETIME[item.kind]}ms linear forwards` }}
        />
      )}
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tone)_16%,transparent)] text-(--tone)">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <div className="font-semibold break-words">{item.title}</div>
          {item.detail &&
            (mono ? (
              <pre className="m-0 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap text-secondary select-text">{item.detail}</pre>
            ) : (
              <div className="text-xs leading-normal text-secondary select-text">{item.detail}</div>
            ))}
        </div>
        <button
          type="button"
          title={t('Close')}
          onClick={() => {
            item.onClose?.()
            dismissToast(item.id)
          }}
        >
          <X size={14} className="text-muted" />
        </button>
      </div>
      {!!item.actions?.length && (
        <div className="flex flex-wrap items-center gap-2 pl-9.5">
          {item.actions.map(a => (
            <Button key={a.label} kind={a.primary ? 'primary' : 'secondary'} icon={a.icon} busy={a.busy} disabled={a.busy} onClick={() => run(a)}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {!!item.links?.length && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-subtle pt-2.5 pl-9.5 text-xs font-medium text-secondary">
          {item.links.map((a, i) => (
            <Fragment key={a.label}>
              {i > 0 && <span className="text-faint">·</span>}
              <button type="button" className="hover:text-primary" onClick={() => run(a)}>
                {a.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
