import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { buildChallengeConfig, TEMPLATES, type Metric, type Template } from '@/crud/configs/challenges'
import { FieldInput, type Row } from '@/crud/ModuleCrud'
import { errorMessage, toDateStr } from '@/lib/format'

function blankValues(metrics: Metric[], template?: Template | null): Row {
  const first = metrics.find((m) => m.key !== 'manual') ?? metrics[0]
  const m = (template ? metrics.find((x) => x.key === template.metric) : undefined) ?? first
  return {
    name: template?.name ?? '',
    description: '',
    metric: m?.key ?? '',
    comparator: template?.comparator ?? m?.comparator ?? 'gte',
    target: String(template?.target ?? m?.default_target ?? 1),
    frequency: template?.frequency ?? 'daily',
    start_date: toDateStr(),
    end_date: '',
  }
}

function fromChallenge(c: Row): Row {
  return {
    name: c.name,
    description: c.description ?? '',
    metric: c.metric,
    comparator: c.comparator,
    target: String(c.target),
    frequency: c.frequency,
    start_date: String(c.start_date).slice(0, 10),
    end_date: c.end_date ? String(c.end_date).slice(0, 10) : '',
  }
}

export function ChallengeForm({ open, onClose, metrics, editing, template }: { open: boolean; onClose: () => void; metrics: Metric[]; editing: Row | null; template?: Template | null }) {
  const toast = useToast()
  const qc = useQueryClient()
  const config = useMemo(() => buildChallengeConfig(metrics), [metrics])
  const [values, setValues] = useState<Row>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setValues(editing ? fromChallenge(editing) : blankValues(metrics, template))
    setErrors({})
    setFormError('')
  }, [open, editing, template, metrics])

  const set = (name: string, v: any) => setValues((s) => ({ ...s, [name]: v }))
  const pickMetric = (key: string) => {
    const m = metrics.find((x) => x.key === key)
    setValues((s) => ({ ...s, metric: key, comparator: m?.comparator ?? s.comparator, target: m ? String(m.default_target) : s.target }))
  }
  const applyTemplate = (t: Template) => setValues((s) => ({ ...s, ...blankValues(metrics, t), description: s.description, start_date: s.start_date, end_date: s.end_date }))

  const manual = values.metric === 'manual'
  const save = useMutation({
    mutationFn: () => {
      const body: Row = {
        name: String(values.name ?? '').trim(),
        description: String(values.description ?? '').trim(),
        metric: values.metric,
        frequency: values.frequency,
        start_date: values.start_date,
      }
      if (!manual) {
        body.comparator = values.comparator
        body.target = Number(values.target)
      }
      if (values.end_date) body.end_date = values.end_date
      else if (editing) body.end_date = null
      return editing ? api<Row>(`/challenges/${editing.id}`, { method: 'PATCH', body }) : api<Row>('/challenges', { method: 'POST', body })
    },
    onSuccess: () => {
      toast.success(`Challenge ${editing ? 'updated' : 'created'}.`)
      qc.invalidateQueries()
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors())
        setFormError(Object.keys(e.fieldErrors()).length ? 'Please fix the highlighted fields.' : e.message)
      } else setFormError(errorMessage(e))
    },
  })

  const submit = () => {
    const local: Record<string, string> = {}
    if (!String(values.name ?? '').trim()) local.name = 'Name is required.'
    if (!values.metric) local.metric = 'Choose what to track.'
    if (!manual && (values.target === '' || Number.isNaN(Number(values.target)) || Number(values.target) < 0)) local.target = 'Enter a target of 0 or more.'
    if (!values.start_date) local.start_date = 'Start date is required.'
    if (values.end_date && values.end_date < values.start_date) local.end_date = 'End date must not be before the start date.'
    setErrors(local)
    setFormError(Object.keys(local).length ? 'Please fix the highlighted fields.' : '')
    if (!Object.keys(local).length) save.mutate()
  }

  const metric = metrics.find((m) => m.key === values.metric)
  const available = TEMPLATES.filter((t) => metrics.some((m) => m.key === t.metric))
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? 'Edit challenge' : 'New challenge'}
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" type="submit" form="challenge-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {!editing && available.length > 0 && (
        <div className="mb-4">
          <p className="label">Quick start</p>
          <div className="flex flex-wrap gap-2">
            {available.map((t) => (
              <button key={t.name} type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => applyTemplate(t)}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        id="challenge-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {formError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200 sm:col-span-2">
            {formError}
          </div>
        )}
        {config.fields.map((f) => {
          if (f.showIf && !f.showIf(values)) return null
          const field = f.name === 'target' && metric ? { ...f, label: `Target (${metric.unit === 'amount' ? 'amount' : metric.unit})` } : f
          return (
            <div key={f.name} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <FieldInput field={field} value={values[f.name] ?? ''} error={errors[f.name]} onChange={(v) => (f.name === 'metric' ? pickMetric(v) : set(f.name, v))} />
            </div>
          )
        })}
        {manual && <p className="text-xs text-slate-500 sm:col-span-2">Manual challenges are checked off by you each period; no records are tracked automatically.</p>}
      </form>
    </Modal>
  )
}
