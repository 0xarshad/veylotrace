import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { BarsChart, TrendChart } from '@/components/charts/Charts'
import { Card, ErrorState, PageHeader, Spinner, StatCard, Tabs } from '@/components/ui/Common'
import { cardioConfig, gymConfig, homeWorkoutConfig, sleepConfig, stepsConfig, weightConfig } from '@/crud/configs/health'
import { BODY_PARTS, bodyPartForMuscle, EXERCISES_BY_GROUP, metricForExercise, MUSCLES_BY_BODY_PART } from '@/crud/configs/exerciseCatalog'
import { CrudList } from '@/crud/ModuleCrud'
import { addDays, cap, fmtDate, minutes, num, toDateStr } from '@/lib/format'

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
  const [bodyPart, setBodyPart] = useState('Chest')
  const [muscleGroup, setMuscleGroup] = useState('Chest')
  const [exercise, setExercise] = useState('')
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const h = q.data
  const loggedExerciseRows = Object.entries(h.exercise_progression).flatMap(([name, points]: [string, any]) => points.map((point: any) => ({ name, body_part: point.body_part || bodyPartForMuscle(point.muscle_group || ''), muscle_group: point.muscle_group || 'Unassigned' })))
  const bodyParts = [...new Set([...BODY_PARTS, ...loggedExerciseRows.map((row) => row.body_part)])].sort((a, b) => a.localeCompare(b))
  const musclesInPart = [...new Set([
    ...(MUSCLES_BY_BODY_PART[bodyPart] ?? []),
    ...loggedExerciseRows.filter((row) => row.body_part === bodyPart).map((row) => row.muscle_group),
  ])].sort((a, b) => a.localeCompare(b))
  const chosenMuscle = musclesInPart.includes(muscleGroup) ? muscleGroup : musclesInPart[0] ?? ''
  const exercisesInGroup = [...new Set([
    ...(EXERCISES_BY_GROUP[chosenMuscle] ?? []),
    ...loggedExerciseRows.filter((row) => row.body_part === bodyPart && row.muscle_group === chosenMuscle).map((row) => row.name),
  ])].sort((a, b) => a.localeCompare(b))
  const chosen = exercisesInGroup.includes(exercise) ? exercise : exercisesInGroup[0] ?? ''
  const chosenHistory = chosen ? (h.exercise_progression[chosen] ?? []).filter((point: any) => (point.body_part || bodyPartForMuscle(point.muscle_group || '')) === bodyPart && (point.muscle_group || 'Unassigned') === chosenMuscle) : []
  const progressMetric = metricForExercise(chosen, chosenHistory)
  const metricLabel = progressMetric === 'duration_min' ? 'Time (min)' : progressMetric === 'reps' ? 'Reps' : 'Load (kg)'
  const metricUnit = progressMetric === 'duration_min' ? 'min' : progressMetric === 'reps' ? 'reps' : 'kg'
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
      <Card title="Muscle groups trained this week" action={<span className="text-xs text-slate-500">Week of {h.muscle_groups_week_start}</span>}>
        {h.muscle_groups_this_week?.length ? (
          <div className="space-y-4">
            {Object.entries(h.muscle_groups_this_week.reduce((groups: Record<string, any[]>, item: any) => { const part = item.body_part || bodyPartForMuscle(item.muscle_group); (groups[part] ??= []).push(item); return groups }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([part, muscles]) => (
              <section key={part}>
                <h3 className="mb-2 text-sm font-semibold">{part}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(muscles as any[]).map((item) => (
              <div key={item.muscle_group} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <strong className="text-sm">{item.muscle_group}</strong>
                  <span className="text-xs text-slate-500">{item.sessions} session{item.sessions === 1 ? '' : 's'}</span>
                </div>
                <div className="space-y-2">
                  {item.exercises.map((exercise: any) => (
                    <div key={exercise.name} className="border-t border-slate-200 pt-2 first:border-0 first:pt-0 dark:border-slate-700">
                      <p className="text-sm font-medium">{exercise.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {exercise.logs.map((log: any, index: number) => {
                          const details = log.metric_value == null ? '' : log.metric_type === 'duration_min'
                            ? `${log.sets != null ? `${log.sets} × ` : ''}${num(log.metric_value, 1)} min`
                            : log.metric_type === 'reps'
                              ? `${log.sets != null ? `${log.sets} × ` : ''}${num(log.metric_value, 0)} reps`
                              : `${log.sets != null && log.reps != null ? `${log.sets} × ${log.reps} reps · ` : log.sets != null ? `${log.sets} sets · ` : log.reps != null ? `${log.reps} reps · ` : ''}${num(log.metric_value, 1)} kg`
                          return <span key={`${log.date}-${index}`} className="rounded-md bg-white px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">{fmtDate(log.date)}{details ? ` · ${details}` : ''}</span>
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">No muscle groups logged this week yet. Select a muscle group when adding gym exercises to track your weekly split.</p>}
      </Card>
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
        action={<div className="flex flex-wrap items-center justify-end gap-2"><select className="input w-auto py-1" aria-label="Body part" value={bodyPart} onChange={(e) => { setBodyPart(e.target.value); setMuscleGroup(''); setExercise('') }}>{bodyParts.map((part) => <option key={part}>{part}</option>)}</select><select className="input w-auto py-1" aria-label="Muscle group" value={chosenMuscle} onChange={(e) => { setMuscleGroup(e.target.value); setExercise('') }} disabled={!musclesInPart.length}>{musclesInPart.map((muscle) => <option key={muscle}>{muscle}</option>)}</select><select className="input w-auto py-1" aria-label="Exercise" value={chosen} onChange={(e) => setExercise(e.target.value)} disabled={!exercisesInGroup.length}>{exercisesInGroup.map((name) => <option key={name}>{name}</option>)}</select><span className="text-xs text-slate-500">{metricLabel} · all logged history</span></div>}
      >
        <p className="mb-2 text-xs text-slate-500">{bodyPart} / {chosenMuscle} / {chosen || 'Select an exercise'}</p>
        <TrendChart data={chosenHistory.filter((point: any) => point.metric_type === progressMetric && point.metric_value != null)} series={[{ key: 'metric_value', label: metricLabel, color: 'var(--chart-series-amber)' }]} area={false} formatter={(v) => `${v} ${metricUnit}`} emptyMessage={chosen ? `No ${metricUnit} progression logged for ${chosen} yet` : 'Choose a body part, muscle, and exercise'} />
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
