import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, CalendarCheck, ClipboardList, HeartPulse, Settings2, Wallet } from 'lucide-react'
import { api } from '@/api/client'
import { BarsChart, DonutChart, TrendChart } from '@/components/charts/Charts'
import { Card, EmptyState, ErrorState, PageHeader, ProgressBar, Spinner, StatCard } from '@/components/ui/Common'
import { Checkbox } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { addDays, cap, errorMessage, minutes, money, num, pct, toDateStr } from '@/lib/format'
import { useSettings } from '@/lib/hooks'

type Period = 'day' | 'week' | 'month' | 'custom'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
]
const WIDGET_LABELS: Record<string, string> = {
  daily_overview: 'Daily overview',
  financial_overview: 'Financial overview',
  health_overview: 'Health overview',
  productivity_overview: 'Productivity overview',
  lifestyle_overview: 'Lifestyle overview',
  spending_by_category: 'Spending by category',
  budget_vs_actual: 'Budget vs actual',
}
const DASHBOARD_SECTION_ICONS: Record<string, { Icon: typeof CalendarCheck; color: string }> = {
  'Daily overview': { Icon: CalendarCheck, color: 'bg-sky-800 text-white dark:bg-sky-300/15 dark:text-sky-300' },
  'Financial overview': { Icon: Wallet, color: 'bg-emerald-800 text-white dark:bg-emerald-300/15 dark:text-emerald-300' },
  'Health overview': { Icon: HeartPulse, color: 'bg-rose-800 text-white dark:bg-rose-300/15 dark:text-rose-300' },
  'Productivity overview': { Icon: ClipboardList, color: 'bg-cyan-800 text-white dark:bg-cyan-300/15 dark:text-cyan-300' },
  'Lifestyle overview': { Icon: BookOpen, color: 'bg-violet-800 text-white dark:bg-violet-300/15 dark:text-violet-300' },
}

function Section({ title, link, children }: { title: string; link?: string; children: React.ReactNode }) {
  const mark = DASHBOARD_SECTION_ICONS[title]
  return (
    <section className="dashboard-section" aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {mark && <span className={`icon-enter grid h-7 w-7 place-items-center rounded-lg ${mark.color}`} aria-hidden><mark.Icon className="h-4 w-4" /></span>}
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        </div>
        {link && <Link to={link} className="text-xs text-brand-600 hover:underline">Open →</Link>}
      </div>
      {children}
    </section>
  )
}

