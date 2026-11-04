import { BarsChart } from '@/components/charts/Charts'
import { Card, StatCard } from '@/components/ui/Common'
import { fmtDate, minutes, num } from '@/lib/format'
import { BarList, Delta, grid, NoRecords, Section, type SectionProps } from './shared'

export function ProductivitySection({ r, daily }: SectionProps) {
  const p = r.productivity
  const c = r.comparison
  const goals: any[] = p.goals ?? []
  const hasRecords = p.tasks_completed > 0 || p.tasks_pending > 0 || goals.length > 0
  const est = p.estimated_vs_actual_min
  return (
    <Section title="Productivity" subtitle="Tasks and goals from your stored task list. Pending and overdue are counted as of today.">
      {hasRecords ? (
        <>
          <div className={grid(4)}>
            <StatCard label="Tasks completed" value={p.tasks_completed} hint={<><div>{p.high_priority_completed} high priority</div><Delta d={c.tasks_completed} good="up" /></>} tone={p.tasks_completed > 0 ? 'good' : 'default'} />
            <StatCard label="Pending" value={p.tasks_pending} hint={`${p.tasks_due_in_range} due in this period`} />
            <StatCard label="Overdue" value={p.tasks_overdue} tone={p.tasks_overdue > 0 ? 'bad' : 'default'} hint={p.tasks_overdue > 0 ? 'Needs attention' : 'Nothing overdue'} />
            <StatCard label="Time: estimated vs actual" value={est.estimated || est.actual ? `${minutes(est.actual)}` : '—'} hint={est.estimated || est.actual ? `actual vs ${minutes(est.estimated)} estimated` : 'No time recorded on completed tasks'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {!daily && (
              <Card title="Tasks completed per day"><BarsChart data={p.completed_daily} series={[{ key: 'completed', label: 'Completed', color: 'var(--chart-series-blue)' }]} emptyMessage="No tasks completed in this period" /></Card>
            )}
            <Card title="Goal progress">
              <BarList
                empty="No active goals"
                rows={goals.map((g) => ({ label: g.name, value: g.progress, max: 100, tone: g.progress >= 100 ? 'good' : 'brand', text: `${num(g.progress)}%${g.target_date ? ` · by ${fmtDate(g.target_date)}` : ''}` }))}
              />
            </Card>
          </div>
        </>
      ) : (
        <NoRecords what="productivity" />
      )}
    </Section>
  )
}
