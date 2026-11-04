import type { CrudConfig, FieldDef, Row } from '@/crud/ModuleCrud'
import { money, num } from '@/lib/format'

export interface Metric {
  key: string
  label: string
  unit: string
  comparator: 'gte' | 'lte'
  default_target: number
}

export const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
export const COMPARATORS = [
  { value: 'gte', label: 'At least (≥)' },
  { value: 'lte', label: 'At most (≤)' },
]
const PER = { daily: 'day', weekly: 'week', monthly: 'month' } as Record<string, string>
export const perUnit = (frequency: string) => PER[frequency] ?? frequency

/** Quick-start templates; only offered when the metric exists in the API catalog. */
export const TEMPLATES = [
  { name: 'No unnecessary spending', metric: 'non_essential_spending', comparator: 'lte', target: 0, frequency: 'daily' },
  { name: 'Complete planned workout', metric: 'workout_sessions', comparator: 'gte', target: 1, frequency: 'daily' },
  { name: 'Meet protein target', metric: 'protein_g', comparator: 'gte', target: 100, frequency: 'daily' },
  { name: 'Meet water target', metric: 'water_ml', comparator: 'gte', target: 2500, frequency: 'daily' },
  { name: 'Read for 20 minutes', metric: 'reading_minutes', comparator: 'gte', target: 20, frequency: 'daily' },
  { name: 'Study for one hour', metric: 'study_minutes', comparator: 'gte', target: 60, frequency: 'daily' },
  { name: 'Reduce screen time', metric: 'screen_minutes', comparator: 'lte', target: 120, frequency: 'daily' },
  { name: 'Complete priority tasks', metric: 'priority_tasks_completed', comparator: 'gte', target: 1, frequency: 'daily' },
] as const
export type Template = (typeof TEMPLATES)[number]

export function formatAmount(value: number, unit: string): string {
  return unit === 'amount' ? money(value) : `${num(value, 1)} ${unit}`
}

export function targetText(c: Row): string {
  if (c.metric === 'manual') return `Check off once per ${perUnit(c.frequency)}`
  return `${c.comparator === 'lte' ? '≤' : '≥'} ${formatAmount(c.target, c.unit ?? '')} per ${perUnit(c.frequency)}`
}

/** Field metadata; the metric options come from GET /challenges/metrics at runtime. */
export function buildChallengeConfig(metrics: Metric[]): CrudConfig {
  const fields: FieldDef[] = [
    { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 160 },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'metric', label: 'What to track', type: 'select', required: true, options: metrics.map((m) => ({ value: m.key, label: m.label })) },
    { name: 'comparator', label: 'Goal type', type: 'select', required: true, options: COMPARATORS, showIf: (v) => v.metric !== 'manual' },
    { name: 'target', label: 'Target', type: 'number', required: true, showIf: (v) => v.metric !== 'manual' },
    { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: FREQUENCIES, default: 'daily' },
    { name: 'start_date', label: 'Start date', type: 'date', required: true },
    { name: 'end_date', label: 'End date (optional)', type: 'date', default: '' },
  ]
  return {
    resource: 'challenges',
    title: 'Challenges',
    singular: 'Challenge',
    fields,
    columns: [
      { header: 'Name', cell: (r) => r.name },
      { header: 'Target', cell: (r) => targetText(r) },
    ],
    search: false,
    duplicable: false,
  }
}

export const challengeConfig: CrudConfig = buildChallengeConfig([])
