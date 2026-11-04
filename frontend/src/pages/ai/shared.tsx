import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '@/api/client'
import { addDays, toDateStr } from '@/lib/format'

export interface Provider {
  id: number
  provider: string
  label: string
  enabled: boolean
  is_default: boolean
  has_key: boolean
  key_hint: string | null
  base_url: string | null
  model: string | null
  params: Record<string, number>
  cloud: boolean
  cloud_consent: boolean
  consent_at: string | null
  last_test_ok: boolean | null
  last_test_at: string | null
  last_error: string | null
}

export interface AIStatus {
  ai_enabled: boolean
  modules: string[]
  available_modules: string[]
  default_provider: Provider | null
  recent_errors: { provider: string; kind: string; error: string | null; at: string }[]
  privacy: { sent: string; external: boolean }
}

export interface CatalogEntry {
  id: string
  label: string
  needs_key: boolean
  cloud: boolean
  supports_base_url: boolean
  base_url_hint: string
  default_model: string
  suggested_models: string[]
  default_params: Record<string, number>
  param_schema: Record<string, [number, number]>
}

export function useAIStatus() {
  return useQuery({ queryKey: ['ai', 'status'], queryFn: () => api<AIStatus>('/ai/status') })
}
export function useProviders() {
  return useQuery({ queryKey: ['ai', 'providers'], queryFn: () => api<Provider[]>('/ai/providers') })
}
export function useCatalog() {
  return useQuery({ queryKey: ['ai', 'catalog'], queryFn: () => api<CatalogEntry[]>('/ai/catalog'), staleTime: 3600_000 })
}

/** Provider selection limited to enabled providers; falls back to the default (never silently to another provider on error). */
export function useProviderChoice() {
  const providers = useProviders()
  const [picked, setPicked] = useState<number | null>(null)
  const enabled = useMemo(() => (providers.data ?? []).filter((p) => p.enabled), [providers.data])
  const fallback = enabled.find((p) => p.is_default) ?? enabled[0]
  const selected = enabled.find((p) => p.id === picked) ?? fallback
  return { query: providers, enabled, selected, setPicked, value: selected?.id ?? '' }
}

export function ProviderSelect({ choice, id }: { choice: ReturnType<typeof useProviderChoice>; id: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>Provider</label>
      <select id={id} className="input" value={choice.value} onChange={(e) => choice.setPicked(Number(e.target.value))} disabled={choice.enabled.length === 0}>
        {choice.enabled.length === 0 && <option value="">No enabled provider</option>}
        {choice.enabled.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}{p.model ? ` · ${p.model}` : ''}{p.is_default ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ExternalDisclosure({ provider }: { provider?: Provider }) {
  if (!provider) return null
  if (!provider.cloud) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {provider.label} runs locally — no data leaves your machine.
      </p>
    )
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Summaries of your selected data modules are sent to {provider.label}.
        {!provider.cloud_consent && <> Consent is still required — <Link to="/ai?tab=providers" className="underline">edit the provider</Link>.</>}
      </span>
    </p>
  )
}

/** Explains why the AI cannot answer yet; returns null when everything is ready. */
export function SetupNotice({ status, providers }: { status?: AIStatus; providers?: Provider[] }) {
  if (!providers || !status) return null
  if (providers.length === 0) {
    return (
      <div className="card mb-4 flex flex-col items-start gap-3 border-brand-200 bg-brand-50/50 p-4 sm:flex-row sm:items-center dark:border-brand-900 dark:bg-brand-950/30">
        <Sparkles className="h-8 w-8 shrink-0 text-brand-600" />
        <div className="flex-1 text-sm">
          <p className="font-semibold">Set up an AI provider to get started</p>
          <p className="mt-0.5 text-slate-600 dark:text-slate-400">
            The assistant is optional — everything else in VeyloTrace works without it. Add Groq, OpenAI, Anthropic, Hugging Face or a local Ollama model to ask questions and generate reports about your own data.
          </p>
        </div>
        <Link to="/ai?tab=providers" className="btn-primary">Add a provider</Link>
      </div>
    )
  }
  const issues: string[] = []
  if (!status.ai_enabled) issues.push('AI analysis is turned off.')
  else if (status.modules.length === 0) issues.push('No data modules are allowed for AI analysis.')
  if (!providers.some((p) => p.enabled)) issues.push('All providers are disabled.')
  if (issues.length === 0) return null
  const privacy = !status.ai_enabled || status.modules.length === 0
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" role="status">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <p className="flex-1">{issues.join(' ')} {privacy ? 'Choose what the AI may read in the Privacy tab.' : 'Enable one in the AI Providers tab.'}</p>
      <Link to={privacy ? '/ai?tab=privacy' : '/ai?tab=providers'} className="btn-secondary">{privacy ? 'Open Privacy' : 'Open AI Providers'}</Link>
    </div>
  )
}

export function canUseAI(status?: AIStatus, providers?: Provider[]): boolean {
  return !!status && !!providers && status.ai_enabled && status.modules.length > 0 && providers.some((p) => p.enabled)
}

export interface Range {
  start: string
  end: string
}
export const defaultRange = (): Range => {
  const t = new Date()
  return { start: toDateStr(new Date(t.getFullYear(), t.getMonth(), 1)), end: toDateStr(t) }
}

export function rangeError(r: Range): string | null {
  if (!r.start || !r.end) return 'Choose both a start and an end date.'
  if (r.end < r.start) return 'The end date must be on or after the start date.'
  if (r.end > addDays(r.start, 366)) return 'The range can be at most one year.'
  return null
}

export function RangePicker({ value, onChange, idPrefix }: { value: Range; onChange: (r: Range) => void; idPrefix: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor={`${idPrefix}-start`}>From</label>
        <input id={`${idPrefix}-start`} type="date" className="input" value={value.start} max={value.end || undefined} onChange={(e) => onChange({ ...value, start: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-end`}>To</label>
        <input id={`${idPrefix}-end`} type="date" className="input" value={value.end} min={value.start || undefined} onChange={(e) => onChange({ ...value, end: e.target.value })} />
      </div>
    </div>
  )
}
