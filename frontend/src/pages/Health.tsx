import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { BarsChart, TrendChart } from '@/components/charts/Charts'
import { Card, ErrorState, PageHeader, Spinner, StatCard, Tabs } from '@/components/ui/Common'
import { cardioConfig, gymConfig, homeWorkoutConfig, sleepConfig, stepsConfig, weightConfig } from '@/crud/configs/health'
import { CrudList } from '@/crud/ModuleCrud'
import { addDays, cap, minutes, num, toDateStr } from '@/lib/format'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'gym', label: 'Gym' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'home', label: 'Home workout' },
  { id: 'steps', label: 'Steps' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'weight', label: 'Weight' },
] as const
type TabId = (typeof TABS)[number]['id']

function Overview() {
  const [days, setDays] = useState(30)
  const end = toDateStr()
  const start = addDays(end, -(days - 1))
  const q = useQuery({ queryKey: ['analytics', 'health', start, end], queryFn: () => api<any>('/analytics/health', { query: { start, end } }) })
  const [exercise, setExercise] = useState('')
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const h = q.data
  const names = Object.keys(h.exercise_progression)
  const chosen = exercise || names[0]
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <select className="input w-auto" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Workouts" value={h.workout_count} hint={`${h.workouts_per_week}/week · target ${h.workouts_per_week_target}`} />
        <StatCard label="Workout time" value={minutes(h.workout_minutes)} hint={`${h.workout_days} active days`} />
        <StatCard label="Avg steps" value={num(h.steps_average)} hint={`target ${num(h.steps_target)}`} tone={h.steps_average >= h.steps_target ? 'good' : 'default'} />
        <StatCard label="Avg sleep" value={h.sleep_avg_hours ? `${h.sleep_avg_hours} h` : '—'} hint={`target ${h.sleep_target_hours} h`} tone={h.sleep_avg_hours >= h.sleep_target_hours ? 'good' : 'default'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Workout consistency (per week)"><BarsChart data={h.weekly_frequency} xKey="week" series={[{ key: 'workouts', label: 'Workouts' }]} target={h.workouts_per_week_target} emptyMessage="No workouts logged in this period" /></Card>
        <Card title="Workout duration (min/day)"><BarsChart data={h.workout_minutes_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-green)' }]} emptyMessage="No workouts logged in this period" /></Card>
        <Card title="Daily steps"><TrendChart data={h.steps_daily} series={[{ key: 'steps', label: 'Steps', color: 'var(--chart-series-cyan)' }]} target={h.steps_target} emptyMessage="No steps logged in this period" /></Card>
        <Card title="Sleep (hours)"><BarsChart data={h.sleep_daily} series={[{ key: 'hours', label: 'Hours', color: 'var(--chart-series-purple)' }]} target={h.sleep_target_hours} emptyMessage="No sleep logged in this period" /></Card>
      </div>
      <Card title="Weight journey" action={<span className="text-xs text-slate-500">{h.current_weight_kg == null ? 'No weight logged' : `Current ${num(h.current_weight_kg, 1)} kg`}{h.target_weight_kg == null ? '' : ` · Target ${num(h.target_weight_kg, 1)} kg`}{h.current_body_fat_percent == null ? '' : ` · ${num(h.current_body_fat_percent, 1)}% body fat`}</span>}>
        <TrendChart data={h.weight_daily} series={[{ key: 'weight_kg', label: 'Weight (kg)', color: 'var(--chart-series-amber)' }]} area={false} target={h.target_weight_kg ?? undefined} formatter={(v) => `${num(v, 1)} kg`} emptyMessage="Add a weight entry to start tracking your journey" />
        {h.starting_weight_kg != null && h.current_weight_kg != null && <p className="mt-2 text-xs text-slate-500">Change since starting: {num(h.current_weight_kg - h.starting_weight_kg, 1)} kg · Body fat at signup: {h.profile_body_fat_percent == null ? '—' : `${num(h.profile_body_fat_percent, 1)}%`}</p>}
      </Card>
      <Card
        title="Exercise progression"
        action={names.length > 0 && <select className="input w-auto py-1" aria-label="Exercise" value={chosen} onChange={(e) => setExercise(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select>}
      >
        <TrendChart data={chosen ? h.exercise_progression[chosen] : []} series={[{ key: 'weight_kg', label: 'Weight (kg)', color: 'var(--chart-series-amber)' }]} area={false} formatter={(v) => `${v}kg`} emptyMessage="Log gym exercises with weights to see progression" />
      </Card>
      {Object.keys(h.by_kind).length > 0 && (
        <p className="text-xs text-slate-500">Sessions by type: {Object.entries(h.by_kind).map(([k, v]) => `${cap(k)} ${v}`).join(' · ')}</p>
      )}
    </div>
  )
}

export default function HealthPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) || 'overview'
  const [autoAdd, setAutoAdd] = useState(params.get('add') === '1')
  const set = (t: TabId) => setParams({ tab: t })
  const crud = { gym: gymConfig, cardio: cardioConfig, home: homeWorkoutConfig, steps: stepsConfig, sleep: sleepConfig, weight: weightConfig } as const
  return (
    <>
      <PageHeader title="Health & Fitness" subtitle="Workouts, steps and sleep" />
      <Tabs tabs={[...TABS]} value={tab} onChange={set} />
      {tab === 'overview' ? <Overview /> : <CrudList key={tab} config={crud[tab]} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(false)} />}
    </>
  )
}
