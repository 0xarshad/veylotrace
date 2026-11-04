import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Card, ErrorState, Spinner } from '@/components/ui/Common'
import { Checkbox } from '@/components/ui/Form'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { cap, errorMessage } from '@/lib/format'
import { useAIStatus } from './shared'

const MODULE_HINTS: Record<string, string> = {
  finance: 'Spending, income, budgets and savings totals',
  health: 'Workouts, steps and sleep statistics',
  nutrition: 'Calories, macros and water intake totals',
  lifestyle: 'Reading, screen time and habit statistics',
  productivity: 'Task completion and goal progress',
  learning: 'Study time, subjects and course progress',
  social: 'Counts and time spent in social activities',
}

async function deleteAll(listPath: string, itemPath: (id: number) => string): Promise<number> {
  let total = 0
  for (let pass = 0; pass < 20; pass++) {
    const { items } = await api<{ items: { id: number }[] }>(listPath)
    if (items.length === 0) break
    await Promise.all(items.map((i) => api(itemPath(i.id), { method: 'DELETE' })))
    total += items.length
  }
  return total
}

export function PrivacyTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const status = useAIStatus()
  const [enabled, setEnabled] = useState(false)
  const [modules, setModules] = useState<string[]>([])

  useEffect(() => {
    if (status.data) {
      setEnabled(status.data.ai_enabled)
      setModules(status.data.modules)
    }
  }, [status.data])

  const save = useMutation({
    mutationFn: () => api('/settings', { method: 'PUT', body: { ai_enabled: enabled, ai_modules: modules } }),
    onSuccess: () => {
      qc.invalidateQueries()
      toast.success('Privacy settings saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const wipe = useMutation({
    mutationFn: async (what: 'conversations' | 'reports') => {
      const n = what === 'conversations' ? await deleteAll('/ai/conversations', (id) => `/ai/conversations/${id}`) : await deleteAll('/ai/reports', (id) => `/ai/reports/${id}`)
      return { what, n }
    },
    onSuccess: ({ what, n }) => {
      qc.invalidateQueries({ queryKey: ['ai'] })
      toast.success(`Deleted ${n} ${what}`)
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['ai'] })
      toast.error(errorMessage(e))
    },
  })

  const askWipe = async (what: 'conversations' | 'reports') => {
    if (await confirm({ title: `Delete all ${what}?`, message: `Every saved AI ${what.slice(0, -1)} will be permanently deleted. Your tracking data is not affected.`, confirmLabel: 'Delete all' })) wipe.mutate(what)
  }

  if (status.isLoading) return <Spinner />
  if (status.isError) return <ErrorState error={status.error} onRetry={() => status.refetch()} />
  const st = status.data!
  const dirty = enabled !== st.ai_enabled || modules.join() !== [...st.modules].sort().join()
  const toggleModule = (m: string, on: boolean) => setModules(on ? Array.from(new Set([...modules, m])).sort() : modules.filter((x) => x !== m))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="What the AI may read">
        <div className="space-y-4">
          <Checkbox label="Enable AI analysis" checked={enabled} onChange={setEnabled} help="Master switch. When off, nothing is ever sent to any AI provider." />
          <fieldset className="space-y-3" disabled={!enabled}>
            <legend className="label">Allowed data modules</legend>
            {st.available_modules.map((m) => (
              <Checkbox key={m} label={cap(m)} help={MODULE_HINTS[m]} checked={modules.includes(m)} onChange={(v) => toggleModule(m, v)} />
            ))}
          </fieldset>
          {enabled && modules.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-400" role="status">Choose at least one module — otherwise the AI has nothing to analyse.</p>}
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !dirty}>{save.isPending ? 'Saving…' : 'Save privacy settings'}</button>
        </div>
      </Card>

      <Card title="How your data is used">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li><strong>What is sent:</strong> {st.privacy.sent}</li>
          <li>Only the modules you tick above are ever included, and only for the selected date range.</li>
          <li>The AI is <strong>read-only</strong>: it has no tools or database access and cannot create, change or delete any of your records.</li>
          <li>All figures are calculated by the app; the AI only interprets them and can still make mistakes.</li>
          <li>There is <strong>no automatic fallback</strong> from a local provider to a cloud provider — if a request fails you choose what to do next.</li>
          <li>{st.privacy.external ? 'Your default provider is external: statistics are sent to that service, which is why consent is required.' : 'Your default provider keeps data on your machine.'}</li>
          <li>Conversations and reports are stored separately from your tracking data and can be deleted below at any time.</li>
        </ul>
      </Card>

      <Card title="Stored AI content" className="lg:col-span-2">
        <p className="mb-3 text-sm text-slate-500">Delete what the assistant has saved. This never touches your finance, health or other tracking records.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => askWipe('conversations')} disabled={wipe.isPending}>Delete all conversations</button>
          <button className="btn-secondary" onClick={() => askWipe('reports')} disabled={wipe.isPending}>Delete all reports</button>
        </div>
      </Card>
    </div>
  )
}
