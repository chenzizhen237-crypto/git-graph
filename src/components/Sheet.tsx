/** A full-window card over the app (file history, conflict editor, interactive rebase). Esc closes it. */
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

import { t } from '../lib/i18n'
import { IconButton } from './ui'

export function Sheet({
  icon: Icon,
  title,
  sub,
  actions,
  onClose,
  children,
}: {
  icon: LucideIcon
  title: string
  sub?: ReactNode
  actions?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Esc inside a field only leaves the field.
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return (e.target as HTMLElement).blur()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div data-exit className="fixed inset-0 z-50 flex bg-scrim p-6" onMouseDown={onClose}>
      <div
        className="flex min-w-0 flex-1 animate-dialog-in flex-col overflow-hidden rounded-xl border border-strong bg-app shadow-[0_20px_50px_var(--shadow)]"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-subtle pr-2.5 pl-4">
          <Icon size={16} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate text-lg font-bold" title={title}>
            {title}
          </span>
          {sub && <span className="min-w-0 shrink truncate text-sm text-muted">{sub}</span>}
          <span className="min-w-4 flex-1" />
          {actions}
          <IconButton icon={X} title={t('Close (esc)')} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
