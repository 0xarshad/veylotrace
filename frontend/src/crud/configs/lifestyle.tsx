import { useQuery } from '@tanstack/react-query'
import { api, type ListResponse } from '@/api/client'
import { Badge, ProgressBar } from '@/components/ui/Common'
import type { CrudConfig, Row } from '@/crud/ModuleCrud'
import { fmtDate, fmtDateTime, minutes, num } from '@/lib/format'

const STATUS_TONE = { wishlist: 'slate', reading: 'blue', completed: 'green' } as const

/** Shares the cache key of the form's book picker, so no extra request is made. */
function BookName({ id }: { id: number | null }) {
  const q = useQuery({
    queryKey: ['ref', 'books', undefined],
    queryFn: () => api<ListResponse<Row>>('/books', { query: { limit: 500 } }),
    staleTime: 30_000,
  })
  if (id == null) return <span className="text-slate-400">—</span>
  return <>{q.data?.items.find((b) => b.id === id)?.title ?? `Book #${id}`}</>
}

export const bookConfig: CrudConfig = {
  resource: 'books',
  title: 'Books',
  singular: 'Book',
  duplicable: false,
  dateFilter: false,
  emptyHint: 'Add a book, then log reading sessions — progress is calculated from them.',
  filters: [{ name: 'status', label: 'Status', options: [{ value: 'wishlist', label: 'Wishlist' }, { value: 'reading', label: 'Reading' }, { value: 'completed', label: 'Completed' }] }],
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 200 },
    { name: 'author', label: 'Author', type: 'text', maxLength: 200 },
    { name: 'total_pages', label: 'Total pages', type: 'number', step: '1', min: 1, max: 100000, help: 'Reading progress is calculated from your reading sessions.' },
    { name: 'status', label: 'Status', type: 'select', required: true, default: 'reading', options: [{ value: 'wishlist', label: 'Wishlist' }, { value: 'reading', label: 'Reading' }, { value: 'completed', label: 'Completed' }] },
    { name: 'completed_on', label: 'Completed on (defaults to today)', type: 'date', showIf: (v) => v.status === 'completed', default: '' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Book', cell: (r) => (<><span className="font-medium">{r.title}</span>{r.author && <span className="block text-xs text-slate-500">{r.author}</span>}</>) },
    { header: 'Status', cell: (r) => <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? 'slate'}>{r.status}</Badge> },
    {
      header: 'Progress',
      className: 'min-w-[9rem]',
      cell: (r) =>
        r.total_pages ? (
          <div className="space-y-1">
            <ProgressBar value={r.pages_read} max={r.total_pages} label={`${r.title} reading progress`} />
            <span className="text-xs text-slate-500">{num(r.pages_read)} / {num(r.total_pages)} pages{r.progress_pct != null ? ` · ${num(r.progress_pct, 0)}%` : ''}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-500">{num(r.pages_read)} pages read</span>
        ),
    },
    { header: 'Time read', cell: (r) => minutes(r.reading_minutes), className: 'whitespace-nowrap' },
    { header: 'Finished', cell: (r) => (r.completed_on ? fmtDate(r.completed_on) : '—'), className: 'whitespace-nowrap' },
  ],
}

export const readingConfig: CrudConfig = {
  resource: 'reading',
  title: 'Reading sessions',
  singular: 'Reading session',
  fields: [
    { name: 'read_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'book_id', label: 'Book', type: 'ref', ref: { resource: 'books', label: (r) => r.title } },
    { name: 'pages', label: 'Pages read', type: 'number', step: '1', max: 10000, default: 0 },
    { name: 'duration_min', label: 'Duration (min)', type: 'number', max: 1440, default: 0 },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'When', cell: (r) => fmtDateTime(r.read_at), className: 'whitespace-nowrap' },
    { header: 'Book', cell: (r) => <BookName id={r.book_id} /> },
    { header: 'Pages', cell: (r) => num(r.pages) },
    { header: 'Duration', cell: (r) => minutes(r.duration_min), className: 'whitespace-nowrap' },
  ],
}

export const screenTimeConfig: CrudConfig = {
  resource: 'screen-time',
  title: 'Screen time',
  singular: 'Screen time entry',
  filters: [{ name: 'classification', label: 'Type', options: [{ value: 'productive', label: 'Productive' }, { value: 'entertainment', label: 'Entertainment' }] }],
  fields: [
    { name: 'log_date', label: 'Date', type: 'date', required: true },
    { name: 'duration_min', label: 'Duration (min)', type: 'number', required: true, min: 1, max: 1440 },
    { name: 'app_category', label: 'App / category', type: 'text', maxLength: 80, placeholder: 'e.g. Social media, IDE, YouTube' },
    { name: 'classification', label: 'Classification', type: 'select', required: true, default: 'entertainment', options: [{ value: 'productive', label: 'Productive' }, { value: 'entertainment', label: 'Entertainment' }] },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDate(r.log_date), className: 'whitespace-nowrap' },
    { header: 'Duration', cell: (r) => minutes(r.duration_min), className: 'whitespace-nowrap' },
    { header: 'App / category', cell: (r) => r.app_category || '—' },
    { header: 'Type', cell: (r) => <Badge tone={r.classification === 'productive' ? 'green' : 'violet'}>{r.classification}</Badge> },
  ],
}

export const habitConfig: CrudConfig = {
  resource: 'habits',
  title: 'Habits',
  singular: 'Habit entry',
  filters: [{ name: 'completed', label: 'Status', options: [{ value: 'true', label: 'Completed' }, { value: 'false', label: 'Missed' }] }],
  fields: [
    { name: 'log_date', label: 'Date', type: 'date', required: true },
    { name: 'name', label: 'Habit', type: 'text', required: true, maxLength: 120, placeholder: 'e.g. Meditation' },
    { name: 'completed', label: 'Completed', type: 'checkbox', default: true },
    { name: 'value', label: 'Value (optional)', type: 'number', help: 'Any measurement, e.g. minutes or glasses.' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDate(r.log_date), className: 'whitespace-nowrap' },
    { header: 'Habit', cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: 'Done', cell: (r) => <Badge tone={r.completed ? 'green' : 'red'}>{r.completed ? 'Completed' : 'Missed'}</Badge> },
    { header: 'Value', cell: (r) => (r.value != null ? num(r.value, 2) : '—') },
  ],
}
