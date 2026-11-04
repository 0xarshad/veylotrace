import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { api, ApiError, type ListResponse } from '@/api/client'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Form'
import { Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { useToast } from '@/components/ui/Toast'
import { dateWithNow, errorMessage, toDateStr, toDateTimeLocal } from '@/lib/format'

export type Row = Record<string, any>
type Option = { value: string | number; label: string }

export interface FieldDef {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'datetime' | 'select' | 'checkbox' | 'ref' | 'list'
  required?: boolean
  options?: Option[]
  ref?: { resource: string; label: (r: Row) => string; params?: Record<string, string>; rootsOnly?: boolean; parentField?: string }
  default?: string | number | boolean | (() => string | number | boolean)
  min?: number
  max?: number
  step?: string
  placeholder?: string
  help?: string
  wide?: boolean
  showIf?: (values: Row) => boolean
  listFields?: FieldDef[]
  listLabel?: string
  maxLength?: number
}

export interface ColumnDef {
  header: string
  cell: (row: Row) => ReactNode
  className?: string
}

export interface FilterDef {
  name: string
  label: string
  options: Option[]
}

export interface CrudConfig {
  resource: string
  title: string
  singular: string
  fields: FieldDef[]
  columns: ColumnDef[]
  filters?: FilterDef[]
  dateFilter?: boolean
  search?: boolean
  duplicable?: boolean
  sort?: string
  emptyHint?: string
  /** Default list filter values, e.g. { kind: 'gym' } for sub-tabs sharing a resource. */
  fixedParams?: Record<string, string>
  /** Values merged into new records (e.g. kind for a sub-tab). */
  createDefaults?: Row
  /** Hide these fields in the form (fixed by the sub-tab). */
  hiddenFields?: string[]
}

const PAGE = 20

function initialValue(f: FieldDef, dateHint?: string): any {
  const d = typeof f.default === 'function' ? f.default() : f.default
  if (d !== undefined) return d
  if (f.type === 'checkbox') return false
  if (f.type === 'list') return []
  if (f.type === 'date') return dateHint ?? toDateStr()
  if (f.type === 'datetime') return dateHint ? dateWithNow(dateHint) : toDateTimeLocal()
  return ''
}

function fromRow(fields: FieldDef[], row: Row): Row {
  const out: Row = {}
  for (const f of fields) {
    const v = row[f.name]
    if (f.type === 'list') out[f.name] = ((v as Row[]) ?? []).map((r) => fromRow(f.listFields ?? [], r))
    else if (v === null || v === undefined) out[f.name] = f.type === 'checkbox' ? false : ''
    else if (f.type === 'datetime') out[f.name] = String(v).slice(0, 16)
    else if (f.type === 'date') out[f.name] = String(v).slice(0, 10)
    else if (f.type === 'checkbox') out[f.name] = !!v
    else out[f.name] = typeof v === 'number' ? String(v) : v
  }
  return out
}

function toPayload(fields: FieldDef[], values: Row, editing: boolean): Row {
  const out: Row = {}
  for (const f of fields) {
    if (f.showIf && !f.showIf(values)) continue
    const v = values[f.name]
    if (f.type === 'list') {
      out[f.name] = ((v as Row[]) ?? []).map((r) => toPayload(f.listFields ?? [], r, false))
      continue
    }
    if (f.type === 'checkbox') {
      out[f.name] = !!v
      continue
    }
    if (v === '' || v === undefined || v === null) {
      if (editing) out[f.name] = null
      continue
    }
    if (f.type === 'number') out[f.name] = Number(v)
    else if (f.type === 'ref') out[f.name] = Number(v)
    else if (f.type === 'money') out[f.name] = String(v).trim()
    else out[f.name] = typeof v === 'string' ? v.trim() : v
  }
  return out
}

function RefSelect({ field, value, onChange, error, formValues }: { field: FieldDef; value: string; onChange: (v: string) => void; error?: string; formValues?: Row }) {
  const q = useQuery({
    queryKey: ['ref', field.ref!.resource, field.ref!.params],
    queryFn: () => api<ListResponse<Row>>(`/${field.ref!.resource}`, { query: { limit: 500, ...field.ref!.params } }),
    staleTime: 30_000,
  })
  const parentId = field.ref!.parentField ? Number(formValues?.[field.ref!.parentField]) : undefined
  const rows = (q.data?.items ?? []).filter((r) => {
    if (field.ref!.rootsOnly) return !r.parent_id
    if (field.ref!.parentField) return Number.isFinite(parentId) && parentId! > 0 && r.parent_id === parentId
    return true
  })
  const options = rows.map((r) => ({ value: r.id, label: field.ref!.label(r) }))
  return <SelectInput label={field.label} value={value} onChange={(e) => onChange(e.target.value)} options={options} placeholder={q.isLoading ? 'Loading…' : field.ref!.parentField && !parentId ? 'Choose a category first' : '— none —'} error={error} help={field.help} disabled={!!field.ref!.parentField && !parentId} />
}

export function FieldInput({ field, value, onChange, error, formValues }: { field: FieldDef; value: any; onChange: (v: any) => void; error?: string; formValues?: Row }) {
  const common = { label: field.label, error, required: field.required }
  switch (field.type) {
    case 'textarea':
      return <TextArea {...common} value={value} maxLength={field.maxLength ?? 4000} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} wrapperClass="sm:col-span-2" />
    case 'number':
    case 'money':
      return <TextInput {...common} type="number" inputMode="decimal" min={field.min ?? (field.type === 'money' ? 0.01 : 0)} max={field.max} step={field.step ?? (field.type === 'money' ? '0.01' : 'any')} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} help={field.help} />
    case 'date':
      return <TextInput {...common} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    case 'datetime':
      return <TextInput {...common} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return <SelectInput {...common} value={value} onChange={(e) => onChange(e.target.value)} options={field.options ?? []} placeholder={field.required ? undefined : '— none —'} />
    case 'ref':
      return <RefSelect field={field} value={String(value ?? '')} onChange={onChange} error={error} formValues={formValues} />
    case 'checkbox':
      return <Checkbox label={field.label} checked={!!value} onChange={onChange} help={field.help} />
    default:
      return <TextInput {...common} value={value} maxLength={field.maxLength ?? 255} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} help={field.help} />
  }
}

