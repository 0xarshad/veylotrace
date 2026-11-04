import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Target } from 'lucide-react'
import { api, type ListResponse } from '@/api/client'
import { EmptyState, ErrorState, PageHeader, Spinner, Tabs } from '@/components/ui/Common'
import { TEMPLATES, type Metric, type Template } from '@/crud/configs/challenges'
import type { Row } from '@/crud/ModuleCrud'
import { toDateStr } from '@/lib/format'
import { ChallengeCard } from './challenges/ChallengeCard'
import { ChallengeForm } from './challenges/ChallengeForm'
import { HistoryModal } from './challenges/HistoryModal'

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'ended', label: 'History / Ended' },
] as const
type TabId = (typeof TABS)[number]['id']

const list = (status: string, deleted: boolean) => api<ListResponse<Row>>('/challenges', { query: { status, deleted: deleted || undefined, limit: 200 } }).then((r) => r.items)
const pastEnd = (c: Row, today: string) => !!c.end_date && String(c.end_date).slice(0, 10) < today

/** Active challenges whose end date has passed are shown under History / Ended. */
async function fetchTab(tab: TabId, deleted: boolean): Promise<Row[]> {
  const today = toDateStr()
  if (tab === 'paused') return list('paused', deleted)
  if (tab === 'active') return (await list('active', deleted)).filter((c) => !pastEnd(c, today))
  const [ended, active] = await Promise.all([list('ended', deleted), list('active', deleted)])
  return [...active.filter((c) => pastEnd(c, today)), ...ended]
}

export default function ChallengesPage() {
  const [tab, setTab] = useState<TabId>('active')
  const [deleted, setDeleted] = useState(false)
  const [form, setForm] = useState<{ open: boolean; row: Row | null; template: Template | null }>({ open: false, row: null, template: null })
  const [history, setHistory] = useState<Row | null>(null)

  const metricsQ = useQuery({ queryKey: ['challenge-metrics'], queryFn: () => api<Metric[]>('/challenges/metrics'), staleTime: 300_000 })
  const q = useQuery({ queryKey: ['challenges', tab, deleted], queryFn: () => fetchTab(tab, deleted), placeholderData: (p) => p })
  const metrics = metricsQ.data ?? []
  const templates = TEMPLATES.filter((t) => metrics.some((m) => m.key === t.metric))
  const openNew = (template: Template | null = null) => setForm({ open: true, row: null, template })

  const emptyTitle = deleted ? 'No deleted challenges' : { active: 'No active challenges', paused: 'No paused challenges', ended: 'No ended challenges yet' }[tab]
  const today = toDateStr()

  return (
    <>
      <PageHeader
        title="Challenges"
        subtitle="Build streaks and earn badges — progress is calculated from your own records"
        actions={
          <button className="btn-primary" onClick={() => openNew()} disabled={metricsQ.isLoading || metricsQ.isError}>
            <Plus className="h-4 w-4" /> New challenge
          </button>
        }
      />
      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />
      <div className="mb-4 flex justify-end">
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input type="checkbox" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} /> Show deleted
        </label>
      </div>
      {metricsQ.isError && (
        <div className="mb-4">
          <ErrorState error={metricsQ.error} onRetry={() => metricsQ.refetch()} />
        </div>
      )}
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title={emptyTitle}
            hint={tab === 'active' && !deleted ? 'Pick a quick-start template or create your own challenge to start a streak.' : undefined}
            action={
              tab === 'active' && !deleted ? (
                <div className="flex flex-col items-center gap-3">
                  <button className="btn-primary" onClick={() => openNew()} disabled={metricsQ.isLoading || metricsQ.isError}>
                    <Plus className="h-4 w-4" /> New challenge
                  </button>
                  <div className="flex flex-wrap justify-center gap-2">
                    {templates.map((t) => (
                      <button key={t.name} className="btn-secondary px-2.5 py-1 text-xs" onClick={() => openNew(t)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data!.map((c) => (
            <ChallengeCard key={c.id} c={c} deletedView={deleted} ended={c.status === 'ended' || pastEnd(c, today)} onEdit={(row) => setForm({ open: true, row, template: null })} onHistory={setHistory} />
          ))}
        </div>
      )}
      <ChallengeForm open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} metrics={metrics} editing={form.row} template={form.template} />
      <HistoryModal challenge={history} onClose={() => setHistory(null)} />
    </>
  )
}
