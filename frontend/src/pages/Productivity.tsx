import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type ListResponse } from '@/api/client'
import { BarsChart } from '@/components/charts/Charts'
import { Badge, Card, EmptyState, ErrorState, PageHeader, ProgressBar, Spinner, StatCard, Tabs } from '@/components/ui/Common'
import { useToast } from '@/components/ui/Toast'
import { goalConfig, PRIORITY_TONE, taskConfig } from '@/crud/configs/productivity'
import { CrudList, type Row } from '@/crud/ModuleCrud'
import { addDays, cap, errorMessage, fmtDate, minutes, toDateStr } from '@/lib/format'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'goals', label: 'Goals' },
] as const
type TabId = (typeof TABS)[number]['id']

function Overview() {
  const [days, setDays] = useState(30)
  const end = toDateStr()
  const start = addDays(end, -(days - 1))
  const q = useQuery({ queryKey: ['analytics', 'productivity', start, end], queryFn: () => api<any>('/analytics/productivity', { query: { start, end } }) })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const p = q.data
  const est = p.estimated_vs_actual_min
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <select className="input w-auto" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completed" value={p.tasks_completed} hint={`in the last ${days} days`} tone="good" />
        <StatCard label="Pending" value={p.tasks_pending} hint={`${p.tasks_due_in_range} due in this period`} />
        <StatCard label="Overdue" value={p.tasks_overdue} tone={p.tasks_overdue > 0 ? 'bad' : 'default'} />
        <StatCard label="High priority done" value={p.high_priority_completed} hint="high + urgent" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tasks completed per day">
          <BarsChart data={p.completed_daily} series={[{ key: 'completed', label: 'Completed', color: 'var(--chart-series-green)' }]} formatter={(v) => String(Math.round(v))} emptyMessage="No tasks completed in this period" />
        </Card>
        <Card title="Estimated vs actual time (completed tasks)">
          <BarsChart
            data={[{ name: 'Time', estimated: est.estimated, actual: est.actual }]}
            xKey="name"
            series={[{ key: 'estimated', label: 'Estimated (min)', color: 'var(--chart-series-blue)' }, { key: 'actual', label: 'Actual (min)', color: 'var(--chart-series-amber)' }]}
            formatter={(v) => minutes(v)}
            emptyMessage="Add estimates and actual time to completed tasks"
          />
        </Card>
      </div>
      <Card title="Active goals" action={<Link to="?tab=goals" className="text-xs text-brand-600 hover:underline">Manage goals</Link>}>
        {p.goals.length === 0 ? (
          <EmptyState title="No active goals" hint="Create a goal to track your progress here." action={<Link to="?tab=goals&add=1" className="btn-primary">Add goal</Link>} />
        ) : (
          <ul className="max-h-[72vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
            {p.goals.map((g: any) => (
              <li key={g.id}>
                <Link to="?tab=goals" className="block rounded-lg p-1 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs tabular-nums text-slate-500">{Math.round(g.progress)}%{g.target_date ? ` · by ${fmtDate(g.target_date)}` : ''}</span>
                  </div>
                  <ProgressBar value={g.progress} label={`${g.name} progress`} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function QuickList() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['tasks-quick'],
    queryFn: async () => {
      const [pending, active] = await Promise.all([
        api<ListResponse<Row>>('/tasks', { query: { status: 'pending', limit: 10 } }),
        api<ListResponse<Row>>('/tasks', { query: { status: 'in_progress', limit: 10 } }),
      ])
      return { items: [...active.items, ...pending.items], total: pending.total + active.total }
    },
  })
  const complete = useMutation({
    mutationFn: (id: number) => api(`/tasks/${id}`, { method: 'PATCH', body: { status: 'completed' } }),
    onSuccess: () => {
      toast.success('Task completed')
      qc.invalidateQueries()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const today = toDateStr()
  return (
    <Card title="Today & pending" action={q.data && q.data.total > q.data.items.length ? <span className="text-xs text-slate-500">Showing {q.data.items.length} of {q.data.total}</span> : undefined} className="mb-4">
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="All caught up" hint="No pending or in-progress tasks." />
      ) : (
        <ul className="max-h-[72vh] overflow-y-auto overscroll-contain divide-y divide-slate-100 pr-1 dark:divide-slate-800">
          {q.data!.items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" aria-label={`Mark "${t.name}" as completed`} disabled={complete.isPending} checked={false} onChange={() => complete.mutate(t.id)} />
              <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
              {t.status === 'in_progress' && <Badge tone="blue">In progress</Badge>}
              <Badge tone={PRIORITY_TONE[t.priority as keyof typeof PRIORITY_TONE] ?? 'slate'}>{cap(t.priority)}</Badge>
              {t.due_date && <span className={t.due_date < today ? 'text-xs font-medium text-rose-600' : 'text-xs text-slate-500'}>{t.due_date === today ? 'Today' : fmtDate(t.due_date)}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function ProductivityPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'overview'
  const [autoAdd, setAutoAdd] = useState(params.get('add') === '1')
  const set = (t: TabId) => setParams({ tab: t })
  return (
    <>
      <PageHeader title="Productivity" subtitle="Tasks, goals and focus" />
      <Tabs tabs={[...TABS]} value={tab} onChange={set} />
      {tab === 'overview' && <Overview />}
      {tab === 'tasks' && (
        <>
          <QuickList />
          <CrudList key="tasks" config={taskConfig} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(false)} />
        </>
      )}
      {tab === 'goals' && <CrudList key="goals" config={goalConfig} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(false)} />}
    </>
  )
}
