import { Badge, ProgressBar } from '@/components/ui/Common'
import type { CrudConfig } from '@/crud/ModuleCrud'
import { cap, fmtDate, minutes, toDateStr } from '@/lib/format'

export const PRIORITY_TONE = { low: 'slate', medium: 'blue', high: 'amber', urgent: 'red' } as const
const STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = { pending: 'slate', in_progress: 'blue', completed: 'green', cancelled: 'red', active: 'blue', paused: 'amber' }

const opts = (values: string[]) => values.map((v) => ({ value: v, label: cap(v) }))

export const taskConfig: CrudConfig = {
  resource: 'tasks',
  title: 'Tasks',
  singular: 'Task',
  duplicable: true,
  filters: [
    { name: 'status', label: 'Status', options: opts(['pending', 'in_progress', 'completed', 'cancelled']) },
    { name: 'priority', label: 'Priority', options: opts(['low', 'medium', 'high', 'urgent']) },
  ],
  fields: [
    { name: 'name', label: 'Task', type: 'text', required: true, maxLength: 200 },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'priority', label: 'Priority', type: 'select', required: true, default: 'medium', options: opts(['low', 'medium', 'high', 'urgent']) },
    { name: 'due_date', label: 'Due date', type: 'date', default: '' },
    { name: 'estimated_min', label: 'Estimated (min)', type: 'number', max: 100000 },
    { name: 'actual_min', label: 'Actual (min)', type: 'number', max: 100000 },
    { name: 'status', label: 'Status', type: 'select', required: true, default: 'pending', options: opts(['pending', 'in_progress', 'completed', 'cancelled']) },
    { name: 'goal_id', label: 'Goal', type: 'ref', ref: { resource: 'goals', label: (r) => r.name } },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Task', cell: (r) => <span className={r.status === 'completed' ? 'text-slate-500 line-through' : 'font-medium'}>{r.name}</span>, className: 'max-w-xs truncate' },
    { header: 'Priority', cell: (r) => <Badge tone={PRIORITY_TONE[r.priority as keyof typeof PRIORITY_TONE] ?? 'slate'}>{cap(r.priority)}</Badge> },
    {
      header: 'Due',
      cell: (r) => {
        const overdue = r.due_date && r.due_date < toDateStr() && r.status !== 'completed' && r.status !== 'cancelled'
        return <span className={overdue ? 'font-medium text-rose-600' : ''}>{fmtDate(r.due_date)}{overdue ? ' (overdue)' : ''}</span>
      },
    },
    { header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{cap(r.status)}</Badge> },
    { header: 'Est. / actual', cell: (r) => (r.estimated_min != null || r.actual_min != null ? `${r.estimated_min != null ? minutes(r.estimated_min) : '—'} / ${r.actual_min != null ? minutes(r.actual_min) : '—'}` : '—') },
  ],
}

export const goalConfig: CrudConfig = {
  resource: 'goals',
  title: 'Goals',
  singular: 'Goal',
  duplicable: false,
  filters: [{ name: 'status', label: 'Status', options: opts(['active', 'completed', 'paused', 'cancelled']) }],
  fields: [
    { name: 'name', label: 'Goal', type: 'text', required: true, maxLength: 160 },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'start_date', label: 'Start date', type: 'date', default: '' },
    { name: 'target_date', label: 'Target date', type: 'date', default: '' },
    { name: 'progress', label: 'Progress (%)', type: 'number', min: 0, max: 100, default: 0, help: 'Used only when the goal has no milestones' },
    { name: 'status', label: 'Status', type: 'select', required: true, default: 'active', options: opts(['active', 'completed', 'paused', 'cancelled']) },
    { name: 'milestones', label: 'Milestones', type: 'list', listLabel: 'Add milestone', listFields: [
      { name: 'title', label: 'Milestone', type: 'text', required: true, maxLength: 160 },
      { name: 'due_date', label: 'Due date', type: 'date', default: '' },
      { name: 'completed', label: 'Done', type: 'checkbox' },
    ] },
  ],
  columns: [
    { header: 'Goal', cell: (r) => <span className="font-medium">{r.name}</span>, className: 'max-w-xs truncate' },
    { header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{cap(r.status)}</Badge> },
    {
      header: 'Progress',
      cell: (r) => (
        <div className="flex min-w-[8rem] items-center gap-2">
          <ProgressBar value={r.effective_progress} label={`${r.name} progress`} />
          <span className="w-10 text-right text-xs tabular-nums">{Math.round(r.effective_progress)}%</span>
        </div>
      ),
    },
    { header: 'Target date', cell: (r) => fmtDate(r.target_date) },
  ],
}
