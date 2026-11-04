import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Droplets, Plus } from 'lucide-react'
import { api, type ListResponse } from '@/api/client'
import { BarsChart, DonutChart } from '@/components/charts/Charts'
import { Card, ErrorState, PageHeader, ProgressBar, Spinner, StatCard, Tabs } from '@/components/ui/Common'
import { SelectInput, TextInput } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { foodConfig, MEAL_TYPES, mealConfig, savedMealConfig, waterConfig } from '@/crud/configs/nutrition'
import { CrudList, type Row } from '@/crud/ModuleCrud'
import { addDays, errorMessage, num, toDateStr, toDateTimeLocal } from '@/lib/format'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'meals', label: 'Meals' },
  { id: 'saved', label: 'Saved meals' },
  { id: 'foods', label: 'Foods' },
  { id: 'water', label: 'Water' },
] as const
type TabId = (typeof TABS)[number]['id']

const mealTypeNow = () => {
  const h = new Date().getHours()
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}

function useAddWater() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (amount_ml: number) => api('/water', { method: 'POST', body: { logged_at: toDateTimeLocal(), amount_ml } }),
    onSuccess: (_d, ml) => {
      toast.success(`Added ${num(ml)} ml of water.`)
      qc.invalidateQueries()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

function WaterQuickAdd() {
  const add = useAddWater()
  const [custom, setCustom] = useState('')
  const submitCustom = (e: FormEvent) => {
    e.preventDefault()
    const ml = Number(custom)
    if (ml > 0 && ml <= 10000) add.mutate(ml, { onSuccess: () => setCustom('') })
  }
  return (
    <Card title="Log water now" action={<Droplets className="h-4 w-4 text-sky-500" aria-hidden />}>
      <div className="flex flex-wrap items-end gap-2">
        {[250, 500].map((ml) => (
          <button key={ml} className="btn-secondary" disabled={add.isPending} onClick={() => add.mutate(ml)}>
            <Plus className="h-4 w-4" /> {ml} ml
          </button>
        ))}
        <form onSubmit={submitCustom} className="flex items-end gap-2">
          <TextInput label="Custom (ml)" type="number" min={1} max={10000} step="any" value={custom} onChange={(e) => setCustom(e.target.value)} className="w-32" />
          <button className="btn-primary" type="submit" disabled={add.isPending || !(Number(custom) > 0)}>
            Add
          </button>
        </form>
      </div>
    </Card>
  )
}

interface Target {
  key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g' | 'water_ml'
  label: string
  unit: string
  limit?: boolean // a ceiling to stay under, rather than a goal to reach
}
const TARGETS: Target[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', limit: true },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'fibre_g', label: 'Fibre', unit: 'g' },
  { key: 'water_ml', label: 'Water', unit: 'ml' },
]

function TargetCard({ t, actual, target }: { t: Target; actual: number; target: number }) {
  const diff = Math.round(Math.abs(target - actual))
  const over = actual > target
  const wording = t.limit
    ? over ? `${num(diff)} ${t.unit} over target` : `${num(diff)} ${t.unit} under target`
    : over || diff === 0 ? 'Target met' : `${num(diff)} ${t.unit} to reach target`
  const tone = t.limit ? (over ? 'warn' : 'good') : actual >= target ? 'good' : 'default'
  return (
    <StatCard
      label={`${t.label} / day`}
      value={`${num(actual)} ${t.unit}`}
      tone={tone}
      hint={
        <div className="space-y-1.5 pt-1">
          <ProgressBar value={actual} max={target} tone={t.limit && over ? 'warn' : undefined} label={`${t.label} average against target`} />
          <span>Avg {num(actual)} of {num(target)} {t.unit} target · {wording}</span>
        </div>
      }
    />
  )
}

function Overview() {
  const [days, setDays] = useState(7)
  const end = toDateStr()
  const start = addDays(end, -(days - 1))
  const q = useQuery({ queryKey: ['analytics', 'nutrition', start, end], queryFn: () => api<any>('/analytics/nutrition', { query: { start, end } }) })

  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const n = q.data
  const avg = n.daily_average
  const t = n.targets
  const macroKcal = [
    { name: 'Protein', value: avg.protein_g * 4 },
    { name: 'Carbs', value: avg.carbs_g * 4 },
    { name: 'Fat', value: avg.fat_g * 9 },
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Daily averages over {n.days_logged} logged {n.days_logged === 1 ? 'day' : 'days'} of the last {days}.
        </p>
        <select className="input w-auto" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/35 px-4 py-3 text-sm dark:border-slate-700/70 dark:bg-white/[.025]">
        <div>
          <p className="font-medium">{n.target_weight_kg == null ? 'Set a target weight for starter nutrition goals' : `Nutrition goals · ${num(n.target_weight_kg, 1)} kg target weight`}</p>
          <p className="mt-0.5 text-xs text-slate-500">Calories and water stay editable; weight alone does not determine personal calorie or hydration needs.</p>
        </div>
        <Link className="btn-secondary px-3 py-1.5" to="/settings?tab=appearance">Review goals</Link>
      </div>
      <WaterQuickAdd />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TARGETS.map((x) => <TargetCard key={x.key} t={x} actual={avg[x.key]} target={t[x.key]} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Calories per day"><BarsChart data={n.daily} series={[{ key: 'calories', label: 'Calories', color: 'var(--chart-series-orange)' }]} target={t.calories} emptyMessage="No meals logged in this period" /></Card>
        <Card title="Protein per day (g)"><BarsChart data={n.daily} series={[{ key: 'protein_g', label: 'Protein (g)', color: 'var(--chart-series-green)' }]} target={t.protein_g} emptyMessage="No meals logged in this period" /></Card>
        <Card title="Water per day (ml)"><BarsChart data={n.daily} series={[{ key: 'water_ml', label: 'Water (ml)', color: 'var(--chart-series-cyan)' }]} target={t.water_ml} emptyMessage="No water logged in this period" /></Card>
        <Card title="Macro split of the average day (by calories)"><DonutChart data={macroKcal} formatter={(v) => `${num(v)} kcal`} emptyMessage="Log meals to see your macro split" /></Card>
      </div>
      <Card title="Days target met">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Calories within target', v: n.target_days_met.calories },
            { label: 'Protein target reached', v: n.target_days_met.protein },
            { label: 'Water target reached', v: n.target_days_met.water },
          ].map((x) => (
            <div key={x.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{x.label}</span>
                <span className="font-semibold tabular-nums">{x.v} / {n.days_logged}</span>
              </div>
              <div className="mt-1.5"><ProgressBar value={x.v} max={n.days_logged} label={x.label} /></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function LogSavedMeal() {
  const qc = useQueryClient()
  const toast = useToast()
  const [id, setId] = useState('')
  const [type, setType] = useState(mealTypeNow())
  const saved = useQuery({ queryKey: ['saved-meals'], queryFn: () => api<ListResponse<Row>>('/meals', { query: { is_template: 'true', limit: 500 } }) })
  const log = useMutation({
    mutationFn: () => api(`/meals/${id}/duplicate`, { method: 'POST', body: { is_template: false, meal_type: type, eaten_at: toDateTimeLocal() } }),
    onSuccess: () => {
      toast.success('Meal logged for now.')
      setId('')
      qc.invalidateQueries()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const items = saved.data?.items ?? []
  return (
    <Card title="Log a saved meal" className="mb-4">
      {saved.isLoading ? (
        <Spinner />
      ) : saved.isError ? (
        <ErrorState error={saved.error} onRetry={() => saved.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">No saved meals yet — add one below to log it in one click.</p>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (id) log.mutate() }}>
          <SelectInput wrapperClass="min-w-[12rem] flex-1" label="Saved meal" value={id} onChange={(e) => setId(e.target.value)} placeholder="Choose…" options={items.map((m) => ({ value: m.id, label: `${m.name || 'Unnamed'} · ${num(m.totals.calories)} kcal` }))} />
          <SelectInput label="Meal type" value={type} onChange={(e) => setType(e.target.value)} options={MEAL_TYPES} />
          <button className="btn-primary" type="submit" disabled={!id || log.isPending}>{log.isPending ? 'Logging…' : 'Log today'}</button>
        </form>
      )}
    </Card>
  )
}

function LogFoodNow() {
  const qc = useQueryClient()
  const toast = useToast()
  const [id, setId] = useState('')
  const [qty, setQty] = useState('1')
  const [type, setType] = useState(mealTypeNow())
  const foods = useQuery({ queryKey: ['foods-by-use'], queryFn: () => api<ListResponse<Row>>('/foods', { query: { sort: '-use_count', limit: 500 } }) })
  const items = foods.data?.items ?? []
  const food = items.find((f) => String(f.id) === id)
  const log = useMutation({
    mutationFn: () =>
      api('/meals', {
        method: 'POST',
        body: {
          meal_type: type,
          eaten_at: toDateTimeLocal(),
          is_template: false,
          items: [{ food_item_id: food!.id, name: food!.name, serving_size: food!.serving_size, calories: food!.calories, protein_g: food!.protein_g, carbs_g: food!.carbs_g, fat_g: food!.fat_g, fibre_g: food!.fibre_g, quantity: Number(qty) }],
        },
      }),
    onSuccess: () => {
      toast.success(`${food!.name} logged.`)
      setId('')
      setQty('1')
      qc.invalidateQueries()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Card title="Log food now" className="mb-4">
      {foods.isLoading ? (
        <Spinner />
      ) : foods.isError ? (
        <ErrorState error={foods.error} onRetry={() => foods.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Add a food below, then log it here in one step.</p>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (food && Number(qty) > 0) log.mutate() }}>
          <SelectInput wrapperClass="min-w-[12rem] flex-1" label="Food (most used first)" value={id} onChange={(e) => setId(e.target.value)} placeholder="Choose…" options={items.map((f) => ({ value: f.id, label: `${f.name} · ${f.serving_size} · ${num(f.calories)} kcal` }))} />
          <TextInput label="Servings" type="number" min={0.01} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-24" />
          <SelectInput label="Meal type" value={type} onChange={(e) => setType(e.target.value)} options={MEAL_TYPES} />
          <button className="btn-primary" type="submit" disabled={!food || !(Number(qty) > 0) || log.isPending}>{log.isPending ? 'Logging…' : 'Log now'}</button>
        </form>
      )}
    </Card>
  )
}

export default function NutritionPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) || 'overview'
  const [autoAdd, setAutoAdd] = useState(params.get('add') === '1')
  const crud = { meals: mealConfig, saved: savedMealConfig, foods: foodConfig, water: waterConfig } as const
  return (
    <>
      <PageHeader title="Food & Nutrition" subtitle="Meals, foods and water intake" />
      <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'overview' ? (
        <Overview />
      ) : (
        <>
          {tab === 'saved' && <LogSavedMeal />}
          {tab === 'foods' && <LogFoodNow />}
          {tab in crud && <CrudList key={tab} config={crud[tab as keyof typeof crud]} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(false)} />}
        </>
      )}
    </>
  )
}
