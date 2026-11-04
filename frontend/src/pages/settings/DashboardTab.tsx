import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Card, ErrorState, Spinner } from '@/components/ui/Common'
import { Checkbox } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { cap, errorMessage } from '@/lib/format'
import { useSettings } from '@/lib/hooks'

const WIDGET_LABELS: Record<string, string> = {
  daily_overview: 'Daily overview',
  financial_overview: 'Financial overview',
  health_overview: 'Health & fitness overview',
  productivity_overview: 'Productivity overview',
  lifestyle_overview: 'Lifestyle overview',
  spending_by_category: 'Spending by category',
  budget_vs_actual: 'Budget vs actual',
}

export function DashboardTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useSettings()
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => {
    if (q.data) setSelected(q.data.dashboard_widgets)
  }, [q.data])

  const save = useMutation({
    mutationFn: (widgets: string[]) => api('/settings', { method: 'PUT', body: { dashboard_widgets: widgets } }),
    onSuccess: () => {
      qc.invalidateQueries()
      toast.success('Dashboard updated')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const s = q.data!
  const ordered = s.available_widgets.filter((w) => selected.includes(w))
  const dirty = ordered.join() !== s.dashboard_widgets.join()

  return (
    <Card title="Dashboard widgets">
      <p className="mb-3 text-sm text-slate-500">Choose which sections appear on your dashboard.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {s.available_widgets.map((w) => (
          <Checkbox
            key={w}
            label={WIDGET_LABELS[w] ?? cap(w)}
            checked={selected.includes(w)}
            onChange={(on) => setSelected(on ? [...selected, w] : selected.filter((x) => x !== w))}
          />
        ))}
      </div>
      {ordered.length === 0 && <p className="mt-3 text-xs text-amber-700" role="status">Select at least one widget.</p>}
      <button className="btn-primary mt-4" onClick={() => save.mutate(ordered)} disabled={save.isPending || ordered.length === 0 || !dirty}>
        {save.isPending ? 'Saving…' : 'Save dashboard'}
      </button>
    </Card>
  )
}
