import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Moon, Sun } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/client'
import { Card, ErrorState, Spinner } from '@/components/ui/Common'
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, num } from '@/lib/format'
import { useSettings, type Settings } from '@/lib/hooks'
import { applyTheme, type ThemePref } from '@/lib/theme'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SGD', 'AED', 'NZD', 'ZAR', 'BRL', 'MXN', 'SEK', 'KRW']

const TARGET_META: Record<string, { label: string; unit: string; step?: number }> = {
  calories: { label: 'Calories', unit: 'kcal' },
  protein_g: { label: 'Protein', unit: 'g' },
  carbs_g: { label: 'Carbohydrates', unit: 'g' },
  fat_g: { label: 'Fat', unit: 'g' },
  fibre_g: { label: 'Fibre', unit: 'g' },
  water_ml: { label: 'Water', unit: 'ml' },
  steps: { label: 'Steps', unit: 'steps/day' },
  sleep_hours: { label: 'Sleep', unit: 'hours/night', step: 0.5 },
  study_min: { label: 'Study time', unit: 'min/day' },
  reading_min: { label: 'Reading time', unit: 'min/day' },
  workouts_per_week: { label: 'Workouts', unit: 'per week' },
}

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
]

function Preferences({ s }: { s: Settings }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [currency, setCurrency] = useState(s.currency)
  const [monday, setMonday] = useState(s.week_starts_monday)
  useEffect(() => {
    setCurrency(s.currency)
    setMonday(s.week_starts_monday)
  }, [s.currency, s.week_starts_monday])
  const options = Array.from(new Set([s.currency, ...CURRENCIES])).map((c) => ({ value: c, label: c }))

  const theme = useMutation({
    mutationFn: (t: ThemePref) => api('/settings', { method: 'PUT', body: { theme: t } }),
    onMutate: (t) => applyTheme(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
    onError: (e) => {
      applyTheme(s.theme)
      toast.error(errorMessage(e))
    },
  })
  const prefs = useMutation({
    mutationFn: () => api('/settings', { method: 'PUT', body: { currency, week_starts_monday: monday } }),
    onSuccess: () => {
      qc.invalidateQueries()
      toast.success('Preferences saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Card title="Appearance & regional">
      <div className="max-w-md space-y-4">
        <fieldset>
          <legend className="label">Theme</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={s.theme === id}
                onClick={() => theme.mutate(id)}
                className={clsx('flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm', s.theme === id ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' : 'border-slate-200 dark:border-slate-700')}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </fieldset>
        <SelectInput label="Currency" options={options} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <Checkbox label="Week starts on Monday" checked={monday} onChange={setMonday} help="Affects weekly charts, reviews and streaks." />
        <button className="btn-primary" onClick={() => prefs.mutate()} disabled={prefs.isPending || (currency === s.currency && monday === s.week_starts_monday)}>
          {prefs.isPending ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </Card>
  )
}

function Targets({ s }: { s: Settings }) {
  const qc = useQueryClient()
  const toast = useToast()
  const keys = Object.keys(s.targets)
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => setVals(Object.fromEntries(Object.entries(s.targets).map(([k, v]) => [k, String(v)]))), [s.targets])

  const invalid = (k: string) => vals[k] === '' || !Number.isFinite(Number(vals[k])) || Number(vals[k]) < 0 || Number(vals[k]) > 1_000_000
  const hasError = keys.some(invalid)
  const dirty = keys.some((k) => Number(vals[k]) !== s.targets[k])
  const suggestions = s.suggested_nutrition_targets

  const save = useMutation({
    mutationFn: () => api('/settings', { method: 'PUT', body: { targets: Object.fromEntries(keys.map((k) => [k, Number(vals[k])])) } }),
    onSuccess: () => {
      qc.invalidateQueries()
      toast.success('Targets saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Card title="Daily targets">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!hasError) save.mutate() }}>
        <div className="space-y-2 text-xs text-slate-500">
          <p>{suggestions
            ? `Editable adult starter goals use your ${num(s.target_weight_kg, 1)} kg target weight and current calorie goal. Protein uses a general 0.8 g/kg reference; carbs, fat and fibre are estimated from calories. Calories and water remain as you set them because weight alone cannot determine personal needs.`
            : 'Set a target weight in Body profile to get starter macro and fibre goals. Calories and water remain editable here.'}</p>
          <button type="button" className="btn-secondary px-3 py-1.5" disabled={!suggestions} onClick={() => suggestions && setVals({ ...vals, ...Object.fromEntries(Object.entries(suggestions).map(([k, v]) => [k, String(v)])) })}>Use target-weight starter goals</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((k) => {
            const meta = TARGET_META[k] ?? { label: k.replace(/_/g, ' '), unit: '' }
            return (
              <TextInput
                key={k}
                label={`${meta.label}${meta.unit ? ` (${meta.unit})` : ''}`}
                type="number"
                min={0}
                max={1_000_000}
                step={meta.step ?? 'any'}
                inputMode="decimal"
                value={vals[k] ?? ''}
                error={vals[k] !== undefined && invalid(k) ? 'Enter a number between 0 and 1,000,000.' : undefined}
                onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
              />
            )
          })}
        </div>
        <button className="btn-primary" disabled={save.isPending || hasError || !dirty}>{save.isPending ? 'Saving…' : 'Save targets'}</button>
      </form>
    </Card>
  )
}

function BodyProfile({ s }: { s: Settings }) {
  const qc = useQueryClient()
  const toast = useToast()
  const profile = {
    height_cm: s.height_cm,
    starting_weight_kg: s.starting_weight_kg,
    body_fat_percent: s.body_fat_percent,
    target_weight_kg: s.target_weight_kg,
  }
  const [values, setValues] = useState<Record<keyof typeof profile, string>>({
    height_cm: '', starting_weight_kg: '', body_fat_percent: '', target_weight_kg: '',
  })
  useEffect(() => setValues(Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v == null ? '' : String(v)])) as typeof values), [s.height_cm, s.starting_weight_kg, s.body_fat_percent, s.target_weight_kg])
  const labels = {
    height_cm: ['Height', 'cm', 81, 249.9],
    starting_weight_kg: ['Starting weight', 'kg', 20.1, 499.9],
    body_fat_percent: ['Body fat', '%', 1, 75],
    target_weight_kg: ['Target weight', 'kg', 20.1, 499.9],
  } as const
  const invalid = (k: keyof typeof profile) => values[k] !== '' && (!Number.isFinite(Number(values[k])) || Number(values[k]) < labels[k][2] || Number(values[k]) > labels[k][3])
  const dirty = (Object.keys(profile) as (keyof typeof profile)[]).some((k) => values[k] !== (profile[k] == null ? '' : String(profile[k])))
  const height = Number(values.height_cm)
  const suggested = Number.isFinite(height) && height > 80 ? Number((21.7 * (height / 100) ** 2).toFixed(1)) : null
  const save = useMutation({
    mutationFn: () => api('/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) }),
    onSuccess: () => { qc.invalidateQueries(); toast.success('Body profile saved') },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Card title="Body profile & weight goals">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!Object.keys(profile).some((k) => invalid(k as keyof typeof profile))) save.mutate() }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
            <TextInput key={k} label={`${labels[k][0]} (${labels[k][1]})`} type="number" min={labels[k][2]} max={labels[k][3]} step="0.1" value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} error={invalid(k) ? 'Enter a value within the shown range.' : undefined} />
          ))}
        </div>
        {suggested != null && <p className="text-xs text-slate-500">Suggested reference target at BMI 21.7: {suggested} kg. General adult BMI reference only.</p>}
        <button className="btn-primary" disabled={save.isPending || !dirty || (Object.keys(profile) as (keyof typeof profile)[]).some(invalid)}>{save.isPending ? 'Saving…' : 'Save body profile'}</button>
      </form>
    </Card>
  )
}

export function AppearanceTab() {
  const q = useSettings()
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <div className="space-y-4">
      <Preferences s={q.data!} />
      <BodyProfile s={q.data!} />
      <Targets s={q.data!} />
    </div>
  )
}
