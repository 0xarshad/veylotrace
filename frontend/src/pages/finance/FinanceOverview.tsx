import { useState, type ReactNode } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api, type ListResponse } from '@/api/client'
import { BarsChart, DonutChart } from '@/components/charts/Charts'
import { Badge, Card, EmptyState, ErrorState, ProgressBar, Spinner, StatCard } from '@/components/ui/Common'
import { cap, fmtDate, money, monthRange, pct, toDateStr } from '@/lib/format'

type Tone = 'brand' | 'good' | 'warn' | 'bad'
const budgetTone: Record<string, Tone> = { ok: 'brand', warning: 'warn', over: 'bad' }
const methodLabel = (v: string) => (v === 'upi' ? 'UPI' : cap(v))

function Boundary<T>({ q, children }: { q: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return <>{children(q.data as T)}</>
}

function MonthPicker({ anchor, onChange }: { anchor: Date; onChange: (d: Date) => void }) {
  const now = new Date()
  const isCurrent = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()
  const shift = (n: number) => onChange(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1))
  return (
    <div className="flex items-center justify-end gap-1">
      <button className="btn-secondary px-2 py-1.5" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
      <span className="min-w-[9rem] text-center text-sm font-medium" aria-live="polite">{anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
      <button className="btn-secondary px-2 py-1.5" onClick={() => shift(1)} disabled={isCurrent} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      {!isCurrent && <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => onChange(new Date())}>This month</button>}
    </div>
  )
}

