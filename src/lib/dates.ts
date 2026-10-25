/** Commit dates as Settings → Commits & graph asks: relative or absolute, in one of a few formats. */
import { timeAgo } from './i18n'
import { type Graph, getSettings } from './settings'

const pad = (n: number) => String(n).padStart(2, '0')

/** An absolute date and time in the chosen format. */
export function formatDate(ms: number, g: Pick<Graph, 'dateFormat' | 'hour24'>) {
  const d = new Date(ms)
  const h = d.getHours()
  const time = g.hour24 ? `${pad(h)}:${pad(d.getMinutes())}` : `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
  const [y, m, day] = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
  switch (g.dateFormat) {
    case 'iso':
      return `${y}-${pad(m)}-${pad(day)} ${time}`
    case 'dmy':
      return `${pad(day)}/${pad(m)}/${y} ${time}`
    case 'mdy':
      return `${pad(m)}/${pad(day)}/${y} ${time}`
    default:
      return `${d.toLocaleDateString(getSettings().language, { year: 'numeric', month: 'short', day: 'numeric' })} ${time}`
  }
}

/** A commit's date for the graph: "3 hours ago" or the full date, per Settings. */
export function commitDate(ms: number) {
  const g = getSettings().graph
  return g.dates === 'relative' ? timeAgo(ms) : formatDate(ms, g)
}
