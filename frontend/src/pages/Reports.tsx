import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api, download } from '@/api/client'
import { ErrorState, PageHeader, Spinner, Tabs } from '@/components/ui/Common'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, fmtDate, toDateStr } from '@/lib/format'
import { DateNavigator, type Kind } from './reports/DateNavigator'
import { FinanceSection } from './reports/FinanceSection'
import { HealthSection } from './reports/HealthSection'
import { LearningSection } from './reports/LearningSection'
import { LifestyleSection } from './reports/LifestyleSection'
import { NutritionSection } from './reports/NutritionSection'
import { ProductivitySection } from './reports/ProductivitySection'
import type { Report } from './reports/shared'

const TABS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
] as const

const rangeText = (r: { start: string; end: string }) => (r.start === r.end ? fmtDate(r.start) : `${fmtDate(r.start)} – ${fmtDate(r.end)}`)

export default function ReportsPage() {
  const toast = useToast()
  const [kind, setKind] = useState<Kind>('weekly')
  const [anchor, setAnchor] = useState(toDateStr())
  const [exporting, setExporting] = useState(false)
  const q = useQuery({ queryKey: ['report', kind, anchor], queryFn: () => api<Report>(`/reports/${kind}`, { query: { date: anchor } }), placeholderData: (p) => p })
  const r = q.data

  const exportAs = async (format: 'csv' | 'json') => {
    setExporting(true)
    try {
      await download(`/reports/${kind}/export`, `veylotrace-${kind}-report-${r?.range.start ?? anchor}.${format}`, { date: anchor, format })
      toast.success(`${format.toUpperCase()} export downloaded.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Daily, weekly and monthly summaries with comparison to the previous period"
        actions={
          <>
            <button className="btn-secondary" disabled={exporting} onClick={() => exportAs('csv')}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button className="btn-secondary" disabled={exporting} onClick={() => exportAs('json')}>
              <Download className="h-4 w-4" /> Export JSON
            </button>
          </>
        }
      />
      <Tabs tabs={[...TABS]} value={kind} onChange={setKind} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <DateNavigator kind={kind} anchor={anchor} onChange={setAnchor} />
        {r && (
          <p className="text-sm text-slate-500" aria-live="polite">
            <span className="font-medium text-slate-700 dark:text-slate-200">{rangeText(r.range)}</span> · compared with {rangeText(r.previous_range)}
          </p>
        )}
      </div>
      {q.isLoading && <Spinner label="Building report" />}
      {q.isError && !r && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {r && (
        <div className={`space-y-8 ${q.isFetching ? 'opacity-60' : ''}`} aria-busy={q.isFetching}>
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          <FinanceSection r={r} daily={kind === 'daily'} />
          <HealthSection r={r} daily={kind === 'daily'} />
          <NutritionSection r={r} daily={kind === 'daily'} />
          <ProductivitySection r={r} daily={kind === 'daily'} />
          <LearningSection r={r} daily={kind === 'daily'} />
          <LifestyleSection r={r} daily={kind === 'daily'} />
          <p className="text-xs text-slate-500">All figures are computed from the records stored in your account. Comparisons are against the immediately preceding period.</p>
        </div>
      )}
    </>
  )
}