function BudgetList({ budgets }: { budgets: any[] }) {
  if (!budgets.length) return <EmptyState title="No budgets apply to this period" hint="Create a budget in the Budgets tab to track your limits." />
  return (
    <ul className="max-h-[50vh] space-y-4 overflow-y-auto overscroll-contain pr-1">
      {budgets.map((b) => (
        <li key={b.id}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              {b.name || b.category} <span className="text-xs font-normal text-slate-500">· {cap(b.period)}{b.category_id ? ` · ${b.category}` : ' · Overall'}</span>
            </span>
            <Badge tone={b.status === 'over' ? 'red' : b.status === 'warning' ? 'amber' : 'green'}>{b.status === 'over' ? 'Over budget' : b.status === 'warning' ? 'Nearly used' : 'On track'}</Badge>
          </div>
          <ProgressBar value={b.spent} max={b.amount} tone={budgetTone[b.status] ?? 'brand'} label={`${b.name || b.category} budget used`} />
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-500">
            <span>Spent {money(b.spent)} of {money(b.amount)} ({pct(b.pct)})</span>
            <span className={b.remaining < 0 ? 'text-rose-600' : ''}>{b.remaining < 0 ? `${money(-b.remaining)} over` : `${money(b.remaining)} remaining`}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function GoalsSummary() {
  const goals = useQuery({ queryKey: ['finance', 'goals'], queryFn: () => api<ListResponse<any>>('/savings-goals', { query: { limit: 100 } }) })
  return (
    <Boundary q={goals}>
      {(d) =>
        d.items.length === 0 ? (
          <EmptyState title="No savings goals yet" hint="Create a goal in the Savings tab." action={<Link className="btn-primary" to="/finance?tab=savings">Go to Savings</Link>} />
        ) : (
          <ul className="max-h-[50vh] space-y-4 overflow-y-auto overscroll-contain pr-1">
            {d.items.map((g) => (
              <li key={g.id}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span className="font-medium">{g.name}</span>
                  <span className="tabular-nums text-slate-500">{pct(g.progress_pct)}</span>
                </div>
                <ProgressBar value={g.contributed} max={g.target_amount} label={`${g.name} progress`} />
                <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-500">
                  <span>{money(g.contributed)} of {money(g.target_amount)} saved</span>
                  <span>{g.remaining > 0 ? `${money(g.remaining)} still needed` : 'Goal reached'}</span>
                  <span>{g.projected_completion ? `Projected: ${fmtDate(g.projected_completion)}` : 'No projection (set a monthly contribution)'}</span>
                </div>
              </li>
            ))}
          </ul>
        )
      }
    </Boundary>
  )
}

export function FinanceOverview() {
  const [anchor, setAnchor] = useState(() => new Date())
  const { start, end } = monthRange(anchor)
  const today = toDateStr()
  const budgetDate = today >= start && today <= end ? today : end

  const fin = useQuery({ queryKey: ['analytics', 'finance', start, end], queryFn: () => api<any>('/analytics/finance', { query: { start, end } }) })
  const budgets = useQuery({ queryKey: ['budgets-status', budgetDate], queryFn: () => api<any[]>('/budgets-status', { query: { date: budgetDate } }) })
  const savings = useQuery({ queryKey: ['savings-overview'], queryFn: () => api<{ total_contributed: number }>('/savings-overview') })

  const overall = budgets.data?.find((b) => !b.category_id && b.period === 'monthly')

  return (
    <div className="space-y-4">
      <MonthPicker anchor={anchor} onChange={setAnchor} />

      <Boundary q={fin}>
        {(f) => (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="Spending" value={money(f.expenses_total)} hint={`${f.expense_count} expense${f.expense_count === 1 ? '' : 's'} this month`} />
              <StatCard
                label="Budget remaining"
                value={overall ? money(overall.remaining) : '—'}
                tone={overall ? (overall.status === 'over' ? 'bad' : overall.status === 'warning' ? 'warn' : 'good') : 'default'}
                hint={overall ? `of ${money(overall.amount)} monthly budget` : budgets.isLoading ? 'Loading…' : budgets.isError ? 'Could not load budgets' : <Link className="underline" to="/finance?tab=budgets">No monthly budget set</Link>}
              />
              <StatCard label="Savings transferred" value={money(f.savings_contributed)} hint="Actual contributions only — not unspent budget" tone="good" />
              <StatCard label="Net cash flow" value={money(f.net_cash_flow)} tone={f.net_cash_flow >= 0 ? 'good' : 'bad'} hint="Income − spending − savings" />
              <StatCard label="Income" value={money(f.income_total)} hint="Received this month" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Spending by category"><DonutChart data={f.by_category.map((c: any) => ({ name: c.name, value: c.amount }))} formatter={(v) => money(v)} emptyMessage="No expenses in this month" /></Card>
              <Card title="Daily spending"><BarsChart data={f.daily} series={[{ key: 'amount', label: 'Spent', color: 'var(--chart-series-red)' }]} formatter={(v) => money(v, { compact: true })} emptyMessage="No expenses in this month" /></Card>
              <Card title="Essential vs non-essential">
                {f.essential + f.non_essential > 0 ? (
                  <div className="space-y-4">
                    {[
                      { label: 'Essential', value: f.essential, tone: 'good' as Tone },
                      { label: 'Non-essential', value: f.non_essential, tone: 'warn' as Tone },
                    ].map((r) => (
                      <div key={r.label}>
                        <div className="mb-1 flex justify-between text-sm"><span>{r.label}</span><span className="tabular-nums">{money(r.value)} · {pct((100 * r.value) / (f.essential + f.non_essential))}</span></div>
                        <ProgressBar value={r.value} max={f.essential + f.non_essential} tone={r.tone} label={`${r.label} share of spending`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No expenses in this month" />
                )}
              </Card>
              <Card title="Payment methods"><BarsChart layout="vertical" xKey="name" data={f.by_payment_method.map((p: any) => ({ name: methodLabel(p.name), amount: p.amount }))} series={[{ key: 'amount', label: 'Spent', color: 'var(--chart-series-blue)' }]} formatter={(v) => money(v, { compact: true })} emptyMessage="No expenses in this month" height={200} /></Card>
            </div>
          </>
        )}
      </Boundary>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Budgets" action={<Link className="text-xs text-brand-600 underline" to="/finance?tab=budgets">Manage</Link>}>
          <Boundary q={budgets}>{(b) => <BudgetList budgets={b} />}</Boundary>
        </Card>
        <Card
          title="Savings goals"
          action={<span className="text-xs text-slate-500">{savings.data ? `${money(savings.data.total_contributed)} contributed in total` : ''}</span>}
        >
          <GoalsSummary />
        </Card>
      </div>
    </div>
  )
}
