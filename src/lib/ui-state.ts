/**
 * Transient UI overlays (context menu, confirm/prompt dialog, command palette)
 * stored outside AppContext so opening a menu or dialog never re-renders the
 * commit graph, sidebar or diff viewer.
 */
import { useSyncExternalStore } from 'react'

import type { MenuItem, MenuState } from '../components/Menu'

export type Ask = { title: string; text?: string; confirm: string; danger?: boolean }
export type Prompt = { title: string; placeholder?: string; initial?: string; confirm: string; /** An empty answer is allowed. */ optional?: boolean }
export type Dialog = (Ask & { kind: 'ask'; resolve: (ok: boolean) => void }) | (Prompt & { kind: 'prompt'; resolve: (value: string | null) => void })

type UiState = {
  menu: MenuState
  dialog: Dialog | null
  paletteOpen: boolean
}

let state: UiState = { menu: null, dialog: null, paletteOpen: false }
const listeners = new Set<() => void>()

function emit(patch: Partial<UiState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const useMenu = () => useSyncExternalStore(subscribe, () => state.menu)
export const useDialog = () => useSyncExternalStore(subscribe, () => state.dialog)
export const usePalette = () => useSyncExternalStore(subscribe, () => state.paletteOpen)

export function openMenu(e: { preventDefault: () => void; clientX: number; clientY: number }, items: MenuItem[]) {
  e.preventDefault()
  emit({ menu: { x: e.clientX, y: e.clientY, items } })
}

export const closeMenu = () => emit({ menu: null })

export const ask = (a: Ask) => new Promise<boolean>(resolve => emit({ dialog: { ...a, kind: 'ask', resolve } }))
export const prompt = (p: Prompt) => new Promise<string | null>(resolve => emit({ dialog: { ...p, kind: 'prompt', resolve } }))
export const closeDialog = () => emit({ dialog: null })

export const setPaletteOpen = (paletteOpen: boolean) => emit({ paletteOpen })
export const togglePalette = () => emit({ paletteOpen: !state.paletteOpen })
