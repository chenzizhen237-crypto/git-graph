/**
 * Auto-hiding scrollbars: any element that scrolls gets `is-scrolling` until
 * it has been still for a moment, and the stylesheet only paints the thumb
 * while that class is on (or the pointer is over the thumb).
 */
const HIDE_AFTER_MS = 1200

export function autoHideScrollbars() {
  const timers = new WeakMap<Element, number>()
  // `scroll` does not bubble, so listen in the capture phase to see every scroller.
  document.addEventListener(
    'scroll',
    e => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement
      if (!el) return
      el.classList.add('is-scrolling')
      clearTimeout(timers.get(el))
      timers.set(
        el,
        window.setTimeout(() => el.classList.remove('is-scrolling'), HIDE_AFTER_MS),
      )
    },
    { capture: true, passive: true },
  )
}
