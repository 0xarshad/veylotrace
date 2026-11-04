import { ApiError } from '@/api/client'

export const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD (never UTC-shifted). */
export function toDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** Local wall-clock datetime for <input type="datetime-local"> (YYYY-MM-DDTHH:MM). */
export function toDateTimeLocal(d: Date = new Date()): string {
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}
/** Combine a date with the current time of day for default datetime values. */
export function dateWithNow(dateStr: string): string {
  const now = new Date()
  return `${dateStr}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
export function fmtDateTime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s.length <= 10 ? `${s}T00:00` : s.replace(' ', 'T'))
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
export function fmtTime(s?: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

let currency = 'INR'
export const setCurrency = (c: string) => {
  currency = c || 'INR'
}
export function money(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  const n = Number(v ?? 0)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: opts.compact ? 0 : 2, notation: opts.compact && Math.abs(n) >= 100000 ? 'compact' : 'standard' }).format(n)
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}
export const num = (v: number | null | undefined, digits = 0) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits })
export function minutes(v: number | null | undefined): string {
  const m = Math.round(Number(v ?? 0))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
export const pct = (v: number | null | undefined) => `${Number(v ?? 0).toFixed(0)}%`
export const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429 && e.retryAfter) return `${e.message} (retry in ${e.retryAfter}s)`
    return e.message
  }
  return 'Something went wrong. Please try again.'
}

export function monthRange(anchor: Date = new Date()): { start: string; end: string } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  return { start: toDateStr(start), end: toDateStr(end) }
}
