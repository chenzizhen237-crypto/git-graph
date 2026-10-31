/** Route changes: the new view crossfades over the old one. The timing is in styles/index.css. */
import type { View } from '../state'

/** The Workspace rows, top to bottom. */
export const ROUTES: View[] = ['changes', 'history', 'stashes', 'pulls', 'actions', 'issues', 'agents', 'overview']

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

let running: ViewTransition | null = null

/** Runs `update` inside a view transition. False when it can't, and the caller just changes the view. */
export function changeRoute(update: () => void) {
  if (!document.startViewTransition || calm()) return false
  running?.skipTransition()
  const transition = document.startViewTransition(update)
  running = transition
  void transition.finished.finally(() => {
    if (running === transition) running = null
  })
  return true
}

/** Runs `update` while the whole window crossfades, for a change of repository. False when it can't. */
export function crossfadeWindow(update: () => void) {
  if (!document.startViewTransition || calm()) return false
  running?.skipTransition()
  const html = document.documentElement
  html.classList.add('window-fade')
  const transition = document.startViewTransition(update)
  running = transition
  void transition.finished.finally(() => {
    html.classList.remove('window-fade')
    if (running === transition) running = null
  })
  return true
}

/**
 * WebKit swallows clicks while a view transition covers the page. A click ends
 * the transition and goes to whatever is under it, so nothing waits for motion.
 */
export function passClicksThrough() {
  window.addEventListener(
    'click',
    e => {
      if (!running || e.target !== document.documentElement) return
      const { clientX, clientY } = e
      running.skipTransition()
      void running.finished.finally(() => {
        const under = document.elementFromPoint(clientX, clientY)
        if (under instanceof HTMLElement) under.click()
      })
    },
    { capture: true },
  )
}
