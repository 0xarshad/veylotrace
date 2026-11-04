import { Badge } from '@/components/ui/Common'
import type { CrudConfig } from '@/crud/ModuleCrud'
import { fmtDateTime, minutes } from '@/lib/format'

export const SOCIAL_KINDS = [
  { value: 'friends', label: 'Time with friends' },
  { value: 'outing', label: 'Outing' },
  { value: 'event', label: 'Personal event' },
  { value: 'note', label: 'Personal note' },
]
export const kindLabel = (k: string) => SOCIAL_KINDS.find((o) => o.value === k)?.label ?? k

export const socialConfig: CrudConfig = {
  resource: 'social',
  title: 'Social & personal',
  singular: 'Entry',
  duplicable: true,
  filters: [{ name: 'kind', label: 'Type', options: SOCIAL_KINDS }],
  fields: [
    { name: 'kind', label: 'Type', type: 'select', required: true, default: 'friends', options: SOCIAL_KINDS },
    { name: 'activity', label: 'Activity', type: 'text', required: true, maxLength: 200 },
    { name: 'occurred_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'duration_min', label: 'Duration (min)', type: 'number', max: 10080 },
    { name: 'participants', label: 'Participants', type: 'text' },
    { name: 'location', label: 'Location', type: 'text', maxLength: 200 },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'personal_notes', label: 'Personal notes', type: 'textarea' },
  ],
  columns: [
    { header: 'When', cell: (r) => fmtDateTime(r.occurred_at) },
    { header: 'Type', cell: (r) => <Badge tone="violet">{kindLabel(r.kind)}</Badge> },
    { header: 'Activity', cell: (r) => <span className="font-medium">{r.activity}</span>, className: 'max-w-xs truncate' },
    { header: 'Participants', cell: (r) => r.participants || '—', className: 'max-w-[12rem] truncate' },
    { header: 'Duration', cell: (r) => (r.duration_min ? minutes(r.duration_min) : '—') },
  ],
}
