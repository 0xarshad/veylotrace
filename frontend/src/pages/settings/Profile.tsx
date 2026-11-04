import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop } from 'lucide-react'
import { api, ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Badge, Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { TextInput } from '@/components/ui/Form'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, fmtDateTime } from '@/lib/format'
import { PasswordStrength } from '../AuthPages'

interface SessionRow {
  id: string
  created_at: string
  last_used_at: string
  user_agent: string
  ip: string
  current: boolean
}

function ChangePassword() {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const m = useMutation({
    mutationFn: () => api<{ message: string }>('/auth/change-password', { method: 'POST', body: form }),
    onSuccess: (r) => {
      setForm({ current_password: '', new_password: '', confirm_password: '' })
      setErrors({})
      setFormError(null)
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] })
      toast.success(r.message)
    },
    onError: (e) => {
      setErrors(e instanceof ApiError ? e.fieldErrors() : {})
      setFormError(errorMessage(e))
    },
  })

  return (
    <Card title="Change password">
      <form
        className="max-w-md space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (form.new_password !== form.confirm_password) return setErrors({ confirm_password: 'Passwords do not match.' })
          setErrors({})
          m.mutate()
        }}
      >
        <TextInput label="Current password" type="password" autoComplete="current-password" required value={form.current_password} onChange={set('current_password')} error={errors.current_password} />
        <div>
          <TextInput label="New password" type="password" autoComplete="new-password" required value={form.new_password} onChange={set('new_password')} error={errors.new_password} />
          <PasswordStrength password={form.new_password} email={user?.email} name={user?.name} />
        </div>
        <TextInput label="Confirm new password" type="password" autoComplete="new-password" required value={form.confirm_password} onChange={set('confirm_password')} error={errors.confirm_password} />
        {formError && !Object.keys(errors).length && <p role="alert" className="text-sm text-rose-600">{formError}</p>}
        <button className="btn-primary" disabled={m.isPending}>{m.isPending ? 'Updating…' : 'Change password'}</button>
        <p className="text-xs text-slate-500">Changing your password signs out your other devices.</p>
      </form>
    </Card>
  )
}

function Sessions() {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const q = useQuery({ queryKey: ['auth', 'sessions'], queryFn: () => api<SessionRow[]>('/auth/sessions') })
  const revoke = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api(`/auth/sessions/${id}`, { method: 'DELETE' }))),
    onSuccess: (_r, ids) => {
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] })
      toast.success(ids.length > 1 ? 'Other sessions revoked' : 'Session revoked')
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] })
      toast.error(errorMessage(e))
    },
  })
  const others = (q.data ?? []).filter((s) => !s.current)

  return (
    <Card
      title="Active sessions"
      action={others.length > 0 && (
        <button
          className="btn-secondary py-1"
          onClick={async () => (await confirm({ title: 'Revoke other sessions?', message: `${others.length} other device(s) will be signed out.`, confirmLabel: 'Revoke all' })) && revoke.mutate(others.map((s) => s.id))}
        >
          Revoke other sessions
        </button>
      )}
    >
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.length === 0 ? (
        <EmptyState title="No active sessions" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {q.data!.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <Laptop className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={s.user_agent}>{s.user_agent || 'Unknown device'} {s.current && <Badge tone="green">This device</Badge>}</p>
                <p className="text-xs text-slate-500">{s.ip || 'Unknown IP'} · signed in {fmtDateTime(s.created_at)} · last active {fmtDateTime(s.last_used_at)}</p>
              </div>
              {!s.current && (
                <button
                  className="btn-ghost text-rose-600"
                  disabled={revoke.isPending}
                  onClick={async () => (await confirm({ title: 'Revoke this session?', message: 'That device will be signed out.', confirmLabel: 'Revoke' })) && revoke.mutate([s.id])}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function ProfileTab() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const logoutAll = useMutation({
    mutationFn: () => api('/auth/logout-all', { method: 'POST' }),
    onSuccess: async () => {
      await logout()
      navigate('/login')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <Card title="Profile">
        <div className="grid max-w-md gap-3">
          <TextInput label="Name" value={user?.name ?? ''} readOnly help="Shown across the app." />
          <TextInput label="Email" value={user?.email ?? ''} readOnly help={user?.email_verified ? 'Verified' : 'Not verified yet'} />
        </div>
      </Card>
      <ChangePassword />
      <Sessions />
      <Card title="Sign out everywhere">
        <p className="mb-3 text-sm text-slate-500">Ends every session on all devices, including this one.</p>
        <button
          className="btn-secondary"
          disabled={logoutAll.isPending}
          onClick={async () => (await confirm({ title: 'Sign out of all devices?', message: 'You will need to sign in again everywhere.', confirmLabel: 'Sign out all' })) && logoutAll.mutate()}
        >
          Sign out of all devices
        </button>
      </Card>
    </div>
  )
}
