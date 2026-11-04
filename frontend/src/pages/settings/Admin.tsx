import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Badge, Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, fmtDateTime } from '@/lib/format'
import { BackupsCard } from './AdminBackups'

interface AdminUser {
  id: number
  email: string
  name: string
  role: 'user' | 'admin'
  is_active: boolean
  email_verified: boolean
  created_at: string
}
interface AuditRow {
  id: number
  user_id: number | null
  action: string
  ip: string
  detail: unknown
  created_at: string
}

function UsersCard() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const q = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<{ items: AdminUser[] }>('/admin/users') })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { is_active?: boolean; role?: 'user' | 'admin' } }) => api(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast.success('User updated')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const toggle = async (u: AdminUser) => {
    const to = !u.is_active
    if (await confirm({ title: `${to ? 'Enable' : 'Disable'} ${u.email}?`, message: to ? 'They will be able to sign in again.' : 'They will be signed out everywhere and unable to sign in.', confirmLabel: to ? 'Enable' : 'Disable', danger: !to })) update.mutate({ id: u.id, body: { is_active: to } })
  }
  const changeRole = async (u: AdminUser, role: 'user' | 'admin') => {
    if (await confirm({ title: `Change role for ${u.email}?`, message: `Their role becomes "${role}" and their sessions are signed out.`, confirmLabel: 'Change role', danger: false })) update.mutate({ id: u.id, body: { role } })
  }

  return (
    <Card title="Users" padded={false}>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/60 backdrop-blur-sm dark:bg-slate-800/35">
              <tr><th className="th">User</th><th className="th">Role</th><th className="th">Status</th><th className="th">Joined</th><th className="th"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {q.data!.items.map((u) => {
                const self = u.id === me?.id
                return (
                  <tr key={u.id}>
                    <td className="td"><div className="font-medium">{u.name} {self && <Badge tone="blue">You</Badge>}</div><div className="text-xs text-slate-500">{u.email}{u.email_verified ? '' : ' · unverified'}</div></td>
                    <td className="td">
                      <select className="input w-auto py-1" aria-label={`Role for ${u.email}`} value={u.role} disabled={self || update.isPending} onChange={(e) => changeRole(u, e.target.value as 'user' | 'admin')}>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="td"><Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Disabled'}</Badge></td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{fmtDateTime(u.created_at)}</td>
                    <td className="td text-right">
                      <button className="btn-secondary py-1" disabled={self || update.isPending} onClick={() => toggle(u)} title={self ? 'You cannot change your own status' : undefined}>
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">Account metadata only — administrators cannot see anyone's tracking data. You cannot change your own role or status.</p>
    </Card>
  )
}

function AuditCard() {
  const [input, setInput] = useState('')
  const [action, setAction] = useState('')
  const q = useQuery({ queryKey: ['admin', 'audit', action], queryFn: () => api<{ items: AuditRow[] }>('/admin/audit', { query: { action, limit: 100 } }) })
  return (
    <Card
      title="Audit log"
      padded={false}
      action={
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setAction(input.trim()) }}>
          <input className="input w-44 py-1" aria-label="Filter by action" placeholder="Action, e.g. auth.login" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn-secondary py-1">Filter</button>
          {action && <button type="button" className="btn-ghost py-1" onClick={() => { setInput(''); setAction('') }}>Clear</button>}
        </form>
      }
    >
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="No audit events" hint={action ? 'No events match this action.' : undefined} />
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50/70 backdrop-blur-sm dark:bg-slate-800/40">
              <tr><th className="th">When</th><th className="th">Action</th><th className="th">User</th><th className="th">IP</th><th className="th">Detail</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {q.data!.items.map((r) => (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</td>
                  <td className="td font-mono text-xs">{r.action}</td>
                  <td className="td text-xs">{r.user_id ?? '—'}</td>
                  <td className="td text-xs">{r.ip || '—'}</td>
                  <td className="td max-w-xs truncate font-mono text-xs text-slate-500" title={JSON.stringify(r.detail)}>{r.detail ? JSON.stringify(r.detail) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function AdminTab() {
  return (
    <div className="space-y-4">
      <UsersCard />
      <BackupsCard />
      <AuditCard />
    </div>
  )
}
