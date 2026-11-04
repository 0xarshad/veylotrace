import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/api/client'
import { Modal } from '@/components/ui/Modal'
import { Checkbox, Field } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/format'
import type { CatalogEntry, Provider } from './shared'

const INTEGER_PARAMS = new Set(['max_tokens', 'num_ctx', 'num_predict'])
const PARAM_LABELS: Record<string, string> = {
  temperature: 'Temperature',
  max_tokens: 'Max output tokens',
  top_p: 'Top P',
  num_ctx: 'Context window (tokens)',
  num_predict: 'Max output tokens',
}
const stepFor = (k: string, hi: number) => (INTEGER_PARAMS.has(k) ? (hi > 20000 ? 256 : 16) : hi <= 1 ? 0.01 : 0.05)

interface Props {
  catalog: CatalogEntry[]
  providers: Provider[]
  editing: Provider | null
  onClose: () => void
}

export function ProviderDialog({ catalog, providers, editing, onClose }: Props) {
  const qc = useQueryClient()
  const toast = useToast()
  const available = editing ? catalog.filter((c) => c.id === editing.provider) : catalog.filter((c) => !providers.some((p) => p.provider === c.id))
  const [providerId, setProviderId] = useState(available[0]?.id ?? '')
  const entry = catalog.find((c) => c.id === providerId)

  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState(editing?.base_url ?? '')
  const [model, setModel] = useState(editing?.model ?? '')
  const [params, setParams] = useState<Record<string, number>>(editing?.params ?? {})
  const [enabled, setEnabled] = useState(editing?.enabled ?? true)
  const [makeDefault, setMakeDefault] = useState(providers.length === 0)
  const [consent, setConsent] = useState(editing?.cloud_consent ?? false)
  const [models, setModels] = useState<string[]>([])
  const [modelsNote, setModelsNote] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const isCloud = editing ? editing.cloud : !!entry?.cloud
  const value = (k: string) => params[k] ?? entry?.default_params[k] ?? entry?.param_schema[k]?.[0] ?? 0
  const keyShort = apiKey !== '' && apiKey.length < 8

  const close = () => {
    setApiKey('')
    onClose()
  }

  const save = useMutation({
    mutationFn: () => {
      const sendParams: Record<string, number> = {}
      for (const k of Object.keys(entry!.param_schema)) sendParams[k] = Number(value(k))
      const common = { model: model.trim() || undefined, params: sendParams, enabled, cloud_consent: isCloud ? consent : undefined, base_url: entry!.supports_base_url ? baseUrl.trim() : undefined }
      if (editing) {
        return api<Provider>(`/ai/providers/${editing.id}`, {
          method: 'PATCH',
          body: { ...common, ...(apiKey ? { api_key: apiKey } : {}), ...(clearKey && !entry!.needs_key ? { clear_key: true } : {}) },
        })
      }
      return api<Provider>('/ai/providers', {
        method: 'POST',
        body: { ...common, provider: entry!.id, base_url: common.base_url || undefined, cloud_consent: isCloud ? consent : false, make_default: makeDefault, ...(apiKey ? { api_key: apiKey } : {}) },
      })
    },
    onSuccess: () => {
      setApiKey('') // never keep the secret in memory longer than needed
      qc.invalidateQueries({ queryKey: ['ai'] })
      toast.success(editing ? 'Provider updated' : 'Provider added')
      onClose()
    },
    onError: (e: any) => {
      setError(errorMessage(e))
      setFieldErrors(typeof e?.fieldErrors === 'function' ? e.fieldErrors() : {})
    },
  })

  const loadModels = async () => {
    if (!editing) return
    setLoadingModels(true)
    setModelsNote('')
    try {
      const res = await api<{ models: string[]; source: string; warning?: string }>(`/ai/providers/${editing.id}/models`)
      setModels(res.models)
      setModelsNote(res.source === 'provider' ? `${res.models.length} models loaded from the provider.` : `Showing suggested models${res.warning ? ` — ${res.warning}` : ''}`)
    } catch (e) {
      setModelsNote(errorMessage(e))
    } finally {
      setLoadingModels(false)
    }
  }

  const submit = () => {
    setError(null)
    setFieldErrors({})
    if (!entry) return
    if (!editing && entry.needs_key && !apiKey) return setFieldErrors({ api_key: 'An API key is required for this provider.' })
    if (keyShort) return setFieldErrors({ api_key: 'Key looks too short.' })
    save.mutate()
  }

  const modelOptions = Array.from(new Set([...(entry?.suggested_models ?? []), ...models]))

  return (
    <Modal
      open
      onClose={close}
      title={editing ? `Edit ${editing.label}` : 'Add AI provider'}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={close} type="button">Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!entry || save.isPending} type="button">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save changes' : 'Add provider'}
          </button>
        </>
      }
    >
      {!entry ? (
        <p className="text-sm text-slate-500">All supported providers are already configured. Edit an existing one instead.</p>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit() }} autoComplete="off">
          {!editing && (
            <div>
              <label className="label" htmlFor="prov-kind">Provider</label>
              <select id="prov-kind" className="input" value={providerId} onChange={(e) => { setProviderId(e.target.value); setModel(''); setParams({}); setBaseUrl(''); setConsent(false) }}>
                {available.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          )}
          <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{providerNote(entry)}</p>

          {(entry.needs_key || editing?.has_key) && (
            <Field label={entry.needs_key ? 'API key / token' : 'API key / token (optional)'} htmlFor="prov-key" error={fieldErrors.api_key} help={editing?.has_key ? `Leave blank to keep the saved key (${editing.key_hint ?? 'saved'}). Enter a new one to replace it.` : undefined}>
              <input
                id="prov-key"
                type="password"
                className="input"
                autoComplete="new-password"
                spellCheck={false}
                value={apiKey}
                placeholder={editing?.has_key ? 'Leave blank to keep the saved key' : ''}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
          )}
          {editing?.has_key && !entry.needs_key && <Checkbox label="Remove the saved key" checked={clearKey} onChange={setClearKey} />}

          {entry.supports_base_url && (
            <Field label="Base URL" htmlFor="prov-url" error={fieldErrors.base_url} help={entry.id === 'ollama' ? 'Default: http://localhost:11434. A remote host counts as external.' : entry.base_url_hint}>
              <input id="prov-url" className="input" inputMode="url" value={baseUrl} placeholder={entry.id === 'ollama' ? 'http://localhost:11434' : 'Optional'} onChange={(e) => setBaseUrl(e.target.value)} />
            </Field>
          )}

          <Field label="Model" htmlFor="prov-model" help={editing ? undefined : `Default: ${entry.default_model || 'provider default'}. Save the provider first to load its live model list.`}>
            <div className="flex gap-2">
              <input id="prov-model" className="input" list="prov-models" value={model} placeholder={entry.default_model} onChange={(e) => setModel(e.target.value)} />
              <datalist id="prov-models">{modelOptions.map((m) => <option key={m} value={m} />)}</datalist>
              {editing && (
                <button type="button" className="btn-secondary shrink-0" onClick={loadModels} disabled={loadingModels}>
                  {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load models'}
                </button>
              )}
            </div>
            {models.length > 0 && (
              <select className="input mt-2" aria-label="Choose a loaded model" value={models.includes(model) ? model : ''} onChange={(e) => e.target.value && setModel(e.target.value)}>
                <option value="">Select a loaded model…</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {modelsNote && <p className="mt-1 text-xs text-slate-500" role="status">{modelsNote}</p>}
          </Field>

          <fieldset>
            <legend className="label">Generation parameters</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(entry.param_schema).map(([k, [lo, hi]]) => (
                <div key={k}>
                  <label className="label" htmlFor={`param-${k}`}>{PARAM_LABELS[k] ?? k} <span className="font-normal text-slate-400">({lo}–{hi})</span></label>
                  <div className="flex items-center gap-2">
                    <input type="range" aria-label={`${PARAM_LABELS[k] ?? k} slider`} className="flex-1" min={lo} max={hi} step={stepFor(k, hi)} value={value(k)} onChange={(e) => setParams({ ...params, [k]: Number(e.target.value) })} />
                    <input id={`param-${k}`} type="number" className="input w-24" min={lo} max={hi} step={stepFor(k, hi)} value={value(k)} onChange={(e) => setParams({ ...params, [k]: Number(e.target.value) })} />
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <Checkbox label="Enabled" checked={enabled} onChange={setEnabled} />
          {!editing && <Checkbox label="Make this my default provider" checked={makeDefault} onChange={setMakeDefault} />}
          {isCloud && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <Checkbox
                label={`I understand that statistics from the data modules I allow (never notes or descriptions) are sent to ${editing?.label ?? entry.label}.`}
                checked={consent}
                onChange={setConsent}
                help="Required before this provider can be used. You can withdraw consent at any time."
              />
            </div>
          )}
          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">{error}</p>}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </Modal>
  )
}

export function providerNote(c: { id: string; cloud: boolean; label: string }): string {
  if (c.id === 'groq') return 'Bring your own key. Free tiers have rate limits and quotas; requests may be throttled.'
  if (c.id === 'ollama') return 'Runs locally — no data leaves your machine.'
  if (c.id === 'huggingface') return 'Bring your own token. Uses the Hugging Face inference API or your dedicated endpoint; usage limits depend on your plan.'
  return `Bring your own key. ${c.label} bills usage to your own account.`
}
