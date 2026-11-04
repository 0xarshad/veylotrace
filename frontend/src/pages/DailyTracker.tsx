import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Dumbbell, GraduationCap, Droplets, Pencil, Plus, Receipt, Scale, Trash2, Users, Utensils } from 'lucide-react'
import { api } from '@/api/client'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '@/components/ui/Common'
import { TrendChart } from '@/components/charts/Charts'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { expenseConfig, incomeConfig, contributionConfig } from '@/crud/configs/finance'
import { cardioConfig, gymConfig, homeWorkoutConfig, sleepConfig, stepsConfig, weightConfig } from '@/crud/configs/health'
import { habitConfig, readingConfig, screenTimeConfig } from '@/crud/configs/lifestyle'
import { mealConfig, waterConfig } from '@/crud/configs/nutrition'
import { taskConfig } from '@/crud/configs/productivity'
import { studyConfig } from '@/crud/configs/learning'
import { socialConfig } from '@/crud/configs/social'
import { RecordForm, type CrudConfig, type Row } from '@/crud/ModuleCrud'
import { addDays, cap, errorMessage, fmtDate, fmtTime, minutes, money, num, toDateStr } from '@/lib/format'

type Kind = 'expense' | 'income' | 'savings' | 'meal' | 'water' | 'workout' | 'sleep' | 'steps' | 'weight' | 'study' | 'reading' | 'screen' | 'habit' | 'social' | 'task'

const RESOURCE: Record<Kind, string> = {
  expense: 'expenses', income: 'income', savings: 'savings-contributions', meal: 'meals', water: 'water', workout: 'workouts', sleep: 'sleep', steps: 'steps', weight: 'weight',
  study: 'study', reading: 'reading', screen: 'screen-time', habit: 'habits', social: 'social', task: 'tasks',
}
const CONFIG: Record<Exclude<Kind, 'workout'>, CrudConfig> = {
  expense: expenseConfig, income: incomeConfig, savings: contributionConfig, meal: mealConfig, water: waterConfig, sleep: sleepConfig, steps: stepsConfig, weight: weightConfig,
  study: studyConfig, reading: readingConfig, screen: screenTimeConfig, habit: habitConfig, social: socialConfig, task: taskConfig,
}
const WORKOUT: Record<string, CrudConfig> = { gym: gymConfig, cardio: cardioConfig, home: homeWorkoutConfig }

const QUICK: { label: string; icon: typeof Plus; open: { kind: Kind; workout?: string } }[] = [
  { label: 'Add expense', icon: Receipt, open: { kind: 'expense' } },
  { label: 'Add meal', icon: Utensils, open: { kind: 'meal' } },
  { label: 'Add water', icon: Droplets, open: { kind: 'water' } },
  { label: 'Log weight', icon: Scale, open: { kind: 'weight' } },
  { label: 'Add task', icon: CheckCircle2, open: { kind: 'task' } },
  { label: 'Add study session', icon: GraduationCap, open: { kind: 'study' } },
  { label: 'Add reading session', icon: BookOpen, open: { kind: 'reading' } },
  { label: 'Add social activity', icon: Users, open: { kind: 'social' } },
]

function configFor(kind: Kind, row?: Row | null, workout = 'gym'): CrudConfig {
  if (kind === 'workout') return WORKOUT[row?.kind ?? workout] ?? gymConfig
  return CONFIG[kind]
}

