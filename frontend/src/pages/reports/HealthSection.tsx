import { BarsChart, TrendChart } from '@/components/charts/Charts'
import { Card, StatCard } from '@/components/ui/Common'
import { minutes, num } from '@/lib/format'
import { Delta, grid, NoRecords, Section, type SectionProps } from './shared'

export function HealthSection({ r, daily }: SectionProps) {
  const h = r.health
  const c = r.comparison
  const hasRecords = h.workout_count > 0 || h.steps_days > 0 || h.sleep_nights > 0 || h.weight_log_count > 0
  return (
    <Section title="Health & fitness" subtitle="Workouts, steps and sleep from your stored logs">
      {hasRecords ? (
        <>
          <div className={grid(5)}>
            <StatCard label="Workouts" value={h.workout_count} hint={<><div>{h.workout_days} active day{h.workout_days === 1 ? '' : 's'}</div><Delta d={c.workout_count} good="up" /></>} />
            <StatCard label="Workout time" value={minutes(h.workout_minutes)} hint={<Delta d={c.workout_minutes} good="up" fmt={minutes} />} />
            {!daily && <StatCard label="Weekly frequency" value={`${h.workouts_per_week}/wk`} hint={`target ${h.workouts_per_week_target}/week`} tone={h.workouts_per_week >= h.workouts_per_week_target ? 'good' : 'default'} />}
            <StatCard label={daily ? 'Steps' : 'Avg steps / day'} value={h.steps_days ? num(h.steps_average) : '—'} hint={`target ${num(h.steps_target)} · ${h.steps_days} day${h.steps_days === 1 ? '' : 's'} logged`} tone={h.steps_days && h.steps_average >= h.steps_target ? 'good' : 'default'} />
            <StatCard label={daily ? 'Sleep' : 'Avg sleep'} value={h.sleep_nights ? `${h.sleep_avg_hours} h` : '—'} hint={`target ${h.sleep_target_hours} h · ${h.sleep_nights} night${h.sleep_nights === 1 ? '' : 's'} logged`} tone={h.sleep_nights && h.sleep_avg_hours >= h.sleep_target_hours ? 'good' : 'default'} />
          </div>
          {!daily && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Daily steps"><TrendChart data={h.steps_daily} series={[{ key: 'steps', label: 'Steps', color: 'var(--chart-series-cyan)' }]} target={h.steps_target} emptyMessage="No steps logged in this period" /></Card>
              <Card title="Sleep (hours)"><BarsChart data={h.sleep_daily} series={[{ key: 'hours', label: 'Hours', color: 'var(--chart-series-purple)' }]} target={h.sleep_target_hours} emptyMessage="No sleep logged in this period" /></Card>
              <Card title="Workout minutes per day"><BarsChart data={h.workout_minutes_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-green)' }]} emptyMessage="No workouts in this period" /></Card>
              <Card title="Weight journey"><TrendChart data={h.weight_daily} series={[{ key: 'weight_kg', label: 'Weight (kg)', color: 'var(--chart-series-amber)' }]} area={false} target={h.target_weight_kg ?? undefined} formatter={(v) => `${num(v, 1)} kg`} emptyMessage="No weight logs in this period" /></Card>
            </div>
          )}
          {daily && <Card title="Weight journey"><TrendChart data={h.weight_daily} series={[{ key: 'weight_kg', label: 'Weight (kg)', color: 'var(--chart-series-amber)' }]} area={false} target={h.target_weight_kg ?? undefined} formatter={(v) => `${num(v, 1)} kg`} emptyMessage="No weight logs for this day" /></Card>}
        </>
      ) : (
        <NoRecords what="health" />
      )}
    </Section>
  )
}
