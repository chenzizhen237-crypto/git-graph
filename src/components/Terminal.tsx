/**
 * Terminal panel: one login shell per tab in the repository root. Hiding the
 * panel keeps the shells; closing it ends them. It docks wherever a
 * <TerminalSlot> is mounted (under the graph in History, under the whole view
 * elsewhere) without restarting the shells when you switch views.
 */
import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { type ITheme, Terminal as XTerm } from '@xterm/xterm'
import { ChevronDown, ExternalLink, Plus, SquareTerminal, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { cx } from '../lib/cx'
import { openTerminal } from '../lib/git'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import {
  closeTab,
  closeTerminal,
  newTab,
  onTermExit,
  onTermOutput,
  renameTab,
  selectTab,
  termClose,
  termOpen,
  termResize,
  termWrite,
  toggleTerminal,
  useTerminal,
} from '../lib/terminal'
import { type PanelSize, Resizer } from './Split'
import { IconButton } from './ui'

/** The xterm colours, read from the design tokens so the terminal follows light and dark. */
function theme(): ITheme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    background: v('--bg-surface'),
    foreground: v('--text-primary'),
    cursor: v('--text-primary'),
    cursorAccent: v('--bg-surface'),
    selectionBackground: v('--bg-selected'),
    black: v('--neutral-800'),
    red: v('--status-deleted'),
    green: v('--status-added'),
    yellow: v('--status-modified'),
    blue: v('--accent'),
    magenta: v('--purple-400'),
    cyan: v('--cyan-500'),
    white: v('--neutral-200'),
    brightBlack: v('--text-muted'),
    brightRed: v('--red-400'),
    brightGreen: v('--green-400'),
    brightYellow: v('--amber-400'),
    brightBlue: v('--blue-400'),
    brightMagenta: v('--pink-400'),
    brightCyan: v('--cyan-400'),
    brightWhite: v('--neutral-50'),
  }
}

/**
 * The panel's own element. It is rendered into once (a portal) and moved between
 * slots as views change, so the xterm instances and their shells live on.
 */
const host = document.createElement('div')
host.style.display = 'contents'

/** Where the terminal docks: put it at the bottom of a flex column. */
export function TerminalSlot() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const slot = ref.current
    slot?.appendChild(host)
    return () => {
      if (host.parentElement === slot) host.remove()
    }
  }, [])
  return <div ref={ref} className="contents" />
}

/** Mounted once per window; shows up in whichever TerminalSlot is on screen. */
export function TerminalPanel({ cwd, panel }: { cwd: string; panel: PanelSize }) {
  const { open, tabs, active } = useTerminal()
  if (!tabs.length) return null
  return createPortal(
    <>
      {open && <Resizer panel={panel} axis="y" side="after" />}
      <section className={cx('flex shrink-0 flex-col border-t border-subtle bg-surface', !open && 'hidden')} style={{ height: panel.size }}>
        <div className="flex h-8 shrink-0 items-center gap-1 bg-titlebar pr-1.5 pl-2">
          {tabs.map(tab => (
            <div
              key={tab.key}
              className={cx(
                'group flex h-6 max-w-48 items-center gap-1.5 rounded-md pr-1 pl-2 text-sm',
                tab.key === active ? 'bg-selected font-medium text-primary' : 'text-secondary hover:bg-hover',
              )}
            >
              <button type="button" className="flex min-w-0 items-center gap-1.5" onClick={() => selectTab(tab.key)} title={tab.title}>
                <SquareTerminal size={13} className="shrink-0 text-muted" />
                <span className="truncate">{tab.title}</span>
              </button>
              <button type="button" className="rounded-sm p-0.5 text-muted hover:bg-hover hover:text-primary" title={t('Close tab')} onClick={() => closeTab(tab.key)}>
                <X size={12} />
              </button>
            </div>
          ))}
          <IconButton icon={Plus} size={14} small title={t('New terminal tab')} onClick={newTab} />
          <span className="min-w-2 flex-1" />
          <IconButton icon={ExternalLink} size={14} small title={t('Open in external terminal')} onClick={() => void openTerminal(cwd)} />
          <IconButton icon={Trash2} size={14} small title={t('Clear')} onClick={() => window.dispatchEvent(new CustomEvent('term:clear', { detail: active }))} />
          <IconButton icon={ChevronDown} size={14} small title={t('Hide terminal (⌃`)')} onClick={toggleTerminal} />
          <IconButton icon={X} size={14} small title={t('Close terminal')} onClick={closeTerminal} />
        </div>
        <div className="relative min-h-0 flex-1">
          {tabs.map(tab => (
            <Screen key={tab.key} tabKey={tab.key} cwd={cwd} visible={open && tab.key === active} />
          ))}
        </div>
      </section>
    </>,
    host,
  )
}

