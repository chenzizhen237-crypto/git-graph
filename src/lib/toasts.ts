/**
 * One toast stack for the whole app (bottom right), usable from any module:
 * results of git actions, CI and fetch notices, a new release.
 * Plain toasts hide on their own; toasts with actions stay until answered.
 */
import type { LucideIcon } from 'lucide-react'
import { useSyncExternalStore } from 'react'

export type ToastAction = {
  label: string
  icon?: LucideIcon
  primary?: boolean
  busy?: boolean
  run: () => void
  /** Leave the toast up after running (the action updates it itself). */
  keep?: boolean
}

export type Toast = {
  id: number
  kind: 'ok' | 'error' | 'info'
  title: string
  /** Plain text, or command output shown in mono when `mono` is set. */
  detail?: string
  mono?: boolean
  /** Overrides the kind's icon. */
  icon?: LucideIcon
  /** Buttons under the text. */
  actions?: ToastAction[]
  /** Small text links in a footer row. */
  links?: ToastAction[]
  /** One toast per key: showing it again replaces the old one in place. */
  key?: string
  /** Stays until closed. Defaults to true when there are actions. */
  sticky?: boolean
  /** Runs when the × is clicked. */
  onClose?: () => void
}

export type ToastInput = Omit<Toast, 'id'>

const MAX = 4
const LIFETIME = { ok: 4000, info: 6000, error: 9000 }

let toasts: Toast[] = []
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
let next = 1

function emit() {
  for (const l of listeners) l()
}

/** Shows a toast and returns its id. */
export function toast(input: ToastInput): number {
  const old = input.key ? toasts.find(x => x.key === input.key) : undefined
  const id = old?.id ?? next++
  const item = { ...input, id }
  if (old) toasts = toasts.map(x => (x.id === id ? item : x))
  else {
    // Drop the oldest toasts that would hide on their own anyway; sticky ones stay.
    const overflow = toasts.length + 1 - MAX
    if (overflow > 0) {
      const drop = toasts.filter(x => !isSticky(x)).slice(0, overflow)
      for (const d of drop) clearTimer(d.id)
      toasts = toasts.filter(x => !drop.includes(x))
    }
    toasts = [...toasts, item]
  }
  clearTimer(id)
  if (!isSticky(item))
    timers.set(
      id,
      setTimeout(() => dismissToast(id), LIFETIME[item.kind]),
    )
  emit()
  return id
}

const isSticky = (t: Toast) => t.sticky ?? !!t.actions?.length

function clearTimer(id: number) {
  const timer = timers.get(id)
  if (timer !== undefined) clearTimeout(timer)
  timers.delete(id)
}

export function dismissToast(idOrKey: number | string) {
  const hit = toasts.find(x => x.id === idOrKey || x.key === idOrKey)
  if (!hit) return
  clearTimer(hit.id)
  toasts = toasts.filter(x => x !== hit)
  emit()
}

export const getToasts = () => toasts

export function useToasts() {
  return useSyncExternalStore(cb => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }, getToasts)
}