function ListEditor({ field, rows, onChange }: { field: FieldDef; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const blank = () => Object.fromEntries((field.listFields ?? []).map((f) => [f.name, initialValue(f)]))
  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{field.label}</span>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onChange([...rows, blank()])}>
          <Plus className="h-3.5 w-3.5" /> {field.listLabel ?? 'Add'}
        </button>
      </div>
      {rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700">Nothing added yet.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="relative grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 pr-9 dark:border-slate-800 sm:grid-cols-4">
            {(field.listFields ?? []).map((lf) => (
              <FieldInput key={lf.name} field={lf} value={r[lf.name]} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, [lf.name]: v } : x)))} />
            ))}
            <button type="button" aria-label="Remove row" className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface RecordFormProps {
  config: CrudConfig
  open: boolean
  onClose: () => void
  editing: Row | null
  dateHint?: string
  onSaved?: (row: Row) => void
}

/** Add/Edit dialog, reusable on its own (the Daily Tracker uses it for quick entry). */
export function RecordForm({ config, open, onClose, editing, dateHint, onSaved }: RecordFormProps) {
  const toast = useToast()
  const qc = useQueryClient()
  const visible = config.fields.filter((f) => !config.hiddenFields?.includes(f.name))
  const blank = useMemo(() => ({ ...Object.fromEntries(config.fields.map((f) => [f.name, initialValue(f, dateHint)])), ...config.createDefaults }), [config, dateHint])
  const [values, setValues] = useState<Row>(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      setValues(editing ? fromRow(config.fields, editing) : blank)
      setErrors({})
      setFormError('')
    }
  }, [open, editing, blank, config.fields])

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...toPayload(visible, values, !!editing), ...(editing ? {} : config.createDefaults) }
      return editing ? api<Row>(`/${config.resource}/${editing.id}`, { method: 'PATCH', body: payload }) : api<Row>(`/${config.resource}`, { method: 'POST', body: payload })
    },
    onSuccess: (row) => {
      toast.success(`${config.singular} ${editing ? 'updated' : 'added'}.`)
      qc.invalidateQueries()
      onSaved?.(row)
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors())
        setFormError(Object.keys(e.fieldErrors()).length ? 'Please fix the highlighted fields.' : e.message)
      } else setFormError(errorMessage(e))
    },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`${editing ? 'Edit' : 'Add'} ${config.singular.toLowerCase()}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn-primary" form="crud-form" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form
        id="crud-form"
        onSubmit={(e) => {
          e.preventDefault()
          setErrors({})
          setFormError('')
          save.mutate()
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {formError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200 sm:col-span-2">
            {formError}
          </div>
        )}
        {visible.map((f) => {
          if (f.showIf && !f.showIf(values)) return null
          if (f.type === 'list') return <ListEditor key={f.name} field={f} rows={values[f.name] ?? []} onChange={(rows) => setValues((v) => ({ ...v, [f.name]: rows }))} />
          const update = (value: any) => setValues((current) => ({
            ...current,
            [f.name]: value,
            ...(f.name === 'category_id' && current.subcategory_id ? { subcategory_id: '' } : {}),
          }))
          return (
            <div key={f.name} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <FieldInput field={f} value={values[f.name]} error={errors[f.name]} onChange={update} formValues={values} />
            </div>
          )
        })}
      </form>
    </Modal>
  )
}

export function CrudList({ config, actions, autoAdd, onAutoAddHandled }: { config: CrudConfig; actions?: ReactNode; autoAdd?: boolean; onAutoAddHandled?: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [deleted, setDeleted] = useState(false)
  const [page, setPage] = useState(0)
  const [form, setForm] = useState<{ open: boolean; row: Row | null }>({ open: false, row: null })

  useEffect(() => {
    if (autoAdd) {
      setForm({ open: true, row: null })
      onAutoAddHandled?.()
    }
  }, [autoAdd, onAutoAddHandled])

  const params = { ...config.fixedParams, q: q || undefined, date_from: from || undefined, date_to: to || undefined, deleted: deleted || undefined, sort: config.sort, limit: PAGE, offset: page * PAGE, ...filters }
  const list = useQuery({ queryKey: ['crud', config.resource, params], queryFn: () => api<ListResponse<Row>>(`/${config.resource}`, { query: params as any }), placeholderData: (p) => p })

  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const remove = async (row: Row) => {
    if (!(await confirm({ title: `Delete ${config.singular.toLowerCase()}?`, message: 'It moves to “Show deleted” where you can restore it.', confirmLabel: 'Delete' }))) return
    run.mutate(() => api(`/${config.resource}/${row.id}`, { method: 'DELETE' }).then(() => toast.success(`${config.singular} deleted.`)))
  }
  const restore = (row: Row) => run.mutate(() => api(`/${config.resource}/${row.id}/restore`, { method: 'POST' }).then(() => toast.success(`${config.singular} restored.`)))
  const duplicate = (row: Row) => run.mutate(() => api(`/${config.resource}/${row.id}/duplicate`, { method: 'POST' }).then(() => toast.success(`${config.singular} duplicated.`)))

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const reset = () => setPage(0)
  const hasFilters = !!(q || from || to || Object.values(filters).some(Boolean))

  return (
    <Card padded={false} title={config.title} action={<div className="flex gap-2">{actions}<button className="btn-primary px-3 py-1.5" onClick={() => setForm({ open: true, row: null })}><Plus className="h-4 w-4" /> Add {config.singular.toLowerCase()}</button></div>}>
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
        {config.search !== false && (
          <div className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-8" placeholder="Search…" aria-label={`Search ${config.title}`} value={q} onChange={(e) => { setQ(e.target.value); reset() }} />
          </div>
        )}
        {config.dateFilter !== false && (
          <>
            <input type="date" className="input w-auto" aria-label="From date" value={from} onChange={(e) => { setFrom(e.target.value); reset() }} />
            <input type="date" className="input w-auto" aria-label="To date" value={to} onChange={(e) => { setTo(e.target.value); reset() }} />
          </>
        )}
        {config.filters?.map((f) => (
          <select key={f.name} className="input w-auto" aria-label={f.label} value={filters[f.name] ?? ''} onChange={(e) => { setFilters((s) => ({ ...s, [f.name]: e.target.value })); reset() }}>
            <option value="">{f.label}: all</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {hasFilters && <button className="btn-ghost px-2" onClick={() => { setQ(''); setFrom(''); setTo(''); setFilters({}); reset() }}>Clear</button>}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={deleted} onChange={(e) => { setDeleted(e.target.checked); reset() }} /> Show deleted
        </label>
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
      ) : items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No matching records' : deleted ? 'No deleted records' : `No ${config.title.toLowerCase()} yet`}
          hint={hasFilters ? 'Try adjusting your search or filters.' : config.emptyHint ?? `Add your first ${config.singular.toLowerCase()} to start tracking.`}
          action={!hasFilters && !deleted ? <button className="btn-primary" onClick={() => setForm({ open: true, row: null })}><Plus className="h-4 w-4" /> Add {config.singular.toLowerCase()}</button> : undefined}
        />
      ) : (
        <div className="max-h-[72vh] overflow-auto overscroll-contain">
          <table className="w-full min-w-[32rem]">
            <thead className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
              <tr>
                {config.columns.map((c) => <th key={c.header} className="th">{c.header}</th>)}
                <th className="th w-28 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((row) => (
                <tr key={row.id} className={deleted ? 'opacity-60' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'}>
                  {config.columns.map((c) => <td key={c.header} className={`td ${c.className ?? ''}`}>{c.cell(row)}</td>)}
                  <td className="td">
                    <div className="flex justify-end gap-0.5">
                      {deleted ? (
                        <button className="btn-ghost px-2 py-1" onClick={() => restore(row)} aria-label="Restore"><RotateCcw className="h-4 w-4" /></button>
                      ) : (
                        <>
                          <button className="btn-ghost px-2 py-1" onClick={() => setForm({ open: true, row })} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                          {config.duplicable && <button className="btn-ghost px-2 py-1" onClick={() => duplicate(row)} aria-label="Duplicate"><Copy className="h-4 w-4" /></button>}
                          <button className="btn-ghost px-2 py-1 text-rose-600" onClick={() => remove(row)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
          <span>{total} records</span>
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <span>Page {page + 1} / {pages}</span>
            <button className="btn-ghost px-2 py-1" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <RecordForm config={config} open={form.open} editing={form.row} onClose={() => setForm({ open: false, row: null })} />
    </Card>
  )
}
