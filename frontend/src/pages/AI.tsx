import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '@/components/ui/Common'
import { AssistantTab } from './ai/Assistant'
import { PrivacyTab } from './ai/Privacy'
import { ProvidersTab } from './ai/Providers'
import { ReportsTab } from './ai/Reports'

const TABS = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'reports', label: 'Reports' },
  { id: 'providers', label: 'AI Providers' },
  { id: 'privacy', label: 'Privacy' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function AIPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'assistant'
  return (
    <>
      <PageHeader title="AI Assistant" subtitle="Optional, read-only insights about your own data — you choose the provider and what it may see" />
      <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'assistant' && <AssistantTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'privacy' && <PrivacyTab />}
    </>
  )
}