/** One shell: an xterm bound to a backend pseudo-terminal for as long as the tab lives. */
function Screen({ tabKey, cwd, visible }: { tabKey: number; cwd: string; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<XTerm | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const { fonts, theme: themePref } = useSettings()

  // biome-ignore lint/correctness/useExhaustiveDependencies: the shell starts once per tab; fonts and theme follow below.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const xterm = new XTerm({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--ff-mono').trim() || 'monospace',
      fontSize: fonts.monoSize + 1,
      lineHeight: 1.25,
      cursorBlink: true,
      allowProposedApi: true,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: theme(),
    })
    // ⌃` toggles the panel (App's shortcut), so the shell never sees it.
    xterm.attachCustomKeyEventHandler(e => !(e.ctrlKey && e.code === 'Backquote'))
    const fitter = new FitAddon()
    xterm.loadAddon(fitter)
    xterm.open(el)
    term.current = xterm
    fit.current = fitter
    try {
      fitter.fit()
    } catch {}

    let id = 0
    let dead = false
    const unlisten: (() => void)[] = []
    void termOpen(cwd, xterm.cols, xterm.rows)
      .then(async newId => {
        if (dead) return void termClose(newId)
        id = newId
        unlisten.push(await onTermOutput(id, bytes => xterm.write(bytes)))
        unlisten.push(
          await onTermExit(id, () => {
            xterm.write(`\r\n\x1b[2m${t('[Process ended]')}\x1b[0m\r\n`)
          }),
        )
      })
      .catch(e => xterm.write(`\x1b[31m${String(e)}\x1b[0m\r\n`))
    const subs = [
      xterm.onData(data => id && void termWrite(id, data)),
      xterm.onResize(({ cols, rows }) => id && void termResize(id, cols, rows)),
      xterm.onTitleChange(title => title && renameTab(tabKey, title)),
    ]
    const onClear = (e: Event) => (e as CustomEvent<number>).detail === tabKey && xterm.clear()
    window.addEventListener('term:clear', onClear)
    const resize = new ResizeObserver(() => {
      if (el.offsetParent)
        try {
          fitter.fit()
        } catch {}
    })
    resize.observe(el)
    return () => {
      dead = true
      resize.disconnect()
      window.removeEventListener('term:clear', onClear)
      for (const s of subs) s.dispose()
      for (const u of unlisten) u()
      if (id) void termClose(id)
      xterm.dispose()
    }
    // Font and theme changes are applied below without restarting the shell.
  }, [tabKey, cwd])

  // Follow Settings → Fonts and the light/dark theme.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a theme change swaps the CSS colours theme() reads.
  useEffect(() => {
    const xterm = term.current
    if (!xterm) return
    const apply = () => {
      xterm.options.theme = theme()
      xterm.options.fontSize = fonts.monoSize + 1
      try {
        fit.current?.fit()
      } catch {}
    }
    apply()
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [fonts.monoSize, themePref])

  useEffect(() => {
    if (!visible) return
    try {
      fit.current?.fit()
    } catch {}
    term.current?.focus()
  }, [visible])

  return <div ref={host} className={cx('absolute inset-0 py-1.5 pl-3', !visible && 'invisible')} />
}
