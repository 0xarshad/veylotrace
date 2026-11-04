import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Plug, Plus, Star, XCircle } from 'lucide-react'
import { api } from '@/api/client'
import { Badge, Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, fmtDateTime } from '@/lib/format'
import { ProviderDialog, providerNote } from './ProviderDialog'
import { useAIStatus, useCatalog, useProviders, type Provider } from './shared'

function ProviderCard({ p, onEdit }: { p: Provider; onEdit: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['ai'] })
  const fail = (e: unknown) => toast.error(errorMessage(e))

  const toggle = useMutation({ mutationFn: (enabled: boolean) => api(`/ai/providers/${p.id}`, { method: 'PATCH', body: { enabled } }), onSuccess: refresh, onError: fail })
  const makeDefault = useMutation({ mutationFn: () => api(`/ai/providers/${p.id}/default`, { method: 'POST' }), onSuccess: () => { refresh(); toast.success(`${p.label} is now the default`) }, onError: fail })
  const runTest = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string }>(`/ai/providers/${p.id}/test`, { method: 'POST' }),
    onSuccess: (r) => { setTest(r); refresh() },
    onError: (e) => { setTest({ ok: false, message: errorMessage(e) }); refresh() },
  })
  const remove = useMutation({ mutationFn: () => api(`/ai/providers/${p.id}`, { method: 'DELETE' }), onSuccess: () => { refresh(); toast.success('Provider removed and credentials deleted') }, onError: fail })

  const onRemove = async () => {
    if (await confirm({ title: `Remove ${p.label}?`, message: 'The provider and its saved API key will be permanently deleted. Your reports and conversations are kept.', confirmLabel: 'Remove' })) remove.mutate()
  }

  return (
    <article className="card p-4" aria-label={p.label}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{p.label}</h3>
          {p.is_default && <Badge tone="blue">Default</Badge>}
          <Badge tone={p.cloud ? 'amber' : 'green'}>{p.cloud ? 'External' : 'Local'}</Badge>
          {p.cloud && !p.cloud_consent && <Badge tone="red">Consent needed</Badge>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" role="switch" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={p.enabled} disabled={toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />
          {p.enabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">{providerNote({ id: p.provider, cloud: p.cloud, label: p.label })}</p>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]">
        <dt className="text-slate-500">Model</dt>
        <dd className="break-all">{p.model || '—'}</dd>
        {(p.has_key || p.provider !== 'ollama') && (
          <>
            <dt className="text-slate-500">API key</dt>
            <dd>{p.key_hint ?? (p.has_key ? 'Saved' : 'Not set')}</dd>
          </>
        )}
        {p.base_url && (
          <>
            <dt className="text-slate-500">Base URL</dt>
            <dd className="break-all">{p.base_url}</dd>
          </>
        )}
        <dt className="text-slate-500">Last test</dt>
        <dd className="flex items-center gap-1">
          {p.last_test_ok === null ? 'Not tested yet' : (
            <>
              {p.last_test_ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
              {p.last_test_ok ? 'Succeeded' : 'Failed'} · {fmtDateTime(p.last_test_at)}
            </>
          )}
        </dd>
      </dl>
      {p.last_error && <p className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-950 dark:text-rose-200">Last error: {p.last_error}</p>}
      {test && (
        <p className={`mt-2 rounded p-2 text-xs ${test.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'}`} role="status">
          {test.ok ? 'OK — ' : 'Failed — '}{test.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => runTest.mutate()} disabled={runTest.isPending}>
          {runTest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Test connection
        </button>
        {!p.is_default && (
          <button className="btn-secondary" onClick={() => makeDefault.mutate()} disabled={makeDefault.isPending}>
            <Star className="h-4 w-4" /> Make default
          </button>
        )}
        <button className="btn-secondary" onClick={onEdit}>Edit</button>
        <button className="btn-ghost text-rose-600" onClick={onRemove} disabled={remove.isPending}>Remove</button>
      </div>
    </article>
  )
}

export function ProvidersTab() {
  const providers = useProviders()
  const catalog = useCatalog()
  const status = useAIStatus()
  const [dialog, setDialog] = useState<{ editing: Provider | null } | null>(null)

  if (providers.isLoading || catalog.isLoading) return <Spinner />
  if (providers.isError) return <ErrorState error={providers.error} onRetry={() => providers.refetch()} />
  if (catalog.isError) return <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />
  const list = providers.data!
  const cat = catalog.data!
  const remaining = cat.filter((c) => !list.some((p) => p.provider === c.id))
  const errors = status.data?.recent_errors ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-500">
          Bring your own provider. API keys are encrypted on the server and never shown again — only the last four characters are displayed. There is no automatic fallback between providers.
        </p>
        <button className="btn-primary" onClick={() => setDialog({ editing: null })} disabled={remaining.length === 0}>
          <Plus className="h-4 w-4" /> Add provider
        </button>
      </div>

      {list.length === 0 ? (
        <Card><EmptyState title="No AI provider configured" hint="Add one to enable the assistant and reports. VeyloTrace works fully without AI." action={<button className="btn-primary" onClick={() => setDialog({ editing: null })}>Add provider</button>} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((p) => <ProviderCard key={p.id} p={p} onEdit={() => setDialog({ editing: p })} />)}
        </div>
      )}

      <Card title="Recent request errors">
        {status.isLoading ? (
          <Spinner />
        ) : errors.length === 0 ? (
          <p className="text-sm text-slate-500">No recent provider errors.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {errors.map((e, i) => (
              <li key={i} className="py-2">
                <span className="font-medium">{e.provider}</span> <span className="text-xs text-slate-500">· {e.kind.replace(/_/g, ' ')} · {fmtDateTime(e.at)}</span>
                <p className="text-xs text-rose-700 dark:text-rose-300">{e.error ?? 'Unknown error'}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dialog && <ProviderDialog key={dialog.editing?.id ?? 'new'} catalog={cat} providers={list} editing={dialog.editing} onClose={() => setDialog(null)} />}
    </div>
  )
}