function Customize({ visible, available }: { visible: string[]; available: string[] }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const save = useMutation({
    mutationFn: (widgets: string[]) => api('/settings', { method: 'PUT', body: { dashboard_widgets: widgets } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const toggle = (w: string, on: boolean) => save.mutate(available.filter((x) => (x === w ? on : visible.includes(x))))
  return (
    <div className="relative">
      <button className="btn-secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Settings2 className="h-4 w-4" /> Customize
      </button>
      {open && (
        <div className="card absolute right-0 z-20 mt-2 w-64 space-y-2 p-3 shadow-lg">
          <p className="text-xs font-medium text-slate-500">Visible cards</p>
          {available.map((w) => <Checkbox key={w} label={WIDGET_LABELS[w] ?? cap(w)} checked={visible.includes(w)} onChange={(on) => toggle(w, on)} />)}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [start, setStart] = useState(addDays(toDateStr(), -29))
  const [end, setEnd] = useState(toDateStr())
  const settings = useSettings()
  const q = useQuery({
    queryKey: ['dashboard', period, period === 'custom' ? start : '', period === 'custom' ? end : ''],
    queryFn: () => api<any>('/dashboard', { query: period === 'custom' ? { period, start, end } : { period } }),
    enabled: period !== 'custom' || (!!start && !!end && start <= end),
  })

  const widgets = settings.data?.dashboard_widgets ?? []
  const show = (w: string) => widgets.includes(w)
  const label = { day: 'today', week: 'this week', month: 'this month', custom: 'selected period' }[period]
  const d = q.data

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Your day and progress at a glance"
        actions={
          <>
            <Link to="/daily" className="btn-primary"><CalendarCheck className="h-4 w-4" /> Daily tracker</Link>
            {settings.data && <Customize visible={widgets} available={settings.data.available_widgets} />}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-white/70 bg-white/40 p-0.5 shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-slate-900/35" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id} className={`rounded-md px-3 py-1.5 text-sm font-medium ${period === p.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input w-auto" aria-label="Start date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input w-auto" aria-label="End date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        {d && <span className="text-xs text-slate-500">{d.range.start} – {d.range.end}</span>}
      </div>

      {q.isLoading || settings.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && (
        <div className="space-y-4">
          {!d.has_data && (
            <Card>
              <EmptyState
                title="Nothing recorded for this period yet"
                hint="Add an expense, meal, workout or task and your dashboard will fill in automatically."
                action={<Link to="/daily" className="btn-primary">Start in the Daily Tracker</Link>}
              />
            </Card>
          )}
          {show('daily_overview') && <DailyOverview o={d.daily_overview} />}
          {show('financial_overview') && <Financial f={d.financial} label={label} showCategory={show('spending_by_category')} showBudget={show('budget_vs_actual')} />}
          {!show('financial_overview') && (show('spending_by_category') || show('budget_vs_actual')) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {show('spending_by_category') && <CategoryCard f={d.financial} />}
              {show('budget_vs_actual') && <BudgetCard f={d.financial} />}
            </div>
          )}
          {show('health_overview') && <Health h={d.health} n={d.nutrition} label={label} />}
          {show('productivity_overview') && <Productivity p={d.productivity} l={d.learning} label={label} />}
          {show('lifestyle_overview') && <Lifestyle l={d.lifestyle} label={label} />}
          {widgets.length === 0 && <Card><EmptyState title="All cards are hidden" hint="Use “Customize” to choose which cards to show." /></Card>}
        </div>
      )}
    </>
  )
}

function DailyOverview({ o }: { o: any }) {
  const t = o.targets
  return (
    <Section title={`Daily overview · ${o.date}`} link="/daily">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Expenses" value={money(o.expenses)} to="/expenses?tab=expenses" />
        <StatCard label="Budget remaining" value={o.budget_remaining == null ? '—' : money(o.budget_remaining)} hint={o.daily_budget == null ? 'No daily budget set' : `of ${money(o.daily_budget)}`} tone={o.budget_remaining != null && o.budget_remaining < 0 ? 'bad' : 'default'} to="/expenses?tab=budgets" />
        <StatCard label="Savings contributed" value={money(o.savings_contributed)} hint="Actual transfers only" to="/expenses?tab=savings" />
        <StatCard label="Workout" value={minutes(o.workout_minutes)} to="/health" />
        <StatCard label="Calories" value={num(o.calories)} hint={`target ${num(t.calories)}`} to="/nutrition" />
        <StatCard label="Protein" value={`${num(o.protein_g)} g`} hint={`target ${num(t.protein_g)} g`} to="/nutrition" />
        <StatCard label="Water" value={`${num(o.water_ml)} ml`} hint={`target ${num(t.water_ml)} ml`} tone={o.water_ml >= t.water_ml ? 'good' : 'default'} to="/nutrition?tab=water" />
        <StatCard label="Tasks completed" value={o.tasks_completed} to="/productivity?tab=tasks" />
        <StatCard label="Study" value={minutes(o.study_minutes)} hint={`target ${minutes(t.study_min)}`} to="/learning" />
        <StatCard label="Reading" value={minutes(o.reading_minutes)} hint={`target ${minutes(t.reading_min)}`} to="/lifestyle?tab=reading" />
      </div>
    </Section>
  )
}

function CategoryCard({ f }: { f: any }) {
  return <Card title="Spending by category"><DonutChart data={f.by_category.map((c: any) => ({ name: c.name, value: c.amount }))} formatter={(v) => money(v)} emptyMessage="No expenses in this period" /></Card>
}

function BudgetCard({ f }: { f: any }) {
  const rows = f.budgets.filter((b: any) => b.period === 'monthly' || b.period === 'custom')
  return (
    <Card title="Budget vs actual">
      {rows.length === 0 ? <EmptyState title="No budgets set" hint="Create a monthly or category budget to compare against actual spending." action={<Link to="/expenses?tab=budgets" className="btn-secondary">Set a budget</Link>} /> : (
        <BarsChart data={rows.map((b: any) => ({ name: b.category, Budget: b.amount, Spent: b.spent }))} xKey="name" series={[{ key: 'Budget', label: 'Budget', color: 'var(--chart-series-neutral)' }, { key: 'Spent', label: 'Spent', color: 'var(--chart-series-blue)' }]} formatter={(v) => money(v, { compact: true })} />
      )}
    </Card>
  )
}

function Financial({ f, label, showCategory, showBudget }: { f: any; label: string; showCategory: boolean; showBudget: boolean }) {
  const bc = f.budget_consumption
  return (
    <Section title="Financial overview" link="/expenses">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Income (${label})`} value={money(f.income_total)} to="/expenses?tab=income" />
        <StatCard label={`Expenditure (${label})`} value={money(f.expenses_total)} hint={`${f.expense_count} transactions`} to="/expenses?tab=expenses" />
        <StatCard label="Savings contributions" value={money(f.savings_contributed)} to="/expenses?tab=savings" />
        <StatCard label="Net cash flow" value={money(f.net_cash_flow)} hint="Income − spending − savings" tone={f.net_cash_flow < 0 ? 'bad' : 'good'} />
      </div>
      <Card className="mt-3" title="Budget consumption">
        {bc ? (
          <div>
            <div className="mb-1 flex justify-between text-sm"><span>{money(bc.spent)} of {money(bc.amount)} ({pct(bc.pct)})</span><span className={bc.remaining < 0 ? 'text-rose-600' : 'text-slate-500'}>{money(bc.remaining)} remaining</span></div>
            <ProgressBar value={bc.spent} max={bc.amount} tone={bc.status === 'over' ? 'bad' : bc.status === 'warning' ? 'warn' : 'brand'} label="Monthly budget consumption" />
          </div>
        ) : <p className="text-sm text-slate-500">No overall monthly budget set. <Link className="text-brand-600 underline" to="/expenses?tab=budgets">Add one</Link> to track consumption.</p>}
      </Card>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {showCategory && <CategoryCard f={f} />}
        {showBudget && <BudgetCard f={f} />}
      </div>
    </Section>
  )
}

function Health({ h, n, label }: { h: any; n: any; label: string }) {
  const weightChange = h.current_weight_kg == null || h.starting_weight_kg == null ? null : h.current_weight_kg - h.starting_weight_kg
  const weightAtTarget = h.current_weight_kg != null && h.target_weight_kg != null && Math.abs(h.current_weight_kg - h.target_weight_kg) < 0.5
  return (
    <Section title="Health overview" link="/health">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Workouts / week" value={h.workouts_per_week} hint={`target ${h.workouts_per_week_target} · ${h.workout_count} ${label}`} to="/health" />
        <StatCard label="Workout time" value={minutes(h.workout_minutes)} hint={`${h.workout_days} active day${h.workout_days === 1 ? '' : 's'} ${label}`} to="/health" />
        <StatCard label="Steps (avg/day)" value={num(h.steps_average)} hint={`target ${num(h.steps_target)}`} tone={h.steps_average >= h.steps_target && h.steps_days ? 'good' : 'default'} to="/health?tab=steps" />
        <StatCard label="Sleep (avg)" value={h.sleep_avg_hours ? `${h.sleep_avg_hours} h` : '—'} hint={`target ${h.sleep_target_hours} h`} to="/health?tab=sleep" />
        <StatCard label="Sleep quality" value={h.sleep_avg_quality == null ? '—' : `${num(h.sleep_avg_quality, 1)} / 5`} hint={h.sleep_nights ? `${h.sleep_nights} nights logged` : 'No sleep ratings logged'} to="/health?tab=sleep" />
        <StatCard label="Calories (avg)" value={num(n.daily_average.calories)} hint={`target ${num(n.targets.calories)}`} to="/nutrition" />
        <StatCard label="Protein (avg)" value={`${num(n.daily_average.protein_g)} g`} hint={`target ${num(n.targets.protein_g)} g`} to="/nutrition" />
        <StatCard label="Carbs (avg)" value={`${num(n.daily_average.carbs_g)} g`} hint={`target ${num(n.targets.carbs_g)} g`} to="/nutrition" />
        <StatCard label="Fat (avg)" value={`${num(n.daily_average.fat_g)} g`} hint={`target ${num(n.targets.fat_g)} g`} to="/nutrition" />
        <StatCard label="Fibre (avg)" value={`${num(n.daily_average.fibre_g)} g`} hint={`target ${num(n.targets.fibre_g)} g`} to="/nutrition" />
        <StatCard label="Water (avg)" value={`${num(n.daily_average.water_ml)} ml`} hint={`target ${num(n.targets.water_ml)} ml`} to="/nutrition?tab=water" />
        <StatCard label="Weight change" value={weightChange == null ? '—' : `${weightChange > 0 ? '+' : ''}${num(weightChange, 1)} kg`} hint={h.current_weight_kg == null ? 'Log a weigh-in to begin' : `Current ${num(h.current_weight_kg, 1)} kg · target ${h.target_weight_kg == null ? 'not set' : `${num(h.target_weight_kg, 1)} kg`}`} tone={weightAtTarget ? 'good' : 'default'} to="/health?tab=weight" />
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Card title="Steps"><TrendChart data={h.steps_daily} series={[{ key: 'steps', label: 'Steps', color: 'var(--chart-series-cyan)' }]} target={h.steps_target} height={180} emptyMessage="No steps logged" /></Card>
        <Card title="Calories"><TrendChart data={n.daily} series={[{ key: 'calories', label: 'Calories', color: 'var(--chart-series-amber)' }]} target={n.targets.calories} height={180} emptyMessage="No meals logged" /></Card>
        <Card title="Weight"><TrendChart data={h.weight_daily} series={[{ key: 'weight_kg', label: 'Weight (kg)', color: 'var(--chart-series-amber)' }]} area={false} target={h.target_weight_kg ?? undefined} formatter={(v) => `${num(v, 1)} kg`} height={180} emptyMessage="No weight logs" /></Card>
        <Card title="Body fat"><TrendChart data={h.weight_daily.filter((w: any) => w.body_fat_percent != null)} series={[{ key: 'body_fat_percent', label: 'Body fat (%)', color: 'var(--chart-series-purple)' }]} area={false} formatter={(v) => `${num(v, 1)}%`} height={180} emptyMessage="No body fat measurements" /></Card>
      </div>
    </Section>
  )
}

function Productivity({ p, l, label }: { p: any; l: any; label: string }) {
  return (
    <Section title="Productivity overview" link="/productivity">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Completed (${label})`} value={p.tasks_completed} to="/productivity?tab=tasks" />
        <StatCard label="Pending" value={p.tasks_pending} hint={p.tasks_overdue ? `${p.tasks_overdue} overdue` : undefined} tone={p.tasks_overdue ? 'warn' : 'default'} to="/productivity?tab=tasks" />
        <StatCard label="Study hours" value={`${(l.study_minutes / 60).toFixed(1)} h`} to="/learning" />
        <StatCard label="Active goals" value={p.goals.length} to="/productivity?tab=goals" />
      </div>
      <Card className="mt-3" title="Goal progress">
        {p.goals.length === 0 ? <p className="text-sm text-slate-500">No active goals. <Link className="text-brand-600 underline" to="/productivity?tab=goals&add=1">Create one</Link>.</p> : (
          <ul className="space-y-3">
            {p.goals.slice(0, 6).map((g: any) => (
              <li key={g.id}>
                <div className="mb-1 flex justify-between text-sm"><span>{g.name}</span><span className="text-slate-500">{pct(g.progress)}</span></div>
                <ProgressBar value={g.progress} label={g.name} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  )
}

function Lifestyle({ l, label }: { l: any; label: string }) {
  return (
    <Section title="Lifestyle overview" link="/lifestyle">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Screen time (${label})`} value={minutes(l.screen_minutes)} hint={`${minutes(l.screen_entertainment_minutes)} entertainment`} to="/lifestyle?tab=screen" />
        <StatCard label="Reading" value={minutes(l.reading_minutes)} hint={`${l.pages_read} pages · ${l.books_in_progress} in progress`} to="/lifestyle?tab=reading" />
        <StatCard label="Books completed" value={l.books_completed} to="/lifestyle?tab=books" />
        <StatCard label="Social & personal" value={l.social_count} hint={l.social_minutes ? minutes(l.social_minutes) : undefined} to="/social" />
      </div>
    </Section>
  )
}
