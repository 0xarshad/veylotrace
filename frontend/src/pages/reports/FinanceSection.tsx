import { BarsChart, DonutChart } from '@/components/charts/Charts'
import { Card, StatCard } from '@/components/ui/Common'
import { cap, money, num } from '@/lib/format'
import { BarList, Delta, grid, NoRecords, Section, type SectionProps } from './shared'

const BUDGET_TEXT: Record<string, string> = { ok: 'on track', warning: 'near limit', over: 'over budget' }
const BUDGET_TONE = { ok: 'brand', warning: 'warn', over: 'bad' } as const

const essentialRows = (f: any, total: number) => [
  { label: 'Essential', value: f.essential, max: total, text: money(f.essential), tone: 'brand' as const },
  { label: 'Non-essential', value: f.non_essential, max: total, text: money(f.non_essential), tone: 'warn' as const },
]

export function FinanceSection({ r, daily }: SectionProps) {
  const f = r.finance
  const c = r.comparison
  const budgets: any[] = r.budgets ?? []
  const goals: any[] = r.savings?.goals ?? []
  const hasRecords = f.expense_count > 0 || f.income_total > 0 || f.savings_contributed > 0
  const total = f.expenses_total
  return (
    <Section title="Finance" subtitle="Spending, income and savings from your stored expenses, income and contributions">
      {hasRecords ? (
        <>
          <div className={grid(4)}>
            <StatCard label="Expenses" value={money(f.expenses_total)} hint={<><div>{f.expense_count} expense{f.expense_count === 1 ? '' : 's'}</div><Delta d={c.expenses} good="down" fmt={money} /></>} />
            <StatCard label="Income" value={money(f.income_total)} hint={<Delta d={c.income} good="up" fmt={money} />} />
            <StatCard label="Savings contributed" value={money(f.savings_contributed)} hint={<Delta d={c.savings_contributed} good="up" fmt={money} />} />
            <StatCard label="Net cash flow" value={money(f.net_cash_flow)} tone={f.net_cash_flow >= 0 ? 'good' : 'bad'} hint={f.net_cash_flow >= 0 ? 'Surplus after spending and savings' : 'Deficit after spending and savings'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Spending by category">
              <DonutChart data={f.by_category.map((x: any) => ({ name: x.name, value: x.amount }))} formatter={money} emptyMessage="No expenses in this period" />
            </Card>
            {!daily && (
              <Card title="Daily spending">
                <BarsChart data={f.daily} series={[{ key: 'amount', label: 'Spent', color: 'var(--chart-series-red)' }]} formatter={(v) => money(v, { compact: true })} emptyMessage="No expenses in this period" />
              </Card>
            )}
            <Card title="Essential vs non-essential">
              <BarList empty="No expenses in this period" rows={essentialRows(f, total)} />
            </Card>
            <Card title="Payment methods">
              <BarList empty="No expenses in this period" rows={f.by_payment_method.map((x: any) => ({ label: cap(x.name), value: x.amount, max: total, text: `${money(x.amount)} · ${num(total ? (100 * x.amount) / total : 0)}%` }))} />
            </Card>
          </div>
        </>
      ) : (
        <NoRecords what="finance" />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Budget adherence" action={<span className="text-xs text-slate-500">as of the end of this period</span>}>
          <div className="max-h-[50vh] overflow-y-auto overscroll-contain pr-1">
            <BarList
              empty="No budgets apply to this period"
              rows={budgets.map((b) => ({ label: `${b.name} · ${b.category}`, value: b.spent, max: b.amount, tone: BUDGET_TONE[b.status as keyof typeof BUDGET_TONE] ?? 'brand', text: `${money(b.spent)} of ${money(b.amount)} (${num(b.pct)}%) · ${BUDGET_TEXT[b.status] ?? b.status}` }))}
            />
          </div>
        </Card>
        <Card title="Savings goals" action={<span className="text-xs text-slate-500">all time: {money(r.savings?.total_contributed)}</span>}>
          <div className="max-h-[50vh] overflow-y-auto overscroll-contain pr-1">
            <BarList empty="No savings goals yet" rows={goals.map((g) => ({ label: g.name, value: g.contributed, max: g.target, tone: g.progress_pct >= 100 ? 'good' : 'brand', text: `${money(g.contributed)} of ${money(g.target)} (${num(g.progress_pct)}%)` }))} />
          </div>
        </Card>
      </div>
    </Section>
  )
}
