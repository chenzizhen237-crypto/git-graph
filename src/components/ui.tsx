/** The design's atoms: buttons, chips, avatar, badges. Names follow the Nib components. */
import { ArrowDownUp, CircleCheck, CircleX, Cloud, GitBranch, House, Loader2, LoaderCircle, type LucideIcon, Tag } from 'lucide-react'
import type { ReactNode } from 'react'

import type { CiState } from '../lib/actions'
import { cx } from '../lib/cx'
import { t } from '../lib/i18n'
import { STATUS_COLORS } from '../lib/parse'

type Click = { onClick?: () => void; disabled?: boolean; title?: string; type?: 'button' | 'submit' }

/** Button/Toolbar: icon over a small label. */
export function ToolButton({ icon: Icon, label, busy, badge, ...rest }: { icon: LucideIcon; label: string; busy?: boolean; badge?: number } & Click) {
  return (
    <button
      type="button"
      className="relative flex min-w-10.5 flex-col items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-secondary enabled:hover:bg-hover disabled:opacity-40"
      {...rest}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
      {!!badge && <span className="absolute top-px right-1.5 h-3.5 min-w-3.5 rounded-full bg-accent px-1 text-[9px] leading-3.5 font-bold text-on-accent">{badge}</span>}
    </button>
  )
}

/** Button/Primary and Button/Secondary. */
export function Button({
  icon: Icon,
  children,
  kind = 'secondary',
  small,
  busy,
  danger,
  className,
  ...rest
}: { icon?: LucideIcon; children: ReactNode; kind?: 'primary' | 'secondary'; small?: boolean; busy?: boolean; danger?: boolean; className?: string } & Click) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 text-md whitespace-nowrap disabled:opacity-50',
        small ? 'h-6.5' : 'h-7',
        kind === 'primary'
          ? cx('font-semibold text-on-accent enabled:hover:brightness-110', danger ? 'bg-status-deleted' : 'bg-accent')
          : 'border border-strong bg-elevated font-medium enabled:hover:bg-hover [&>svg]:text-secondary',
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : Icon && <Icon size={14} />}
      {children}
    </button>
  )
}

/** Button/Icon. */
export function IconButton({
  icon: Icon,
  size = 15,
  small,
  active,
  className,
  ...rest
}: { icon: LucideIcon; size?: number; small?: boolean; active?: boolean; className?: string } & Click) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md enabled:hover:bg-hover disabled:opacity-40',
        small ? 'size-6' : 'size-7',
        active ? 'bg-selected text-ref-head' : 'text-secondary',
        className,
      )}
      {...rest}
    >
      <Icon size={size} />
    </button>
  )
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <span className="rounded-sm border border-subtle bg-surface px-1.25 py-px text-xs font-medium whitespace-nowrap text-muted">{children}</span>
)

export type ChipKind = 'head' | 'local' | 'remote' | 'tag'

const CHIP_ICON: Record<ChipKind, LucideIcon> = { head: House, local: GitBranch, remote: Cloud, tag: Tag }
const CHIP_STYLE: Record<ChipKind, string> = {
  head: 'bg-ref-head text-on-accent',
  local: 'bg-ref-local-soft text-ref-local',
  remote: 'bg-ref-remote-soft text-ref-remote',
  tag: 'bg-ref-tag-soft text-ref-tag-text',
}

/** Chip/Head, Chip/Local, Chip/Remote, Chip/Tag. `synced` adds ⇅ when a remote twin is folded in. */
export function Chip({ kind, name, synced, large, icon }: { kind: ChipKind; name: string; synced?: boolean; large?: boolean; icon?: LucideIcon }) {
  const Icon = icon ?? CHIP_ICON[kind]
  return (
    <span
      className={cx(
        'inline-flex max-w-55 shrink-0 items-center gap-1 rounded-sm font-semibold whitespace-nowrap',
        large ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-xs',
        CHIP_STYLE[kind],
      )}
      title={name}
    >
      <Icon size={large ? 12 : 11} className="shrink-0" />
      <span className="truncate">{name}</span>
      {synced && <ArrowDownUp size={11} className="shrink-0 opacity-80" />}
    </span>
  )
}

export type RefChip = { kind: ChipKind; name: string; synced?: boolean }

/**
 * The chips for one commit from its `%D` decorations. A remote whose local
 * namesake is on the same commit folds into the local chip as ⇅.
 */
