import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, parseDate, toDateStr } from '@/lib/format'

export type Kind = 'daily' | 'weekly' | 'monthly'

export function shiftAnchor(anchor: string, kind: Kind, dir: -1 | 1): string {
  if (kind === 'daily') return addDays(anchor, dir)
  if (kind === 'weekly') return addDays(anchor, 7 * dir)
  const d = parseDate(anchor)
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + dir, 1))
}

export function DateNavigator({ kind, anchor, onChange }: { kind: Kind; anchor: string; onChange: (d: string) => void }) {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[kind]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-secondary px-2" aria-label={`Previous ${unit}`} onClick={() => onChange(shiftAnchor(anchor, kind, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input type="date" className="input w-auto" aria-label="Report date" value={anchor} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button className="btn-secondary px-2" aria-label={`Next ${unit}`} onClick={() => onChange(shiftAnchor(anchor, kind, 1))}>
        <ChevronRight className="h-4 w-4" />
      </button>
      <button className="btn-ghost" onClick={() => onChange(toDateStr())} disabled={anchor === toDateStr()}>
        Today
      </button>
    </div>
  )
}
