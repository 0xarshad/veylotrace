import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { BarsChart } from '@/components/charts/Charts'
import { Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { Modal } from '@/components/ui/Modal'
import type { Row } from '@/crud/ModuleCrud'
import { formatAmount, targetText } from '@/crud/configs/challenges'
import { fmtDate } from '@/lib/format'

export const STATUS_META: Record<string, { label: string; tone: 'green' | 'blue' | 'red' }> = {
  met: { label: 'Met', tone: 'green' },
  in_progress: { label: 'In progress', tone: 'blue' },
  missed: { label: 'Missed', tone: 'red' },
}

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, tone: 'blue' as const }
  return <Badge tone={m.tone}>{m.label}</Badge>
}

const periodLabel = (h: Row, frequency: string) => (frequency === 'daily' ? fmtDate(h.period_start) : `${fmtDate(h.period_start)} – ${fmtDate(h.period_end)}`)

export function HistoryModal({ challenge, onClose }: { challenge: Row | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['challenge-history', challenge?.id],
    queryFn: () => api<{ history: Row[]; total_met: number; periods_total: number; success_rate: number }>(`/challenges/${challenge!.id}/history`),
    enabled: !!challenge,
  })
  const history = q.data?.history ?? []
  const recent = history.slice(0, 30).reverse()
  const manual = challenge?.metric === 'manual'
  return (
    <Modal open={!!challenge} onClose={onClose} wide title={challenge ? `History · ${challenge.name}` : 'History'}>
      {q.isLoading && <Spinner />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && challenge && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {targetText(challenge)} · {q.data.total_met} of {q.data.periods_total} periods met · {q.data.success_rate}% success rate
          </p>
          {history.length === 0 ? (
            <EmptyState title="No periods yet" hint="Periods appear once the challenge start date has arrived." />
          ) : (
            <>
              {!manual && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Last {recent.length} periods</h3>
                  <BarsChart data={recent} xKey="period_start" series={[{ key: 'value', label: challenge.metric_label ?? 'Value', color: 'var(--chart-series-blue)' }]} target={challenge.target || undefined} height={160} formatter={(v) => formatAmount(v, challenge.unit)} emptyMessage="No activity recorded in these periods" />
                </div>
              )}
              <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="th">Period</th>
                      <th className="th text-right">{manual ? 'Done' : 'Value'}</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.period_start}>
                        <td className="td">{periodLabel(h, challenge.frequency)}</td>
                        <td className="td text-right tabular-nums">{manual ? (h.met ? 'Yes' : 'No') : formatAmount(h.value, challenge.unit)}</td>
                        <td className="td">
                          <StatusBadge status={h.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
