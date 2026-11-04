import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Download, FileUp, Loader2, RotateCcw, ShieldAlert } from 'lucide-react'
import { api, download } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Card, ErrorState, Spinner } from '@/components/ui/Common'
import { TextInput } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { cap, errorMessage, toDateStr } from '@/lib/format'

interface ImportResult {
  dry_run: boolean
  tables: Record<string, { imported: number; duplicates: number; invalid: number }>
  totals: { imported: number; duplicates: number; invalid: number }
  errors: string[]
}

interface ResetResult {
  dry_run: boolean
  sections: string[]
  start: string | null
  end: string | null
  tables: Record<string, number>
  total: number
}

const RESET_SECTIONS = [
  ['finance', 'Finance'], ['health', 'Health'], ['nutrition', 'Nutrition'], ['productivity', 'Productivity'],
  ['learning', 'Learning'], ['lifestyle', 'Lifestyle'], ['social', 'Social'], ['challenges', 'Challenges'],
] as const

const MAX_IMPORT_BYTES = 25 * 1024 * 1024

function ExportCard() {
  const toast = useToast()
  const tables = useQuery({ queryKey: ['data', 'tables'], queryFn: () => api<string[]>('/data/export/tables'), staleTime: 3600_000 })
  const [table, setTable] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const chosen = table || tables.data?.[0] || ''

  const run = async (key: string, path: string, filename: string) => {
    setBusy(key)
    try {
      await download(path, filename)
      toast.success('Export downloaded')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="Export your data">
      <p className="mb-3 text-sm text-slate-500">Your data is always yours. A JSON export contains everything and can be re-imported later; CSV exports are handy for spreadsheets.</p>
      <div className="space-y-4">
        <button className="btn-primary" disabled={busy !== null} onClick={() => run('json', '/data/export', 'veylotrace-export.json')}>
          {busy === 'json' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export all my data (JSON)
        </button>
        {tables.isLoading ? (
          <Spinner />
        ) : tables.isError ? (
          <ErrorState error={tables.error} onRetry={() => tables.refetch()} />
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="csv-table">Export one table as CSV</label>
              <select id="csv-table" className="input" value={chosen} onChange={(e) => setTable(e.target.value)}>
                {tables.data!.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
              </select>
            </div>
            <button className="btn-secondary" disabled={busy !== null || !chosen} onClick={() => run('csv', `/data/export/csv/${encodeURIComponent(chosen)}`, `veylotrace-${chosen}-${toDateStr()}.csv`)}>
              {busy === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

function ImportCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [payload, setPayload] = useState<unknown>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPayload(null)
    setFileName('')
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const dry = useMutation({
    mutationFn: (p: unknown) => api<ImportResult>('/data/import', { method: 'POST', query: { dry_run: true }, body: p }),
    onSuccess: setPreview,
    onError: (e) => {
      setPreview(null)
      setError(errorMessage(e))
    },
  })
  const run = useMutation({
    mutationFn: () => api<ImportResult>('/data/import', { method: 'POST', query: { dry_run: false }, body: payload }),
    onSuccess: (r) => {
      qc.invalidateQueries()
      toast.success(`Import complete: ${r.totals.imported} added, ${r.totals.duplicates} duplicates skipped`)
      reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onFile = async (file: File | undefined) => {
    setError(null)
    setPreview(null)
    setPayload(null)
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) return setError('This file is too large to import (25 MB limit).')
    setFileName(file.name)
    try {
      const parsed = JSON.parse(await file.text())
      setPayload(parsed)
      dry.mutate(parsed)
    } catch {
      setError('This file is not valid JSON. Choose a VeyloTrace export (.json).')
    }
  }

  return (
    <Card title="Import data">
      <p className="mb-3 text-sm text-slate-500">Restore from a VeyloTrace JSON export. You will see a preview first; duplicates are skipped and nothing is changed until you confirm.</p>
      <label className="label" htmlFor="import-file">Export file (.json)</label>
      <input id="import-file" ref={fileRef} type="file" accept=".json,application/json" className="input" onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <p className="mt-2 text-sm text-rose-600" role="alert">{error}</p>}
      {dry.isPending && <Spinner label="Checking file" />}
      {preview && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="text-sm font-medium">Preview for {fileName}: {preview.totals.imported} to import · {preview.totals.duplicates} duplicates · {preview.totals.invalid} invalid</p>
          {Object.keys(preview.tables).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full">
                <thead className="bg-slate-50/60 backdrop-blur-sm dark:bg-slate-800/35">
                  <tr><th className="th">Table</th><th className="th text-right">Imported</th><th className="th text-right">Duplicates</th><th className="th text-right">Invalid</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {Object.entries(preview.tables).map(([t, c]) => (
                    <tr key={t}><td className="td">{cap(t)}</td><td className="td text-right tabular-nums">{c.imported}</td><td className="td text-right tabular-nums">{c.duplicates}</td><td className="td text-right tabular-nums">{c.invalid}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.errors.length > 0 && (
            <ul className="list-disc rounded-lg bg-amber-50 p-3 pl-7 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending || preview.totals.imported === 0}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Confirm import
            </button>
            <button className="btn-secondary" onClick={reset} disabled={run.isPending}>Cancel</button>
          </div>
          {preview.totals.imported === 0 && <p className="text-xs text-slate-500">Nothing new to import.</p>}
        </div>
      )}
    </Card>
  )
}

function ResetDataCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const [sections, setSections] = useState<string[]>([])
  const [scope, setScope] = useState<'all' | 'day' | 'range'>('all')
  const [day, setDay] = useState(toDateStr())
  const [start, setStart] = useState(toDateStr())
  const [end, setEnd] = useState(toDateStr())
  const [preview, setPreview] = useState<ResetResult | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const chosenSections = sections.length === RESET_SECTIONS.length ? ['all'] : sections
  const payload = {
    sections: chosenSections,
    ...(scope === 'day' ? { start: day, end: day } : scope === 'range' ? { start, end } : {}),
  }
  const clearPreview = () => { setPreview(null); setTyped(''); setError(null) }
  const dry = useMutation({
    mutationFn: () => api<ResetResult>('/data/reset', { method: 'POST', query: { dry_run: true }, body: payload }),
    onSuccess: (result) => { setPreview(result); setTyped(''); setError(null) },
    onError: (e) => { setPreview(null); setError(errorMessage(e)) },
  })
  const run = useMutation({
    mutationFn: () => api<ResetResult>('/data/reset', { method: 'POST', query: { dry_run: false }, body: { ...payload, confirm: 'RESET' } }),
    onSuccess: (result) => {
      qc.invalidateQueries()
      toast.success(`Reset complete: ${result.total} records permanently deleted`)
      clearPreview()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const updateSections = (next: string[]) => { setSections(next); clearPreview() }

  return (
    <Card title="Reset tracker data" className="border-amber-200 dark:border-amber-900">
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Permanently remove records from selected sections. Choose all dates, one day, or a date range, then review the exact record count before confirming.</p>
      <div className="space-y-4">
        <fieldset>
          <legend className="label">Sections</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RESET_SECTIONS.map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                <input type="checkbox" checked={sections.includes(key)} onChange={(e) => updateSections(e.target.checked ? [...sections, key] : sections.filter((s) => s !== key))} />{label}
              </label>
            ))}
          </div>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={sections.length === RESET_SECTIONS.length} onChange={(e) => updateSections(e.target.checked ? RESET_SECTIONS.map(([key]) => key) : [])} />All sections
          </label>
        </fieldset>

        <fieldset>
          <legend className="label">Date scope</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {([['all', 'All dates'], ['day', 'One day'], ['range', 'Date range']] as const).map(([value, label]) => (
              <label key={value} className="inline-flex cursor-pointer items-center gap-2"><input type="radio" name="reset-scope" checked={scope === value} onChange={() => { setScope(value); clearPreview() }} />{label}</label>
            ))}
          </div>
          {scope === 'day' && <div className="mt-3 max-w-xs"><label className="label" htmlFor="reset-day">Day</label><input id="reset-day" className="input" type="date" value={day} onChange={(e) => { setDay(e.target.value); clearPreview() }} /></div>}
          {scope === 'range' && <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="reset-start">From</label><input id="reset-start" className="input" type="date" value={start} max={end} onChange={(e) => { setStart(e.target.value); clearPreview() }} /></div><div><label className="label" htmlFor="reset-end">Through</label><input id="reset-end" className="input" type="date" value={end} min={start} onChange={(e) => { setEnd(e.target.value); clearPreview() }} /></div></div>}
        </fieldset>

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/35 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Date-limited resets remove activity recorded during that period and keep reusable setup such as budgets, goals, food items, books, skills, and templates. “All dates” removes all records in the selected sections, including setup. Account settings and AI conversations are unaffected.</p>
        </div>

        <button className="btn-secondary" disabled={dry.isPending || run.isPending || sections.length === 0 || (scope === 'range' && (!start || !end || start > end)) || (scope === 'day' && !day)} onClick={() => { clearPreview(); dry.mutate() }}>
          {dry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Preview reset
        </button>
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
        {preview && <div className="space-y-3 rounded-xl border border-amber-300 p-4 dark:border-amber-800" aria-live="polite">
          <p className="text-sm font-semibold">{preview.total} record{preview.total === 1 ? '' : 's'} will be permanently deleted.</p>
          {preview.total > 0 && <div className="flex flex-wrap gap-2">{Object.entries(preview.tables).filter(([, count]) => count > 0).map(([table, count]) => <span key={table} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800">{cap(table)}: {count}</span>)}</div>}
          {preview.total === 0 ? <p className="text-sm text-slate-500">No records match this selection.</p> : <div className="max-w-sm space-y-2"><TextInput label='Type "RESET" to permanently delete these records' autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} /><div className="flex gap-2"><button className="btn-danger" disabled={typed !== 'RESET' || run.isPending} onClick={() => { setError(null); run.mutate() }}>{run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Confirm reset</button><button className="btn-secondary" disabled={run.isPending} onClick={clearPreview}>Cancel</button></div></div>}
        </div>}
      </div>
    </Card>
  )
}

function DangerZone() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const del = useMutation({
    mutationFn: () => api('/data/account', { method: 'DELETE', body: { password } }),
    onSuccess: async () => {
      setPassword('')
      await logout()
      navigate('/login')
    },
    onError: (e) => setError(errorMessage(e)),
  })

  return (
    <Card title="Danger zone" className="border-rose-200 dark:border-rose-900">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Deleting your account permanently removes your profile, every record, AI conversations and reports, and saved provider keys. This cannot be undone — export your data first if you may want it later.
      </p>
      <form
        className="max-w-md space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          del.mutate()
        }}
      >
        <TextInput label="Your password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextInput label='Type "DELETE" to confirm' autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} help={user ? `Account: ${user.email}` : undefined} />
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
        <button className="btn-danger" disabled={del.isPending || !password || typed !== 'DELETE'}>{del.isPending ? 'Deleting…' : 'Delete my account'}</button>
      </form>
    </Card>
  )
}

export function DataTab() {
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
        VeyloTrace works fully without any AI provider, and you can always recover or move your data using the exports below.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ExportCard />
        <ImportCard />
      </div>
      <ResetDataCard />
      <DangerZone />
    </div>
  )
}
