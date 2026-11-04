import { BarsChart } from '@/components/charts/Charts'
import { Card, StatCard } from '@/components/ui/Common'
import { cap, minutes } from '@/lib/format'
import { BarList, Delta, grid, NoRecords, Section, type SectionProps } from './shared'

export function LifestyleSection({ r, daily }: SectionProps) {
  const l = r.lifestyle
  const c = r.comparison
  const hasRecords = l.reading_minutes > 0 || l.screen_minutes > 0 || l.social_count > 0 || l.habit_entries > 0 || l.books_completed > 0
  const social = Object.entries(l.social_by_kind as Record<string, number>)
  return (
    <Section title="Lifestyle" subtitle="Reading, screen time, social activity and habits from your stored logs">
      {hasRecords ? (
        <>
          <div className={grid(4)}>
            <StatCard label="Reading" value={minutes(l.reading_minutes)} hint={<><div>{l.pages_read} pages · {l.books_completed} book{l.books_completed === 1 ? '' : 's'} finished</div><Delta d={c.reading_minutes} good="up" fmt={minutes} /></>} />
            <StatCard label="Screen time" value={minutes(l.screen_minutes)} hint={<Delta d={c.screen_minutes} good="down" fmt={minutes} />} />
            <StatCard label="Social activity" value={l.social_count} hint={`${minutes(l.social_minutes)} in total`} />
            <StatCard label="Habits completed" value={`${l.habits_completed} / ${l.habit_entries}`} hint={l.habit_entries ? `${l.habit_entries - l.habits_completed} not completed` : 'No habit entries'} tone={l.habit_entries > 0 && l.habits_completed === l.habit_entries ? 'good' : 'default'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Screen time: productive vs entertainment">
              <BarList
                empty="No screen time logged in this period"
                rows={
                  l.screen_minutes > 0
                    ? [
                        { label: 'Productive', value: l.screen_productive_minutes, max: l.screen_minutes, tone: 'good', text: minutes(l.screen_productive_minutes) },
                        { label: 'Entertainment', value: l.screen_entertainment_minutes, max: l.screen_minutes, tone: 'warn', text: minutes(l.screen_entertainment_minutes) },
                      ]
                    : []
                }
              />
            </Card>
            <Card title="Social activity by type">
              <BarList empty="No social activity in this period" rows={social.map(([k, v]) => ({ label: cap(k), value: v, max: l.social_count, text: `${v}` }))} />
            </Card>
            {!daily && (
              <>
                <Card title="Reading minutes per day"><BarsChart data={l.reading_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-teal)' }]} emptyMessage="No reading in this period" /></Card>
                <Card title="Screen minutes per day"><BarsChart data={l.screen_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-amber)' }]} emptyMessage="No screen time in this period" /></Card>
              </>
            )}
          </div>
        </>
      ) : (
        <NoRecords what="lifestyle" />
      )}
    </Section>
  )
}
