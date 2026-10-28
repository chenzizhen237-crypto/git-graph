/**
 * The full-window sheets (file history and blame, the conflict editor,
 * interactive rebase): one at a time, opened from menus and views, shown by
 * <Sheets> in the window.
 */
import { useSyncExternalStore } from 'react'

export type Sheet = { kind: 'history'; path: string; tab: 'history' | 'blame'; rev?: string } | { kind: 'conflict'; path: string } | { kind: 'rebase'; base: string }

let current: Sheet | null = null
const listeners = new Set<() => void>()

export function openSheet(sheet: Sheet | null) {
  current = sheet
  for (const l of listeners) l()
}

export const closeSheet = () => openSheet(null)

export function useSheet() {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
