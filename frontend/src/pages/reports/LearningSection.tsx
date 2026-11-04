import { BarsChart } from '@/components/charts/Charts'
import { Card, StatCard } from '@/components/ui/Common'
import { minutes, num } from '@/lib/format'
import { BarList, Delta, grid, NoRecords, Section, type SectionProps } from './shared'

export function LearningSection({ r, daily }: SectionProps) {
  const l = r.learning
  const c = r.comparison
  const courses: any[] = l.courses_in_progress ?? []
  const subjects: any[] = l.by_subject ?? []
  const hasRecords = l.study_sessions > 0 || courses.length > 0
  return (
    <Section title="Learning" subtitle="Study sessions and courses from your stored learning records">
      {hasRecords ? (
        <>
          <div className={grid(4)}>
            <StatCard label="Study time" value={minutes(l.study_minutes)} hint={<Delta d={c.study_minutes} good="up" fmt={minutes} />} />
            <StatCard label="Study sessions" value={l.study_sessions} hint={`${subjects.length} subject${subjects.length === 1 ? '' : 's'}`} />
            <StatCard label="Courses in progress" value={courses.length} />
            <StatCard label="Avg session" value={l.study_sessions ? minutes(l.study_minutes / l.study_sessions) : '—'} hint="Study time per session" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Study minutes by subject">
              {daily ? (
                <BarList empty="No study sessions in this period" rows={subjects.map((s) => ({ label: s.name, value: s.minutes, max: l.study_minutes, text: minutes(s.minutes) }))} />
              ) : (
                <BarsChart data={subjects} xKey="name" layout="vertical" series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-purple)' }]} height={Math.max(160, subjects.length * 36)} emptyMessage="No study sessions in this period" />
              )}
            </Card>
            {!daily && <Card title="Study minutes per day"><BarsChart data={l.study_daily} series={[{ key: 'minutes', label: 'Minutes', color: 'var(--chart-series-blue)' }]} emptyMessage="No study sessions in this period" /></Card>}
            {!daily && <Card title="Study sessions per day"><BarsChart data={l.sessions_daily} series={[{ key: 'sessions', label: 'Sessions', color: 'var(--chart-series-purple)' }]} emptyMessage="No study sessions in this period" /></Card>}
            <Card title="Courses in progress">
              <BarList empty="No courses in progress" rows={courses.map((x) => ({ label: x.name, value: x.progress, max: 100, text: `${num(x.progress)}%` }))} />
            </Card>
          </div>
        </>
      ) : (
        <NoRecords what="learning" />
      )}
    </Section>
  )
}
