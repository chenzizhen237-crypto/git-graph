/**
 * Overlay scrollbars, like macOS: native scrollbars are hidden, and while an
 * element scrolls the app draws its own thumb over its edge, which fades out
 * after a moment of stillness. The thumb stays while hovered and can be
 * dragged. (WebKit does not repaint native scrollbars when their style
 * changes, so they cannot simply be toggled with a class.)
 */
const HIDE_AFTER_MS = 1200
const MIN_THUMB = 28
const INSET = 2
const SIZE = 6

type Axis = 'y' | 'x'
type Bar = { el: Element; thumbs: Record<Axis, HTMLDivElement>; timer?: number; hover: boolean; dragging: boolean }

const THUMB_CLASS =
  'pointer-events-auto absolute rounded-full bg-strong opacity-0 transition-[opacity,background-color] duration-300 hover:bg-muted data-[on]:opacity-100 data-[on]:duration-100'

export function autoHideScrollbars() {
  const layer = document.createElement('div')
  layer.className = 'pointer-events-none fixed inset-0 z-[70]'
  document.body.append(layer)
  const bars = new WeakMap<Element, Bar>()

  const place = (bar: Bar) => {
    const el = bar.el
    const r = el.getBoundingClientRect()
    for (const axis of ['y', 'x'] as const) {
      const t = bar.thumbs[axis]
      const view = axis === 'y' ? el.clientHeight : el.clientWidth
      const full = axis === 'y' ? el.scrollHeight : el.scrollWidth
      const pos = axis === 'y' ? el.scrollTop : el.scrollLeft
      if (full <= view + 1) {
        t.hidden = true
        continue
      }
      t.hidden = false
      const len = Math.max(MIN_THUMB, (view * view) / full)
      const at = (pos / (full - view)) * (view - len - INSET * 2) + INSET
      // clientLeft/Top skip the element's border, so the thumb sits inside it.
      const left = r.left + el.clientLeft
      const top = r.top + el.clientTop
      Object.assign(
        t.style,
        axis === 'y'
          ? { left: `${left + el.clientWidth - SIZE - INSET}px`, top: `${top + at}px`, width: `${SIZE}px`, height: `${len}px` }
          : { left: `${left + at}px`, top: `${top + el.clientHeight - SIZE - INSET}px`, width: `${len}px`, height: `${SIZE}px` },
      )
    }
  }

  const hideLater = (bar: Bar) => {
    clearTimeout(bar.timer)
    bar.timer = window.setTimeout(() => {
      if (bar.hover || bar.dragging) return
      for (const t of Object.values(bar.thumbs)) delete t.dataset.on
      // Drop thumbs of elements that left the page once they have faded.
      if (!bar.el.isConnected)
        setTimeout(() => {
          for (const t of Object.values(bar.thumbs)) t.remove()
        }, 400)
    }, HIDE_AFTER_MS)
  }

  const show = (bar: Bar) => {
    place(bar)
    for (const t of Object.values(bar.thumbs)) t.dataset.on = ''
    hideLater(bar)
  }

  const makeThumb = (bar: Bar, axis: Axis) => {
    const t = document.createElement('div')
    t.className = THUMB_CLASS
    t.addEventListener('pointerenter', () => {
      bar.hover = true
      clearTimeout(bar.timer)
    })
    t.addEventListener('pointerleave', () => {
      bar.hover = false
      hideLater(bar)
    })
    // Dragging the thumb scrolls the element in proportion.
    t.addEventListener('pointerdown', e => {
      e.preventDefault()
      t.setPointerCapture(e.pointerId)
      bar.dragging = true
      const el = bar.el
      const start = axis === 'y' ? e.clientY : e.clientX
      const startPos = axis === 'y' ? el.scrollTop : el.scrollLeft
      const view = axis === 'y' ? el.clientHeight : el.clientWidth
      const full = axis === 'y' ? el.scrollHeight : el.scrollWidth
      const len = Math.max(MIN_THUMB, (view * view) / full)
      const ratio = (full - view) / Math.max(1, view - len - INSET * 2)
      const move = (m: PointerEvent) => {
        const next = startPos + ((axis === 'y' ? m.clientY : m.clientX) - start) * ratio
        if (axis === 'y') el.scrollTop = next
        else el.scrollLeft = next
      }
      const up = () => {
        bar.dragging = false
        t.removeEventListener('pointermove', move)
        hideLater(bar)
      }
      t.addEventListener('pointermove', move)
      t.addEventListener('pointerup', up, { once: true })
      t.addEventListener('pointercancel', up, { once: true })
    })
    layer.append(t)
    return t
  }

  const barFor = (el: Element) => {
    let bar = bars.get(el)
    if (!bar?.thumbs.y.isConnected) {
      bar = { el, thumbs: {} as Record<Axis, HTMLDivElement>, hover: false, dragging: false }
      bar.thumbs = { y: makeThumb(bar, 'y'), x: makeThumb(bar, 'x') }
      bars.set(el, bar)
    }
    return bar
  }

  // `scroll` does not bubble, so listen in the capture phase to see every scroller.
  document.addEventListener(
    'scroll',
    e => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement
      if (el) show(barFor(el))
    },
    { capture: true, passive: true },
  )
}
