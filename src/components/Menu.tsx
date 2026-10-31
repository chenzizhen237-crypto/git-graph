/** Menu/Context: the right-click menu. Any view opens one with `openMenu(event, items)`. */
import type { LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cx } from '../lib/cx'

export type MenuItem = { icon: LucideIcon; label: string; run: () => void; danger?: boolean; disabled?: boolean } | 'separator'

export type MenuState = { x: number; y: number; items: MenuItem[] } | null

export function ContextMenu({ menu, onClose }: { menu: NonNullable<MenuState>; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({ x: Math.min(menu.x, window.innerWidth - width - 8), y: Math.min(menu.y, window.innerHeight - height - 8) })
  }, [menu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      data-exit
      className="fixed inset-0 z-[65]"
      onMouseDown={onClose}
      onContextMenu={e => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={box}
        role="menu"
        className="absolute flex w-65 origin-top-left animate-pop-in flex-col gap-px rounded-lg border border-strong bg-elevated p-1.25 shadow-[0_12px_32px_var(--shadow)]"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={e => e.stopPropagation()}
      >
        {menu.items.map((item, i) =>
          item === 'separator' ? (
            <div key={i} className="my-1 h-px bg-subtle" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx('flex h-7 w-full items-center gap-2.5 rounded-md px-2.5 text-left enabled:hover:bg-selected disabled:opacity-40', item.danger && 'text-status-deleted')}
              onClick={() => {
                onClose()
                item.run()
              }}
            >
              <item.icon size={15} className={item.danger ? '' : 'text-secondary'} />
              {item.label}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