export default function DailyTrackerPage() {
  const [day, setDay] = useState(toDateStr())
  const [form, setForm] = useState<{ kind: Kind; row: Row | null; workout: string } | null>(null)
  const [workoutMenu, setWorkoutMenu] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['daily', day], queryFn: () => api<any>('/daily', { query: { date: day } }) })

  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const edit = async (kind: Kind, id: number) => {
    try {
      const row = await api<Row>(`/${RESOURCE[kind]}/${id}`)
      setForm({ kind, row, workout: row.kind ?? 'gym' })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const remove = async (kind: Kind, id: number) => {
    if (!(await confirm({ title: 'Delete entry?', message: 'You can restore it later from its module (“Show deleted”).' }))) return
    act.mutate(() => api(`/${RESOURCE[kind]}/${id}`, { method: 'DELETE' }).then(() => toast.success('Entry deleted.')))
  }
  const toggleTask = (id: number, done: boolean) => act.mutate(() => api(`/tasks/${id}`, { method: 'PATCH', body: { status: done ? 'completed' : 'pending' } }))

  const d = q.data
  const isToday = day === toDateStr()
  const cfg = form ? configFor(form.kind, form.row, form.workout) : null

  return (
    <>
      <PageHeader title="Daily Tracker" subtitle="Everything you did on a single day, in one timeline" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-secondary px-2" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="h-4 w-4" /></button>
        <input type="date" className="input w-auto" aria-label="Date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="btn-secondary px-2" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}><ChevronRight className="h-4 w-4" /></button>
        {!isToday && <button className="btn-ghost" onClick={() => setDay(toDateStr())}>Today</button>}
        <span className="text-sm text-slate-500">{fmtDate(day)}{day > toDateStr() ? ' · upcoming' : ''}</span>
      </div>

      <Card className="mb-4" title="Quick add">
        <div className="flex flex-wrap gap-2">
          {QUICK.slice(0, 2).map((a) => <button key={a.label} className="btn-secondary" onClick={() => setForm({ ...a.open, row: null, workout: 'gym' })}><a.icon className="h-4 w-4" />{a.label}</button>)}
          <div className="relative">
            <button className="btn-secondary" aria-expanded={workoutMenu} onClick={() => setWorkoutMenu(!workoutMenu)}><Dumbbell className="h-4 w-4" />Add workout</button>
            {workoutMenu && (
              <div className="card absolute left-0 z-20 mt-1 w-40 p-1 shadow-lg">
                {[['gym', 'Gym'], ['cardio', 'Cardio'], ['home', 'Home workout']].map(([k, l]) => (
                  <button key={k} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setWorkoutMenu(false); setForm({ kind: 'workout', row: null, workout: k }) }}>{l}</button>
                ))}
              </div>
            )}
          </div>
          {QUICK.slice(2).map((a) => <button key={a.label} className="btn-secondary" onClick={() => setForm({ ...a.open, row: null, workout: 'gym' })}><a.icon className="h-4 w-4" />{a.label}</button>)}
        </div>
      </Card>

      <DailyProgress day={day} />

      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && (
        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          <div className="min-h-0 lg:col-span-2">
            <Card title={`Timeline (${d.items.length})`} padded={false} className="flex h-[50vh] min-h-[24rem] flex-col [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1 [&>div:last-child]:flex-col">
              {d.items.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-4">
                  <EmptyState title="Nothing recorded for this day" hint="Use Quick add above to log an expense, meal, workout, water, task and more." />
                </div>
              ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100 pr-1 dark:divide-slate-800">
                  {d.items.map((it: any) => {
                    const kind = it.type as Kind
                    return (
                      <li key={`${it.type}-${it.id}`} className="flex items-center gap-3 px-4 py-2.5">
                        {kind === 'task' ? (
                          <input type="checkbox" className="h-4 w-4 rounded" checked={it.status === 'done'} onChange={(e) => toggleTask(it.id, e.target.checked)} aria-label={`Mark ${it.title} ${it.status === 'done' ? 'pending' : 'completed'}`} />
                        ) : it.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}
                        <span className="w-12 shrink-0 text-xs tabular-nums text-slate-500">{['steps', 'screen', 'habit', 'weight'].includes(kind) || (kind === 'task' && !it.time?.slice(11, 16)) ? '' : fmtTime(it.time)}</span>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-sm font-medium ${kind === 'task' && it.status === 'done' ? 'text-slate-400 line-through' : ''}`}>{it.title}</div>
                          <div className="truncate text-xs text-slate-500">{it.detail}</div>
                        </div>
                        <Badge tone={it.status === 'pending' ? 'amber' : 'slate'}>{cap(kind)}{it.status === 'pending' ? ' · pending' : ''}</Badge>
                        <div className="flex">
                          <button className="btn-ghost px-2 py-1" aria-label={`Edit ${it.title}`} onClick={() => edit(kind, it.id)}><Pencil className="h-4 w-4" /></button>
                          <button className="btn-ghost px-2 py-1 text-rose-600" aria-label={`Delete ${it.title}`} onClick={() => remove(kind, it.id)}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Tracking checklist">
              {d.incomplete.length === 0 ? <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Everything tracked for this day.</p> : (
                <ul className="space-y-2">
                  {d.incomplete.map((m: any) => (
                    <li key={m.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400"><AlertCircle className="h-4 w-4" />{m.label}</span>
                      <Link className="text-xs text-brand-600 hover:underline" to={m.link}>Open</Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">Missing entries mean “not recorded”, not “didn’t happen”.</p>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Spent" value={money(d.overview.expenses)} to="/expenses" />
              <StatCard label="Calories" value={num(d.overview.calories)} hint={`of ${num(d.overview.targets.calories)}`} to="/nutrition" />
              <StatCard label="Workout" value={minutes(d.overview.workout_minutes)} to="/health" />
              <StatCard label="Tasks" value={`${d.completed} done`} hint={`${d.pending} pending`} />
            </div>
          </div>
        </div>
      )}

      {cfg && form && (
        <RecordForm config={cfg} open editing={form.row} dateHint={day} onClose={() => setForm(null)} />
      )}
    </>
  )
}

function DailyProgress({ day }: { day: string }) {
  const [span, setSpan] = useState<7 | 30>(7)
  const start = addDays(day, -(span - 1))
  const trends = useQuery({
    queryKey: ['daily-progress', day, span],
    queryFn: () => api<any>('/dashboard', { query: { period: 'custom', start, end: day } }),
    enabled: !!day && start <= day,
    staleTime: 30_000,
  })
  const d = trends.data
  const nutritionDaily = (d?.nutrition.daily ?? []).map((r: Row) => ({
    date: r.date,
    calories: d.nutrition.targets.calories ? 100 * r.calories / d.nutrition.targets.calories : 0,
    protein: d.nutrition.targets.protein_g ? 100 * r.protein_g / d.nutrition.targets.protein_g : 0,
    carbs: d.nutrition.targets.carbs_g ? 100 * r.carbs_g / d.nutrition.targets.carbs_g : 0,
    fat: d.nutrition.targets.fat_g ? 100 * r.fat_g / d.nutrition.targets.fat_g : 0,
    fibre: d.nutrition.targets.fibre_g ? 100 * r.fibre_g / d.nutrition.targets.fibre_g : 0,
    water: d.nutrition.targets.water_ml ? 100 * r.water_ml / d.nutrition.targets.water_ml : 0,
  }))
  return (
    <Card className="mb-4" title="Daily progress graphs" action={
      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="Chart range">
        {([7, 30] as const).map((n) => <button key={n} className={`rounded px-2.5 py-1 text-xs font-medium ${span === n ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`} aria-pressed={span === n} onClick={() => setSpan(n)}>{n} days</button>)}
      </div>
    }>
      <p className="mb-3 text-xs text-slate-500">Daily totals ending {fmtDate(day)}. Select a chart range to compare food, spending, activity, tasks, and learning.</p>
      {trends.isLoading ? <Spinner label="Loading daily progress" /> : trends.isError ? <ErrorState error={trends.error} onRetry={() => trends.refetch()} /> : d && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <TrendPanel title="Expenses and income" link="/expenses" data={d.financial.daily.map((r: Row, i: number) => ({ date: r.date, expenses: r.amount, income: d.financial.income_daily[i]?.amount ?? 0 }))} series={[{ key: 'expenses', label: 'Expenses', color: 'var(--chart-series-red)' }, { key: 'income', label: 'Income', color: 'var(--chart-series-green)' }]} formatter={(v) => money(v, { compact: true })} />
          <TrendPanel title="Nutrition · daily target progress" link="/nutrition" data={nutritionDaily} series={[{ key: 'calories', label: 'Calories', color: 'var(--chart-series-amber)' }, { key: 'protein', label: 'Protein', color: 'var(--chart-series-purple)' }, { key: 'carbs', label: 'Carbs', color: 'var(--chart-series-blue)' }, { key: 'fat', label: 'Fat', color: 'var(--chart-series-red)' }, { key: 'fibre', label: 'Fibre', color: 'var(--chart-series-teal)' }, { key: 'water', label: 'Water', color: 'var(--chart-series-cyan)' }]} target={100} formatter={(v) => `${Math.round(v)}%`} />
          <TrendPanel title="Steps" link="/health?tab=steps" data={d.health.steps_daily} series={[{ key: 'steps', label: 'Steps', color: 'var(--chart-series-cyan)' }]} target={d.health.steps_target} formatter={(v) => num(v)} />
          <TrendPanel title="Workout minutes" link="/health" data={d.health.workout_minutes_daily} series={[{ key: 'minutes', label: 'Workout minutes', color: 'var(--chart-series-green)' }]} formatter={(v) => `${Math.round(v)} min`} />
          <TrendPanel title="Tasks completed" link="/productivity?tab=tasks" data={d.productivity.completed_daily} series={[{ key: 'completed', label: 'Completed tasks', color: 'var(--chart-series-purple)' }]} formatter={(v) => `${Math.round(v)}`} />
          <TrendPanel title="Study minutes" link="/learning" data={d.learning.study_daily} series={[{ key: 'minutes', label: 'Study minutes', color: 'var(--chart-series-blue)' }]} formatter={(v) => `${Math.round(v)} min`} />
          <TrendPanel title="Reading and screen time" link="/lifestyle" data={d.lifestyle.reading_daily.map((r: Row, i: number) => ({ date: r.date, reading: r.minutes, screen: d.lifestyle.screen_daily[i]?.minutes ?? 0 }))} series={[{ key: 'reading', label: 'Reading', color: 'var(--chart-series-teal)' }, { key: 'screen', label: 'Screen time', color: 'var(--chart-series-orange)' }]} formatter={(v) => `${Math.round(v)} min`} />
          <TrendPanel title="Social activities" link="/social" data={d.lifestyle.social_daily} series={[{ key: 'count', label: 'Activities', color: 'var(--chart-series-purple)' }]} formatter={(v) => `${Math.round(v)}`} />
          <TrendPanel title="Habits completed" link="/lifestyle?tab=habits" data={d.lifestyle.habits_daily} series={[{ key: 'completed', label: 'Completed', color: 'var(--chart-series-amber)' }, { key: 'entries', label: 'Logged', color: 'var(--chart-series-neutral)' }]} formatter={(v) => `${Math.round(v)}`} />
        </div>
      )}
    </Card>
  )
}

function TrendPanel({ title, link, data, series, target, formatter }: { title: string; link: string; data: Row[]; series: { key: string; label: string; color: string }[]; target?: number; formatter?: (v: number) => string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200/80 p-3 dark:border-slate-700/70">
    <div className="mb-1 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3><Link to={link} className="shrink-0 text-xs text-brand-600 hover:underline">Open →</Link></div>
    <TrendChart data={data} series={series} height={180} area={false} target={target} formatter={formatter} />
  </div>
}
