import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Bot, CalendarCheck, ClipboardList, GraduationCap, HeartPulse, Inbox, LayoutDashboard, Loader2, PieChart, Settings, Trophy, Utensils, Users, Wallet, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { ApiError } from '@/api/client'

const PAGE_HEADERS: Record<string, { Icon: LucideIcon; tone: string }> = {
  Dashboard: { Icon: LayoutDashboard, tone: 'from-brand-400 to-brand-700 text-white shadow-brand-500/20' },
  'Daily Tracker': { Icon: CalendarCheck, tone: 'from-sky-700 to-blue-900 text-white shadow-sky-900/15 dark:from-sky-300 dark:to-blue-500 dark:text-slate-950' },
  'Health & Fitness': { Icon: HeartPulse, tone: 'from-rose-700 to-pink-900 text-white shadow-rose-900/15 dark:from-rose-300 dark:to-pink-500 dark:text-slate-950' },
  'Expenses & Savings': { Icon: Wallet, tone: 'from-emerald-700 to-teal-900 text-white shadow-emerald-900/15 dark:from-emerald-300 dark:to-teal-500 dark:text-slate-950' },
  'Food & Nutrition': { Icon: Utensils, tone: 'from-amber-700 to-orange-900 text-white shadow-amber-900/15 dark:from-amber-300 dark:to-orange-500 dark:text-slate-950' },
  Lifestyle: { Icon: BookOpen, tone: 'from-violet-700 to-purple-900 text-white shadow-violet-900/15 dark:from-violet-300 dark:to-purple-500 dark:text-slate-950' },
  Productivity: { Icon: ClipboardList, tone: 'from-cyan-700 to-sky-900 text-white shadow-cyan-900/15 dark:from-cyan-300 dark:to-sky-500 dark:text-slate-950' },
  'Learning & Growth': { Icon: GraduationCap, tone: 'from-indigo-700 to-blue-900 text-white shadow-indigo-900/15 dark:from-indigo-300 dark:to-blue-500 dark:text-slate-950' },
  'Social & Personal': { Icon: Users, tone: 'from-fuchsia-700 to-pink-900 text-white shadow-fuchsia-900/15 dark:from-fuchsia-300 dark:to-pink-500 dark:text-slate-950' },
  Challenges: { Icon: Trophy, tone: 'from-amber-800 to-yellow-900 text-white shadow-amber-900/15 dark:from-amber-300 dark:to-yellow-500 dark:text-slate-950' },
  'Reports & Analytics': { Icon: PieChart, tone: 'from-teal-700 to-cyan-900 text-white shadow-teal-900/15 dark:from-teal-300 dark:to-cyan-500 dark:text-slate-950' },
  'AI Assistant': { Icon: Bot, tone: 'from-purple-700 to-indigo-900 text-white shadow-purple-900/15 dark:from-purple-300 dark:to-indigo-500 dark:text-slate-950' },
  Settings: { Icon: Settings, tone: 'from-slate-700 to-slate-950 text-white shadow-slate-900/15 dark:from-slate-300 dark:to-slate-500 dark:text-slate-950' },
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  )
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : 'Something went wrong while loading this data.'
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">
      {msg}
      {onRetry && (
        <button className="ml-3 underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const page = PAGE_HEADERS[title]
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {page && <div className={`icon-enter grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-md ${page.tone}`} aria-hidden><page.Icon className="h-5 w-5" strokeWidth={2.25} /></div>}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-[1.8rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, action, children, className, padded = true }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100/80 px-4 py-3 dark:border-slate-800/80">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function StatCard({ label, value, hint, to, tone = 'default', icon }: { label: string; value: ReactNode; hint?: ReactNode; to?: string; tone?: 'default' | 'good' | 'warn' | 'bad'; icon?: ReactNode }) {
  const toneCls = { default: '', good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' }[tone]
  const body = (
    <div className="card group h-full p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg dark:hover:border-brand-800">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>{label}</span>
        {icon ?? (to && <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />)}
      </div>
      <div className={clsx('mt-2 text-2xl font-bold tracking-tight tabular-nums', toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
  return to ? (
    <Link to={to} className="block h-full" aria-label={`${label}: open details`}>
      {body}
    </Link>
  ) : (
    body
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    red: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  }[tone]
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', t)}>{children}</span>
}

export function ProgressBar({ value, max = 100, tone, label }: { value: number; max?: number; tone?: 'brand' | 'good' | 'warn' | 'bad'; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const auto = tone ?? (pct >= 100 ? 'good' : 'brand')
  const color = { brand: 'bg-brand-500', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' }[auto]
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className={clsx('h-full rounded-full transition-[width] duration-500 ease-out', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition', value === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
