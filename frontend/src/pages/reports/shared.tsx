import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import clsx from 'clsx'
import { Card, EmptyState, ProgressBar } from '@/components/ui/Common'
import { num } from '@/lib/format'

export type Report = Record<string, any>
export interface Cmp {
  current: number
  previous: number
  change: number
  change_pct: number | null
}
export interface SectionProps {
  r: Report
  daily: boolean
}

/** `good` says which direction is an improvement; direction is also spelled out in text, not just colour. */
export function Delta({ d, good, fmt = (v: number) => num(v, 1) }: { d?: Cmp; good: 'up' | 'down' | 'neutral'; fmt?: (v: number) => string }) {
  if (!d) return null
  if (!d.current && !d.previous) return <span className="text-slate-500">No data in either period</span>
  if (d.change === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Minus className="h-3 w-3" aria-hidden /> No change vs previous
      </span>
    )
  }
  const up = d.change > 0
  const better = good === 'neutral' ? null : up === (good === 'up')
  const size = d.change_pct !== null ? `${Math.abs(d.change_pct)}%` : fmt(Math.abs(d.change))
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1 font-medium', better === null ? 'text-slate-600 dark:text-slate-300' : better ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
      <Icon className="h-3 w-3" aria-hidden />
      {up ? 'Up' : 'Down'} {size} vs previous
      {better !== null && <span>({better ? 'improvement' : 'worse'})</span>}
    </span>
  )
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export function NoRecords({ what }: { what: string }) {
  return (
    <Card>
      <EmptyState title={`No ${what} records in this period`} hint="Add records in the matching module and they will appear here." />
    </Card>
  )
}

export interface BarRow {
  label: string
  value: number
  max: number
  text: string
  tone?: 'brand' | 'good' | 'warn' | 'bad'
}

export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-slate-500">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{r.text}</span>
          </div>
          <ProgressBar value={r.value} max={r.max} tone={r.tone ?? 'brand'} label={r.label} />
        </li>
      ))}
    </ul>
  )
}

export const grid = (cols: 2 | 3 | 4 | 5) => ({ 2: 'grid grid-cols-2 gap-3', 3: 'grid grid-cols-2 gap-3 lg:grid-cols-3', 4: 'grid grid-cols-2 gap-3 lg:grid-cols-4', 5: 'grid grid-cols-2 gap-3 lg:grid-cols-5' })[cols]
