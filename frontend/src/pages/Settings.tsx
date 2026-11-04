import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { PageHeader, Tabs } from '@/components/ui/Common'
import { AdminTab } from './settings/Admin'
import { AppearanceTab } from './settings/Appearance'
import { DashboardTab } from './settings/DashboardTab'
import { DataTab } from './settings/DataBackup'
import { ProfileTab } from './settings/Profile'

type TabId = 'profile' | 'appearance' | 'dashboard' | 'data' | 'admin'

export default function SettingsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tabs: { id: TabId; label: string }[] = [
    { id: 'profile', label: 'Profile & Security' },
    { id: 'appearance', label: 'Appearance & Targets' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'data', label: 'Data & Backup' },
    ...(user?.role === 'admin' ? [{ id: 'admin' as const, label: 'Admin' }] : []),
  ]
  const raw = params.get('tab')
  const tab = tabs.find((t) => t.id === raw)?.id ?? 'profile'
  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, preferences and data" />
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'profile' && <ProfileTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'admin' && <AdminTab />}
    </>
  )
}
