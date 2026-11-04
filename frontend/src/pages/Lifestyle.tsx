import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { BarsChart, DonutChart } from '@/components/charts/Charts'
import { Card, ErrorState, PageHeader, ProgressBar, Spinner, StatCard, Tabs } from '@/components/ui/Common'
import { bookConfig, habitConfig, readingConfig, screenTimeConfig } from '@/crud/configs/lifestyle'
import { CrudList } from '@/crud/ModuleCrud'
import { addDays, minutes, num, pct, toDateStr } from '@/lib/format'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'books', label: 'Books' },
  { id: 'reading', label: 'Reading' },
  { id: 'screen', label: 'Screen time' },
  { id: 'habits', label: 'Habits' },
] as const
type TabId = (typeof TABS)[number]['id']

function Overview() {
  const [days, setDays] = useState(30)
  const end = toDateStr()
  const start = addDays(end, -(days - 1))
  const q = useQuery({ queryKey: ['analytics', 'lifestyle', start, end], queryFn: () => api<any>('/analytics/lifestyle', { query: { start, end } }) })

  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const l = q.data
  const habitRate = l.habit_entries ? (100 * l.habits_completed) / l.habit_entries : 0
  const productiveShare = l.screen_minutes ? (100 * l.screen_productive_minutes) / l.screen_minutes : 0
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <select className="input w-auto" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reading time" value={minutes(l.reading_minutes)} hint={`${l.books_in_progress} book${l.books_in_progress === 1 ? '' : 's'} in progress`} />
        <StatCard label="Pages read" value={num(l.pages_read)} />
        <StatCard label="Books completed" value={l.books_completed} tone={l.books_completed > 0 ? 'good' : 'default'} />
        <StatCard label="Screen time" value={minutes(l.screen_minutes)} hint={`${minutes(l.screen_productive_minutes)} productive · ${minutes(l.screen_entertainment_minutes)} entertainment`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Reading minutes per day"><BarsChart data={l.reading_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-blue)' }]} emptyMessage="No reading logged in this period" /></Card>
        <Card title="Screen time per day (min)"><BarsChart data={l.screen_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-orange)' }]} emptyMessage="No screen time logged in this period" /></Card>
        <Card title="Productive vs entertainment">
          <DonutChart data={[{ name: 'Productive', value: l.screen_productive_minutes }, { name: 'Entertainment', value: l.screen_entertainment_minutes }]} formatter={(v) => minutes(v)} emptyMessage="No screen time logged in this period" />
          {l.screen_minutes > 0 && <p className="mt-2 text-center text-xs text-slate-500">{pct(productiveShare)} of screen time was productive</p>}
        </Card>
        <Card title="Habit completion">
          {l.habit_entries === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No habit entries in this period.</p>
          ) : (
            <div className="space-y-3 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-semibold tabular-nums">{pct(habitRate)}</span>
                <span className="text-sm text-slate-500">{l.habits_completed} of {l.habit_entries} entries completed</span>
              </div>
              <ProgressBar value={l.habits_completed} max={l.habit_entries} label="Habit completion rate" />
            </div>
          )}
        </Card>
      </div>
      <Card title="Social & personal activity" action={<Link to="/social" className="text-sm text-brand-600 hover:underline dark:text-brand-300">Open Social →</Link>}>
        {l.social_count === 0 ? (
          <p className="text-sm text-slate-500">No social or personal activities logged in this period.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span><span className="text-2xl font-semibold tabular-nums">{l.social_count}</span> {l.social_count === 1 ? 'activity' : 'activities'}</span>
            <span className="text-slate-500">{minutes(l.social_minutes)} total</span>
            {Object.entries(l.social_by_kind).map(([k, v]) => <span key={k} className="text-slate-500">{k.replace(/_/g, ' ')}: {String(v)}</span>)}
          </div>
        )}
      </Card>
    </div>
  )
}

export default function LifestylePage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) || 'overview'
  const [autoAdd, setAutoAdd] = useState(params.get('add') === '1')
  const crud = { books: bookConfig, reading: readingConfig, screen: screenTimeConfig, habits: habitConfig } as const
  return (
    <>
      <PageHeader title="Lifestyle" subtitle="Reading, screen time and habits" />
      <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'overview' || !(tab in crud) ? <Overview /> : <CrudList key={tab} config={crud[tab as keyof typeof crud]} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(false)} />}
    </>
  )
}
