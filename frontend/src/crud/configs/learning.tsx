import { Badge, ProgressBar } from '@/components/ui/Common'
import type { CrudConfig } from '@/crud/ModuleCrud'
import { cap, fmtDate, fmtDateTime, minutes } from '@/lib/format'

const opts = (values: string[]) => values.map((v) => ({ value: v, label: cap(v) }))
const LEVEL_TONE = { beginner: 'slate', intermediate: 'blue', advanced: 'violet', expert: 'green' } as const
const COURSE_TONE: Record<string, 'slate' | 'green' | 'blue' | 'red'> = { planned: 'slate', in_progress: 'blue', completed: 'green', dropped: 'red' }

export const skillConfig: CrudConfig = {
  resource: 'skills',
  title: 'Skills',
  singular: 'Skill',
  duplicable: false,
  filters: [{ name: 'level', label: 'Level', options: opts(['beginner', 'intermediate', 'advanced', 'expert']) }],
  fields: [
    { name: 'name', label: 'Skill', type: 'text', required: true, maxLength: 120 },
    { name: 'level', label: 'Level', type: 'select', required: true, default: 'beginner', options: opts(['beginner', 'intermediate', 'advanced', 'expert']) },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Skill', cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: 'Level', cell: (r) => <Badge tone={LEVEL_TONE[r.level as keyof typeof LEVEL_TONE] ?? 'slate'}>{cap(r.level)}</Badge> },
    { header: 'Notes', cell: (r) => r.notes || '—', className: 'max-w-xs truncate' },
  ],
}

export const courseConfig: CrudConfig = {
  resource: 'courses',
  title: 'Courses & certifications',
  singular: 'Course',
  filters: [
    { name: 'kind', label: 'Type', options: opts(['course', 'certification']) },
    { name: 'status', label: 'Status', options: opts(['planned', 'in_progress', 'completed', 'dropped']) },
  ],
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 160 },
    { name: 'kind', label: 'Type', type: 'select', required: true, default: 'course', options: opts(['course', 'certification']) },
    { name: 'provider', label: 'Provider', type: 'text', maxLength: 120 },
    { name: 'status', label: 'Status', type: 'select', required: true, default: 'in_progress', options: opts(['planned', 'in_progress', 'completed', 'dropped']) },
    { name: 'progress', label: 'Progress (%)', type: 'number', min: 0, max: 100, default: 0 },
    { name: 'start_date', label: 'Start date', type: 'date', default: '' },
    { name: 'completed_on', label: 'Completed on', type: 'date', default: '', showIf: (v) => v.status === 'completed' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span>, className: 'max-w-xs truncate' },
    { header: 'Type', cell: (r) => cap(r.kind) },
    { header: 'Provider', cell: (r) => r.provider || '—' },
    { header: 'Status', cell: (r) => <Badge tone={COURSE_TONE[r.status] ?? 'slate'}>{cap(r.status)}</Badge> },
    {
      header: 'Progress',
      cell: (r) => (
        <div className="flex min-w-[8rem] items-center gap-2">
          <ProgressBar value={r.progress} label={`${r.name} progress`} />
          <span className="w-10 text-right text-xs tabular-nums">{Math.round(r.progress)}%</span>
        </div>
      ),
    },
    { header: 'Started', cell: (r) => fmtDate(r.start_date) },
  ],
}

export const studyConfig: CrudConfig = {
  resource: 'study',
  title: 'Study sessions',
  singular: 'Study session',
  fields: [
    { name: 'studied_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'subject', label: 'Subject', type: 'text', required: true, maxLength: 160 },
    { name: 'duration_min', label: 'Duration (min)', type: 'number', max: 1440 },
    { name: 'topic', label: 'Topic', type: 'text', maxLength: 200 },
    { name: 'material', label: 'Material / resource', type: 'text', maxLength: 200 },
    { name: 'progress', label: 'Progress (%)', type: 'number', min: 0, max: 100 },
    { name: 'skill_id', label: 'Skill', type: 'ref', ref: { resource: 'skills', label: (r) => r.name } },
    { name: 'course_id', label: 'Course', type: 'ref', ref: { resource: 'courses', label: (r) => r.name } },
    { name: 'practical_exercises', label: 'Practical exercises', type: 'textarea' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'When', cell: (r) => fmtDateTime(r.studied_at) },
    { header: 'Subject', cell: (r) => <span className="font-medium">{r.subject}</span> },
    { header: 'Topic', cell: (r) => r.topic || '—', className: 'max-w-xs truncate' },
    { header: 'Duration', cell: (r) => minutes(r.duration_min) },
    { header: 'Progress', cell: (r) => (r.progress != null ? `${Math.round(r.progress)}%` : '—') },
  ],
}
