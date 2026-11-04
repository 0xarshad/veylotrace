import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Trash2, X } from 'lucide-react'
import { api } from '@/api/client'
import { Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, fmtDate, fmtDateTime } from '@/lib/format'
import { SafeMarkdown } from './Markdown'
import { canUseAI, defaultRange, ExternalDisclosure, ProviderSelect, RangePicker, rangeError, SetupNotice, useAIStatus, useProviderChoice, type Range } from './shared'

interface KindInfo {
  id: string
  title: string
  modules: string[]
}
interface Report {
  id: number
  kind: string
  title: string
  range_start: string
  range_end: string
  provider: string
  model: string
  created_at: string
  content: string
  facts?: Record<string, any>
}

function ReportView({ report, onClose }: { report: Report; onClose?: () => void }) {
  const facts = report.facts
  return (
    <Card
      title={report.title}
      action={onClose && <button className="btn-ghost p-1" onClick={onClose} aria-label="Close report"><X className="h-4 w-4" /></button>}
    >
      <p className="mb-3 text-xs text-slate-500">
        {fmtDate(report.range_start)} – {fmtDate(report.range_end)} · {report.provider}{report.model ? ` (${report.model})` : ''} · generated {fmtDateTime(report.created_at)}
      </p>
      <SafeMarkdown text={report.content} />
      {facts && (
        <details className="mt-4 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-medium">Data used</summary>
          <dl className="mt-2 grid gap-1 sm:grid-cols-[8rem_1fr]">
            <dt className="text-slate-500">Range</dt>
            <dd>{facts.range?.start} → {facts.range?.end}</dd>
            <dt className="text-slate-500">Modules</dt>
            <dd>{(facts.modules_included ?? []).join(', ') || '—'}</dd>
            <dt className="text-slate-500">Coverage</dt>
            <dd>{facts.data_coverage ? Object.entries(facts.data_coverage).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`).join(' · ') : '—'}</dd>
          </dl>
          <details className="mt-2">
            <summary className="cursor-pointer text-slate-500">Show full facts (JSON)</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-50 p-2 dark:bg-slate-900">{JSON.stringify(facts, null, 2)}</pre>
          </details>
        </details>
      )}
    </Card>
  )
}

export function ReportsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const status = useAIStatus()
  const choice = useProviderChoice()
  const [kind, setKind] = useState('')
  const [custom, setCustom] = useState(false)
  const [range, setRange] = useState<Range>(defaultRange)
  const [openId, setOpenId] = useState<number | null>(null)
  const [generated, setGenerated] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  const kinds = useQuery({ queryKey: ['ai', 'report-kinds'], queryFn: () => api<KindInfo[]>('/ai/report-kinds'), staleTime: 3600_000 })
  const history = useQuery({ queryKey: ['ai', 'reports'], queryFn: () => api<{ items: Report[] }>('/ai/reports') })
  const detail = useQuery({ queryKey: ['ai', 'report', openId], queryFn: () => api<Report>(`/ai/reports/${openId}`), enabled: openId !== null })

  const kindId = kind || kinds.data?.[0]?.id || ''
  const rErr = custom ? rangeError(range) : null
  const ready = canUseAI(status.data, choice.query.data) && !!choice.selected

  const generate = useMutation({
    mutationFn: () =>
      api<Report>('/ai/reports', { method: 'POST', body: { kind: kindId, provider_id: choice.selected?.id, ...(custom ? { start: range.start, end: range.end } : {}) } }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setGenerated(r)
      setOpenId(null)
      qc.invalidateQueries({ queryKey: ['ai'] })
      toast.success('Report generated')
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const del = useMutation({
    mutationFn: (id: number) => api(`/ai/reports/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      if (openId === id) setOpenId(null)
      if (generated?.id === id) setGenerated(null)
      qc.invalidateQueries({ queryKey: ['ai'] })
      toast.success('Report deleted')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const remove = async (r: Report) => {
    if (await confirm({ title: 'Delete report?', message: `"${r.title}" (${fmtDate(r.range_start)} – ${fmtDate(r.range_end)}) will be permanently deleted.` })) del.mutate(r.id)
  }

  const shown = openId !== null ? detail.data : generated

  return (
    <>
      <SetupNotice status={status.data} providers={choice.query.data} />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <Card title="Generate a report">
            {kinds.isLoading ? (
              <Spinner />
            ) : kinds.isError ? (
              <ErrorState error={kinds.error} onRetry={() => kinds.refetch()} />
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (ready && !rErr && kindId) generate.mutate()
                }}
              >
                <div>
                  <label className="label" htmlFor="rep-kind">Analysis</label>
                  <select id="rep-kind" className="input" value={kindId} onChange={(e) => setKind(e.target.value)}>
                    {kinds.data!.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Uses: {kinds.data!.find((k) => k.id === kindId)?.modules.join(', ')}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
                  Custom date range
                </label>
                {custom ? <RangePicker idPrefix="rep-range" value={range} onChange={setRange} /> : <p className="text-xs text-slate-500">Default period for this analysis (e.g. last 30 days, this week or this month).</p>}
                {rErr && <p role="alert" className="text-xs text-rose-600">{rErr}</p>}
                <ProviderSelect choice={choice} id="rep-provider" />
                <ExternalDisclosure provider={choice.selected} />
                <button className="btn-primary w-full" disabled={!ready || !!rErr || !kindId || generate.isPending}>
                  {generate.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : 'Generate'}
                </button>
                {error && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">
                    {error}
                  </p>
                )}
                <p className="text-xs text-slate-500">All figures are calculated by the app from your records; the AI only interprets them.</p>
              </form>
            )}
          </Card>

          <Card title="History" padded={false}>
            {history.isLoading ? (
              <Spinner />
            ) : history.isError ? (
              <div className="p-3"><ErrorState error={history.error} onRetry={() => history.refetch()} /></div>
            ) : history.data!.items.length === 0 ? (
              <EmptyState title="No reports yet" hint="Generated reports are saved here, separately from your tracking data." icon={<FileText className="h-6 w-6" />} />
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {history.data!.items.map((r) => (
                  <li key={r.id} className="flex items-center gap-1 border-b border-slate-50 px-3 dark:border-slate-800/60">
                    <button className="min-w-0 flex-1 py-2 text-left" onClick={() => setOpenId(r.id)} aria-label={`Open report ${r.title}`}>
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block text-xs text-slate-500">{fmtDate(r.range_start)} – {fmtDate(r.range_end)} · {r.provider}</span>
                    </button>
                    <button className="btn-ghost p-1.5 text-slate-400 hover:text-rose-600" onClick={() => remove(r)} aria-label={`Delete report ${r.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          {generate.isPending ? (
            <Card><Spinner label="Generating report" /></Card>
          ) : openId !== null && detail.isLoading ? (
            <Card><Spinner /></Card>
          ) : openId !== null && detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : shown ? (
            <ReportView report={shown} onClose={() => { setOpenId(null); setGenerated(null) }} />
          ) : (
            <Card><EmptyState title="Pick an analysis to generate" hint="Or open a previous report from the history list." icon={<FileText className="h-6 w-6" />} /></Card>
          )}
        </div>
      </div>
    </>
  )
}
