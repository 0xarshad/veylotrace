import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { BarsChart, DonutChart } from '@/components/charts/Charts'
import { Card, EmptyState, ErrorState, PageHeader, ProgressBar, Spinner, StatCard, Tabs } from '@/components/ui/Common'
import { courseConfig, skillConfig, studyConfig } from '@/crud/configs/learning'
import { CrudList } from '@/crud/ModuleCrud'
import { useSettings } from '@/lib/hooks'
import { addDays, fmtDate, minutes, monthRange, num, parseDate, toDateStr } from '@/lib/format'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'study', label: 'Study sessions' },
  { id: 'skills', label: 'Skills' },
  { id: 'courses', label: 'Courses & certifications' },
] as const
type TabId = (typeof TABS)[number]['id']
type Period = 'week' | 'month'

function periodRanges(period: Period, mondayStart: boolean) {
  const now = new Date()
  if (period === 'month') {
    const cur = monthRange(now)
    const prev = monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    return { cur, prev }
  }
  const today = toDateStr(now)
  const dow = parseDate(today).getDay()
  const offset = mondayStart ? (dow + 6) % 7 : dow
  const start = addDays(today, -offset)
  return { cur: { start, end: addDays(start, 6) }, prev: { start: addDays(start, -7), end: addDays(start, -1) } }
}

const daysBetween = (s: string, e: string) => Math.round((parseDate(e).getTime() - parseDate(s).getTime()) / 86_400_000) + 1

function Delta({ cur, prev, unit }: { cur: number; prev: number; unit: 'time' | 'count' }) {
  const diff = cur - prev
  const fmt = (v: number) => (unit === 'time' ? minutes(Math.abs(v)) : num(Math.abs(v)))
  if (diff === 0) return <>same as previous period</>
  return <>{diff > 0 ? '▲' : '▼'} {fmt(diff)} vs previous period</>
}

function Overview() {
  const [period, setPeriod] = useState<Period>('week')
  const settings = useSettings()
  const { cur, prev } = periodRanges(period, settings.data?.week_starts_monday ?? true)
  const load = (r: { start: string; end: string }) => ({ queryKey: ['analytics', 'learning', r.start, r.end], queryFn: () => api<any>('/analytics/learning', { query: r }) })
  const q = useQuery(load(cur))
  const pq = useQuery(load(prev))
  const target = settings.data?.targets?.study_min ?? 0
  const body = () => {
    if (q.isLoading || settings.isLoading) return <Spinner />
    if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
    if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
    const l = q.data
    const p = pq.data
    const days = daysBetween(cur.start, cur.end)
    const goal = target * days
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Study time" value={minutes(l.study_minutes)} hint={p ? <Delta cur={l.study_minutes} prev={p.study_minutes} unit="time" /> : pq.isError ? 'Previous period unavailable' : 'Comparing…'} />
          <StatCard label="Sessions" value={l.study_sessions} hint={p ? <Delta cur={l.study_sessions} prev={p.study_sessions} unit="count" /> : undefined} />
          <StatCard label="Avg per session" value={l.study_sessions ? minutes(l.study_minutes / l.study_sessions) : '—'} />
          <StatCard label="Previous period" value={p ? minutes(p.study_minutes) : '—'} hint={`${fmtDate(prev.start)} – ${fmtDate(prev.end)}`} />
        </div>
        {goal > 0 && (
          <Card title={`Study target (${minutes(target)} / day)`}>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{minutes(l.study_minutes)} of {minutes(goal)}</span>
              <span className="tabular-nums">{Math.round((l.study_minutes / goal) * 100)}%</span>
            </div>
            <ProgressBar value={l.study_minutes} max={goal} label="Study time versus target" />
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Study minutes per day">
            <BarsChart data={l.study_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-blue)' }]} target={target || undefined} formatter={(v) => minutes(v)} emptyMessage="No study sessions in this period" />
          </Card>
          <Card title="Time by subject">
            <DonutChart data={l.by_subject.map((s: any) => ({ name: s.name, value: s.minutes }))} formatter={(v) => minutes(v)} emptyMessage="No study sessions in this period" />
          </Card>
        </div>
        <Card title="Courses in progress" action={<Link to="?tab=courses" className="text-xs text-brand-600 hover:underline">All courses</Link>}>
          {l.courses_in_progress.length === 0 ? (
            <EmptyState title="No courses in progress" hint="Add a course or certification to track its progress." action={<Link to="?tab=courses&add=1" className="btn-primary">Add course</Link>} />
          ) : (
            <ul className="space-y-3">
              {l.courses_in_progress.map((c: any) => (
                <li key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs tabular-nums text-slate-500">{Math.round(c.progress)}%</span>
                  </div>
                  <ProgressBar value={c.progress} label={`${c.name} progress`} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{fmtDate(cur.start)} – {fmtDate(cur.end)}</p>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="Period">
          {(['week', 'month'] as const).map((p) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)} className={`rounded-md px-3 py-1 text-sm font-medium transition ${period === p ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {p === 'week' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>
      {body()}
    </div>
  )
}

export default function LearningPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'overview'
  const [autoAdd, setAutoAdd] = useState(params.get('add') === '1')
  const set = (t: TabId) => setParams({ tab: t })
  const crud = { study: studyConfig, skills: skillConfig, courses: courseConfig } as const
  return (
    <>
      <PageHeader title="Learning & Growth" subtitle="Study sessions, skills and courses" />
      <Tabs tabs={[...TABS]} value={tab} onChange={set} />
      {tab === 'overview' ? <Overview /> : <CrudList key={tab} config={crud[tab]} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(false)} />}
    </>
  )
}
