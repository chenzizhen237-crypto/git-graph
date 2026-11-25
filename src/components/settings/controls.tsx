/** Shared form controls for Settings pages. */
import { ChevronsUpDown, TriangleAlert } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { cx } from '../../lib/cx'

const field = 'h-7.5 rounded-md border border-strong bg-app px-2.5 outline-none focus:border-focus focus:ring-1 focus:ring-focus disabled:opacity-50'

/** Settings/Row: right-aligned label, the control, then help and an optional warning. */
export function Row({ label, children, help, warn }: { label?: string; children: ReactNode; help?: ReactNode; warn?: string }) {
  return (
    <div className="flex gap-6">
      <div className="w-50 shrink-0 pt-1.5 text-right font-medium">{label}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-h-7.5 flex-wrap items-center gap-2.5">{children}</div>
        {help && <div className="max-w-130 text-sm leading-normal text-muted">{help}</div>}
        {warn && (
          <div className="flex max-w-130 gap-1.5 text-sm leading-normal text-muted">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-status-modified" />
            {warn}
          </div>
        )}
      </div>
    </div>
  )
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2.5 text-secondary">
      <input type="checkbox" className="m-0 size-4 accent-accent" checked={checked} onChange={e => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  width = 'w-75',
  font,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  width?: string
  /** Shows the chosen value in this font family. */
  font?: string
}) {
  return (
    <div className={cx('relative', width)}>
      <select className={cx(field, 'w-full appearance-none pr-8')} style={font ? { fontFamily: font } : undefined} value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown size={14} className="pointer-events-none absolute top-2 right-2 text-muted" />
    </div>
  )
}

export function NumberField({ value, min, max, suffix, onChange }: { value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div className={cx(field, 'flex w-35 items-center gap-2 focus-within:border-focus focus-within:ring-1 focus-within:ring-focus')}>
      <input
        type="number"
        className="w-full min-w-0 bg-transparent outline-none"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
        }}
      />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  )
}

/** Text that saves when you leave the field or press Enter, not on every key. */
export function TextField({
  value,
  placeholder,
  onCommit,
  width = 'w-75',
  mono,
}: {
  value: string
  placeholder?: string
  onCommit: (v: string) => void
  width?: string
  mono?: boolean
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className={cx(field, width, mono && 'font-mono text-sm')}
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v.trim())}
      onKeyDown={e => e.key === 'Enter' && onCommit(v.trim())}
    />
  )
}

export function TextArea({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <textarea
      className="h-19 w-115 resize-y rounded-md border border-strong bg-app px-2.5 py-2 font-mono text-sm leading-normal outline-none focus:border-focus focus:ring-1 focus:ring-focus"
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  )
}

export function Section({ children }: { children: ReactNode }) {
  return <div className="-mb-1.5 pt-1.5 pl-56 text-[11px] font-bold tracking-[0.7px] text-muted uppercase">{children}</div>
}
