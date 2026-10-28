/**
 * Notification sounds (Settings → Notifications → Sound), synthesized with
 * Web Audio so there are no files to ship: a rising two-note chime for
 * successes, one soft note for news, a falling low pair for errors.
 */
import { getSettings } from './settings'

export type Tone = 'ok' | 'info' | 'error'

/** Notes per tone: [frequency Hz, start s, length s]. */
const NOTES: Record<Tone, [number, number, number][]> = {
  ok: [
    [784, 0, 0.18],
    [1175, 0.09, 0.32],
  ],
  info: [[988, 0, 0.35]],
  error: [
    [440, 0, 0.2],
    [330, 0.12, 0.34],
  ],
}

let ctx: AudioContext | null = null
/** Last time each tone played, so a burst of toasts makes one sound. */
const last: Partial<Record<Tone, number>> = {}

/** Plays `tone` when sounds are on (or always, with `force`, for the Play button). */
export function playSound(tone: Tone, force = false) {
  if (!force && !getSettings().notify.sound) return
  const now = performance.now()
  if (!force && now - (last[tone] ?? 0) < 400) return
  last[tone] = now
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime + 0.01
    const out = ctx.createGain()
    out.gain.value = 0.18
    out.connect(ctx.destination)
    for (const [freq, start, length] of NOTES[tone]) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = tone === 'error' ? 'triangle' : 'sine'
      osc.frequency.value = freq
      // Quick attack, exponential decay: a bell rather than a beep.
      env.gain.setValueAtTime(0.0001, t0 + start)
      env.gain.exponentialRampToValueAtTime(1, t0 + start + 0.012)
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + start + length)
      osc.connect(env).connect(out)
      osc.start(t0 + start)
      osc.stop(t0 + start + length + 0.05)
    }
  } catch {
    // No audio device: stay silent.
  }
}
