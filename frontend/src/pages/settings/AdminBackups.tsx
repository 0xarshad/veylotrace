import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Download, Loader2, Lock, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { api, download } from '@/api/client'
import { Badge, Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, fmtDateTime } from '@/lib/format'

interface Backup {
  name: string
  created_at: string
  size: number
  sha256: string
  encrypted: boolean
  label?: string
}
interface Verify {
  name: string
  checksum_ok: boolean | null
  integrity_ok: boolean
  ok: boolean
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export function BackupsCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [verifying, setVerifying] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, Verify | string>>({})
  const [restoring, setRestoring] = useState<Backup | null>(null)
  const [typed, setTyped] = useState('')
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['admin', 'backups'], queryFn: () => api<{ items: Backup[] }>('/admin/backups') })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'backups'] })

  const create = useMutation({ mutationFn: () => api<Backup>('/admin/backups', { method: 'POST' }), onSuccess: (b) => { refresh(); toast.success(`Backup created: ${b.name}`) }, onError: (e) => toast.error(errorMessage(e)) })
  const remove = useMutation({ mutationFn: (name: string) => api(`/admin/backups/${encodeURIComponent(name)}`, { method: 'DELETE' }), onSuccess: () => { refresh(); toast.success('Backup deleted') }, onError: (e) => toast.error(errorMessage(e)) })
  const restore = useMutation({
    mutationFn: (name: string) => api<{ restored: string; safety_backup: string }>(`/admin/backups/${encodeURIComponent(name)}/restore`, { method: 'POST', body: { confirm: 'RESTORE' } }),
    onSuccess: (r) => {
      toast.success(`Restored. A safety backup (${r.safety_backup}) was created. Reloading…`)
      setRestoring(null)
      setTimeout(() => window.location.reload(), 1500)
    },
    onError: (e) => setRestoreError(errorMessage(e)),
  })

  const verify = async (name: string) => {
    setVerifying(name)
    try {
      const res = await api<Verify>(`/admin/backups/${encodeURIComponent(name)}/verify`, { method: 'POST' })
      setResults((r) => ({ ...r, [name]: res }))
    } catch (e) {
      setResults((r) => ({ ...r, [name]: errorMessage(e) }))
    } finally {
      setVerifying(null)
    }
  }
  const dl = async (name: string) => {
    try {
      await download(`/admin/backups/${encodeURIComponent(name)}/download`, name)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const askDelete = async (b: Backup) => {
    if (await confirm({ title: 'Delete backup?', message: `${b.name} will be permanently deleted.` })) remove.mutate(b.name)
  }
  const closeRestore = () => {
    setRestoring(null)
    setTyped('')
    setRestoreError(null)
  }

  return (
    <Card
      title="Database backups"
      padded={false}
      action={<button className="btn-primary py-1" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} Create backup</button>}
    >
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="No backups yet" hint="Create a backup to snapshot the whole database." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {q.data!.items.map((b) => {
            const r = results[b.name]
            return (
              <li key={b.name} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all text-sm font-medium">{b.name}</span>
                  {b.encrypted && <Badge tone="violet"><Lock className="mr-1 h-3 w-3" />Encrypted</Badge>}
                  {b.label && <Badge>{b.label}</Badge>}
                  <span className="text-xs text-slate-500">{fmtSize(b.size)} · {fmtDateTime(b.created_at)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary py-1" onClick={() => verify(b.name)} disabled={verifying === b.name}>
                    {verifying === b.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify
                  </button>
                  <button className="btn-secondary py-1" onClick={() => dl(b.name)}><Download className="h-4 w-4" /> Download</button>
                  <button className="btn-secondary py-1" onClick={() => setRestoring(b)}><RotateCcw className="h-4 w-4" /> Restore</button>
                  <button className="btn-ghost py-1 text-rose-600" onClick={() => askDelete(b)} disabled={remove.isPending}><Trash2 className="h-4 w-4" /> Delete</button>
                </div>
                {typeof r === 'string' && <p className="text-xs text-rose-600" role="alert">{r}</p>}
                {r && typeof r !== 'string' && (
                  <p className={`text-xs ${r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`} role="status">
                    {r.ok ? 'Verified' : 'Verification failed'} — checksum {r.checksum_ok === null ? 'unknown (no metadata)' : r.checksum_ok ? 'matches' : 'MISMATCH'}, integrity {r.integrity_ok ? 'OK' : 'FAILED'}. <span className="font-mono">sha256 {b.sha256.slice(0, 16)}…</span>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">Scheduled backups are configured with AUTO_BACKUP_HOURS on the server. Restoring replaces the whole database for every user; a safety backup is taken first.</p>

      <Modal
        open={!!restoring}
        onClose={closeRestore}
        title="Restore database backup"
        footer={
          <>
            <button className="btn-secondary" onClick={closeRestore}>Cancel</button>
            <button className="btn-danger" disabled={typed !== 'RESTORE' || restore.isPending} onClick={() => { setRestoreError(null); restore.mutate(restoring!.name) }}>
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>This replaces the <strong>entire database</strong> (all users) with <span className="break-all font-mono text-xs">{restoring?.name}</span>. Changes made since that backup will be lost. The app reloads afterwards.</p>
          <label className="label" htmlFor="restore-confirm">Type RESTORE to confirm</label>
          <input id="restore-confirm" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {restoreError && <p className="text-rose-600" role="alert">{restoreError}</p>}
        </div>
      </Modal>
    </Card>
  )
}
