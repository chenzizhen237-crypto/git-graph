/**
 * Route changes as physical movement: the sidebar is a column of places, so
 * going down it travels down. The old sheet stays on screen and falls away
 * while the new one settles, and the move stirs a little dust in the air.
 * The curves are in styles/index.css, and the Nib file's Motion spec draws them.
 */
import type { View } from '../state'

/** The Workspace rows, top to bottom. */
export const ROUTES: View[] = ['changes', 'history', 'stashes', 'pulls', 'actions', 'issues', 'agents', 'overview']

/** The light of each place. */
export const ROUTE_TONE: Record<View, string> = {
  changes: 'var(--status-modified)',
  history: 'var(--ref-head)',
  stashes: 'var(--text-muted)',
  pulls: 'var(--status-added)',
  actions: 'var(--status-renamed)',
  issues: 'var(--ref-local)',
  agents: 'var(--accent)',
  overview: 'var(--ref-remote)',
}

/** 1 when travelling down the sidebar, -1 when travelling up. */
export const routeDirection = (from: View, to: View) => (ROUTES.indexOf(to) >= ROUTES.indexOf(from) ? 1 : -1)

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

let running: ViewTransition | null = null

/** Runs `update` inside a view transition. False when it can't, and the caller just changes the view. */
export function changeRoute(from: View, to: View, update: () => void) {
  if (!document.startViewTransition || calm()) return false
  running?.skipTransition()
  const direction = routeDirection(from, to)
  document.documentElement.style.setProperty('--route-dir', String(direction))
  const transition = document.startViewTransition(update)
  running = transition
  void transition.finished.finally(() => {
    if (running === transition) running = null
  })
  stirDust(direction, ROUTE_TONE[to])
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

// ─── Dust ──────────────────────────────────────────────────────────────────

const MOTES = 18
const DUST_MS = 900
/** Fraction of its speed a mote keeps each second: air slows it quickly. */
const AIR = 0.06
const GRAVITY = 14

let canvas: HTMLCanvasElement | null = null
let frame = 0

/** A few faint motes carried along by the move; they slow in the air and sink. */
function stirDust(direction: number, tone: string) {
  const area = document.querySelector('.route')?.getBoundingClientRect()
  if (!area) return
  canvas ??= Object.assign(document.createElement('canvas'), { className: 'dust' })
  if (!canvas.isConnected) document.body.append(canvas)
  const scale = window.devicePixelRatio
  canvas.width = window.innerWidth * scale
  canvas.height = window.innerHeight * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.style.color = tone
  ctx.fillStyle = getComputedStyle(canvas).color
  const motes = Array.from({ length: MOTES }, () => ({
    x: area.left + Math.random() * area.width,
    y: area.top + Math.random() * area.height,
    vx: (Math.random() - 0.5) * 24,
    vy: -direction * (30 + Math.random() * 70),
    r: 0.6 + Math.random() * 1.2,
    peak: 0.12 + Math.random() * 0.2,
  }))
  cancelAnimationFrame(frame)
  const start = performance.now()
  let last = start
  const draw = (now: number) => {
    const dt = (now - last) / 1000
    last = now
    const life = (now - start) / DUST_MS
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    if (life >= 1) return
    const drag = AIR ** dt
    for (const m of motes) {
      m.vx *= drag
      m.vy = m.vy * drag + GRAVITY * dt
      m.x += m.vx * dt
      m.y += m.vy * dt
      ctx.globalAlpha = m.peak * Math.sin(life * Math.PI)
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
      ctx.fill()
    }
    frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
}