export function refChips(decorations: string[], remotes: Set<string>): RefChip[] {
  const chips: RefChip[] = []
  const locals = new Set<string>()
  const remoteNames: string[] = []
  let head: string | undefined
  for (const d of decorations) {
    if (d === 'HEAD') chips.push({ kind: 'head', name: 'HEAD' })
    else if (d.startsWith('HEAD -> ')) {
      head = d.slice(8)
      locals.add(head)
    } else if (d.startsWith('tag: ')) chips.push({ kind: 'tag', name: d.slice(5) })
    else if (remotes.has(d)) {
      if (!d.endsWith('/HEAD')) remoteNames.push(d)
    } else locals.add(d)
  }
  const tail = (r: string) => r.slice(r.indexOf('/') + 1)
  const folded = new Set(remoteNames.filter(r => locals.has(tail(r))))
  const out: RefChip[] = []
  for (const l of locals) {
    const synced = [...folded].some(r => tail(r) === l)
    out.push({ kind: l === head ? 'head' : 'local', name: l, synced })
  }
  for (const r of remoteNames) if (!folded.has(r)) out.push({ kind: 'remote', name: r })
  return [...out, ...chips]
}

const AVATAR_COLORS = ['var(--blue-500)', 'var(--purple-500)', 'var(--green-600)', 'var(--amber-600)', 'var(--pink-500)', 'var(--cyan-500)']

function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 1)
    .map(p => p[0]!.toUpperCase())
    .join('') || '?'

export function avatarColor(name: string) {
  if (/claude/i.test(name)) return 'var(--avatar-claude)'
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]!
}

/** Avatar: the author's initial on a colour picked from their name. */
export function Avatar({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-on-accent"
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.55) }}
    >
      {initials(name)}
    </span>
  )
}

/** Stage dot: its colour comes from the Stage axis. */
export const StageDot = () => <span className="size-2 shrink-0 rounded-full bg-stage-color" />

/** The M / A / D / U square of Row/File. */
export function StatusBadge({ letter }: { letter: string }) {
  return (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold text-on-accent"
      style={{ background: STATUS_COLORS[letter] ?? 'var(--text-muted)' }}
    >
      {letter === '?' ? 'U' : letter}
    </span>
  )
}

/** Count: the small grey pill beside tab and section labels. */
export const Count = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-surface px-1.5 py-px text-xs font-semibold tracking-normal text-muted">{children}</span>
)

/** The middle of an empty pane. */
export const Empty = ({ children }: { children: ReactNode }) => <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted">{children}</div>

/** Small caps section label: BRANCHES, STAGED… */
export const caps = 'text-[10px] font-bold tracking-[0.7px] text-muted'

/** Row/File base: hover and selection states shared by every file list. */
export const fileRowClass = (selected: boolean) => cx('group flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-left', selected ? 'bg-selected' : 'hover:bg-hover')

export function FilePath({ name, dir }: { name: string; dir?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
      <span className="font-medium">{name}</span>
      {dir && <span className="truncate text-sm text-muted">{dir}</span>}
    </span>
  )
}

export function LineStats({ added, deleted }: { added?: number; deleted?: number }) {
  if (added === undefined) return <span className="font-mono text-sm text-muted">bin</span>
  return (
    <span className="flex gap-1.5 font-mono text-sm font-medium">
      <span className="text-status-added">+{added}</span>
      <span className="text-status-deleted">−{deleted}</span>
    </span>
  )
}

/** Segmented: two or more icon toggles in a well. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; icon: LucideIcon; title: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md bg-surface p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx('flex h-6 w-6.5 items-center justify-center rounded-sm', value === o.value ? 'bg-elevated text-primary shadow-[0_1px_2px_var(--shadow)]' : 'text-muted')}
        >
          <o.icon size={13} />
        </button>
      ))}
    </div>
  )
}

/** `plugins/git-graph/hooks/pane.tsx` → name and folder. */
export function splitPath(path: string) {
  const at = path.lastIndexOf('/')
  return at < 0 ? { name: path, dir: '' } : { name: path.slice(at + 1), dir: path.slice(0, at) }
}

/** `3 hours ago` without the noise of `, 2 minutes`. */
export const shortAgo = (ago: string) => ago.replace(/, \d+ \w+ ago$/, ' ago')

/** CI state of a commit: ✓ passed, ✗ failed, ● running; nothing when it has no checks. */
export function CiIcon({ state, size = 14 }: { state?: CiState; size?: number }) {
  if (state === 'pass') return <CircleCheck size={size} className="shrink-0 text-status-added" aria-label={t('Checks passed')} />
  if (state === 'fail') return <CircleX size={size} className="shrink-0 text-status-deleted" aria-label={t('Checks failed')} />
  if (state === 'pending') return <LoaderCircle size={size} className="shrink-0 animate-[spin_2s_linear_infinite] text-status-modified" aria-label={t('Checks running')} />
  return <span className="shrink-0" style={{ width: size }} />
}
