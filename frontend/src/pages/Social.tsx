import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { ErrorState, PageHeader, Spinner, StatCard, Tabs } from '@/components/ui/Common'
import { kindLabel, SOCIAL_KINDS, socialConfig } from '@/crud/configs/social'
import { CrudList, type CrudConfig } from '@/crud/ModuleCrud'
import { addDays, minutes, toDateStr } from '@/lib/format'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'friends', label: 'Time with friends' },
  { id: 'outing', label: 'Outings' },
  { id: 'event', label: 'Personal events' },
  { id: 'note', label: 'Personal notes' },
] as const
type TabId = (typeof TABS)[number]['id']

function kindConfig(kind: string): CrudConfig {
  const label = kindLabel(kind)
  return {
    ...socialConfig,
    title: `${label}`,
    singular: label,
    filters: undefined,
    fixedParams: { kind },
    createDefaults: { kind },
    hiddenFields: ['kind'],
    columns: socialConfig.columns.filter((c) => c.header !== 'Type'),
  }
}

function Summary() {
  const end = toDateStr()
  const start = addDays(end, -29)
  const q = useQuery({ queryKey: ['analytics', 'lifestyle', start, end], queryFn: () => api<any>('/analytics/lifestyle', { query: { start, end } }) })
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const s = q.data
  const by: Record<string, number> = s.social_by_kind ?? {}
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Entries (30 days)" value={s.social_count} />
      <StatCard label="Social time" value={minutes(s.social_minutes)} hint="last 30 days" />
      <div className="col-span-2">
        <StatCard label="By type" value={s.social_count ? SOCIAL_KINDS.filter((k) => by[k.value]).map((k) => `${by[k.value]} ${k.label.toLowerCase()}`).join(' · ') : '—'} hint="last 30 days" />
      </div>
    </div>
  )
}

export default function SocialPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'all'
  const [autoAdd, setAutoAdd] = useState(params.get('add') === '1')
  const config = useMemo(() => (tab === 'all' ? socialConfig : kindConfig(tab)), [tab])
  return (
    <>
      <PageHeader title="Social & Personal" subtitle="Time with friends, outings, events and personal notes" />
      <Summary />
      <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setParams({ tab: t })} />
      <CrudList key={tab} config={config} autoAdd={autoAdd} onAutoAddHandled={() => setAutoAdd(false)} />
    </>
  )
}
