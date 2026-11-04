import { useQuery } from '@tanstack/react-query'
import { api, type ListResponse } from '@/api/client'
import { Badge, ProgressBar } from '@/components/ui/Common'
import type { CrudConfig, Row } from '@/crud/ModuleCrud'
import { cap, fmtDate, fmtDateTime, money, pct } from '@/lib/format'

/** Shares the react-query cache entry used by the form's ref selects (same key + query). */
export function useRefRows(resource: string): Row[] {
  const q = useQuery({
    queryKey: ['ref', resource, undefined],
    queryFn: () => api<ListResponse<Row>>(`/${resource}`, { query: { limit: 500 } }),
    staleTime: 30_000,
  })
  return q.data?.items ?? []
}

/** Resolves a category (and optional subcategory) id pair to "Parent › Sub". */
export function CategoryName({ categoryId, subcategoryId }: { categoryId?: number | null; subcategoryId?: number | null }) {
  const rows = useRefRows('expense-categories')
  const byId = new Map(rows.map((r) => [r.id, r.name as string]))
  if (!categoryId && !subcategoryId) return <span className="text-slate-400">Uncategorized</span>
  const parent = categoryId ? byId.get(categoryId) : undefined
  const sub = subcategoryId ? byId.get(subcategoryId) : undefined
  return <>{[parent, sub].filter(Boolean).join(' › ') || '—'}</>
}

function GoalName({ id }: { id?: number | null }) {
  const rows = useRefRows('savings-goals')
  if (!id) return <span className="text-slate-400">General savings</span>
  return <>{rows.find((r) => r.id === id)?.name ?? '—'}</>
}

const PAYMENT_OPTIONS = ['cash', 'card', 'upi', 'bank', 'wallet', 'other'].map((v) => ({ value: v, label: v === 'upi' ? 'UPI' : cap(v) }))
const NECESSITY_OPTIONS = [
  { value: 'essential', label: 'Essential' },
  { value: 'non_essential', label: 'Non-essential' },
]
const SOURCE_OPTIONS = ['salary', 'freelance', 'business', 'reimbursement', 'other'].map((v) => ({ value: v, label: cap(v) }))
const categoryRef = { resource: 'expense-categories', label: (r: Row) => r.name, rootsOnly: true }
const subcategoryRef = { resource: 'expense-categories', label: (r: Row) => r.name, parentField: 'category_id' }
const paymentLabel = (v: string) => PAYMENT_OPTIONS.find((o) => o.value === v)?.label ?? cap(v)

export const expenseConfig: CrudConfig = {
  resource: 'expenses',
  title: 'Expenses',
  singular: 'Expense',
  duplicable: true,
  emptyHint: 'Add an expense to start tracking where your money goes.',
  filters: [
    { name: 'payment_method', label: 'Payment', options: PAYMENT_OPTIONS },
    { name: 'necessity', label: 'Necessity', options: NECESSITY_OPTIONS },
  ],
  fields: [
    { name: 'occurred_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'amount', label: 'Amount', type: 'money', required: true },
    { name: 'category_id', label: 'Category', type: 'ref', ref: categoryRef, help: 'Choose a main category.' },
    { name: 'subcategory_id', label: 'Subcategory', type: 'ref', ref: subcategoryRef, help: 'Optional. Subcategories are filtered to the selected category.' },
    { name: 'description', label: 'Description', type: 'text', maxLength: 255 },
    { name: 'payment_method', label: 'Payment method', type: 'select', options: PAYMENT_OPTIONS, required: true, default: 'other' },
    { name: 'necessity', label: 'Necessity', type: 'select', options: NECESSITY_OPTIONS, required: true, default: 'essential' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDateTime(r.occurred_at), className: 'whitespace-nowrap' },
    { header: 'Description', cell: (r) => r.description || '—', className: 'max-w-[14rem] truncate' },
    { header: 'Category', cell: (r) => <CategoryName categoryId={r.category_id} subcategoryId={r.subcategory_id} /> },
    { header: 'Amount', cell: (r) => <span className="block text-right font-medium tabular-nums">{money(r.amount)}</span>, className: 'text-right' },
    { header: 'Payment', cell: (r) => paymentLabel(r.payment_method) },
    { header: 'Necessity', cell: (r) => <Badge tone={r.necessity === 'essential' ? 'green' : 'amber'}>{r.necessity === 'essential' ? 'Essential' : 'Non-essential'}</Badge> },
  ],
}

export const incomeConfig: CrudConfig = {
  resource: 'income',
  title: 'Income',
  singular: 'Income',
  duplicable: true,
  filters: [{ name: 'source_type', label: 'Source', options: SOURCE_OPTIONS }],
  fields: [
    { name: 'occurred_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'amount', label: 'Amount', type: 'money', required: true },
    { name: 'source_type', label: 'Source', type: 'select', options: SOURCE_OPTIONS, required: true, default: 'salary' },
    { name: 'description', label: 'Description', type: 'text' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDateTime(r.occurred_at), className: 'whitespace-nowrap' },
    { header: 'Description', cell: (r) => r.description || '—', className: 'max-w-[14rem] truncate' },
    { header: 'Source', cell: (r) => <Badge tone="blue">{cap(r.source_type)}</Badge> },
    { header: 'Amount', cell: (r) => <span className="block text-right font-medium tabular-nums text-emerald-600">{money(r.amount)}</span>, className: 'text-right' },
  ],
}

export const transferConfig: CrudConfig = {
  resource: 'transfers',
  title: 'Transfers between your accounts',
  singular: 'Transfer',
  duplicable: true,
  emptyHint: 'Transfers between your own accounts are tracked here and are not counted as expenses.',
  fields: [
    { name: 'occurred_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'amount', label: 'Amount', type: 'money', required: true, help: 'Moving money between your own accounts is not an expense and is excluded from spending.' },
    { name: 'from_account', label: 'From account', type: 'text', required: true, maxLength: 80, placeholder: 'e.g. Checking' },
    { name: 'to_account', label: 'To account', type: 'text', required: true, maxLength: 80, placeholder: 'e.g. Savings' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDateTime(r.occurred_at), className: 'whitespace-nowrap' },
    { header: 'From', cell: (r) => r.from_account },
    { header: 'To', cell: (r) => r.to_account },
    { header: 'Amount', cell: (r) => <span className="block text-right font-medium tabular-nums">{money(r.amount)}</span>, className: 'text-right' },
    { header: 'Type', cell: () => <Badge>Not an expense</Badge> },
  ],
}

const PERIOD_OPTIONS = ['daily', 'weekly', 'monthly', 'custom'].map((v) => ({ value: v, label: cap(v) }))

export const budgetConfig: CrudConfig = {
  resource: 'budgets',
  title: 'Budgets',
  singular: 'Budget',
  search: true,
  dateFilter: false,
  duplicable: false,
  emptyHint: 'Create a monthly budget to see how much of it is left.',
  filters: [{ name: 'period', label: 'Period', options: PERIOD_OPTIONS }],
  fields: [
    { name: 'name', label: 'Name', type: 'text', maxLength: 100, placeholder: 'e.g. Monthly overall' },
    { name: 'period', label: 'Period', type: 'select', options: PERIOD_OPTIONS, required: true, default: 'monthly' },
    { name: 'amount', label: 'Budget amount', type: 'money', required: true },
    { name: 'category_id', label: 'Category', type: 'ref', ref: categoryRef, help: 'Leave empty for an overall budget across all spending.' },
    { name: 'start_date', label: 'Start date', type: 'date', required: true, showIf: (v) => v.period === 'custom' },
    { name: 'end_date', label: 'End date', type: 'date', required: true, showIf: (v) => v.period === 'custom' },
  ],
  columns: [
    { header: 'Name', cell: (r) => r.name || '—' },
    { header: 'Applies to', cell: (r) => (r.category_id ? <CategoryName categoryId={r.category_id} /> : <Badge tone="violet">Overall</Badge>) },
    { header: 'Period', cell: (r) => (r.period === 'custom' ? `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` : cap(r.period)) },
    { header: 'Amount', cell: (r) => <span className="block text-right font-medium tabular-nums">{money(r.amount)}</span>, className: 'text-right' },
  ],
}

export const savingsGoalConfig: CrudConfig = {
  resource: 'savings-goals',
  title: 'Savings goals',
  singular: 'Savings goal',
  dateFilter: false,
  duplicable: false,
  emptyHint: 'Create a goal, then record contributions toward it.',
  fields: [
    { name: 'name', label: 'Goal name', type: 'text', required: true, maxLength: 120 },
    { name: 'target_amount', label: 'Target amount', type: 'money', required: true },
    { name: 'target_date', label: 'Target date', type: 'date' },
    { name: 'planned_monthly_contribution', label: 'Planned monthly contribution', type: 'number', step: '0.01', min: 0, default: 0, help: 'Used to project the completion date. Leave 0 if unplanned.' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Goal', cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      header: 'Progress',
      cell: (r) => (
        <div className="min-w-[10rem] space-y-1">
          <ProgressBar value={r.contributed} max={r.target_amount} label={`${r.name} progress`} />
          <div className="text-xs text-slate-500">{money(r.contributed)} / {money(r.target_amount)} · {pct(r.progress_pct)}</div>
        </div>
      ),
    },
    { header: 'Remaining', cell: (r) => <span className="tabular-nums">{money(r.remaining)}</span> },
    { header: 'Target date', cell: (r) => fmtDate(r.target_date) },
    { header: 'Projected completion', cell: (r) => (r.projected_completion ? fmtDate(r.projected_completion) : <span className="text-xs text-slate-400">Set a monthly contribution</span>) },
  ],
}

export const contributionConfig: CrudConfig = {
  resource: 'savings-contributions',
  title: 'Savings contributions',
  singular: 'Contribution',
  duplicable: true,
  emptyHint: 'Record money you actually set aside. Unspent budget is not savings.',
  fields: [
    { name: 'occurred_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'amount', label: 'Amount', type: 'money', required: true },
    { name: 'goal_id', label: 'Goal', type: 'ref', ref: { resource: 'savings-goals', label: (r) => r.name }, help: 'Optional. Leave empty for general savings.' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { header: 'Date', cell: (r) => fmtDateTime(r.occurred_at), className: 'whitespace-nowrap' },
    { header: 'Goal', cell: (r) => <GoalName id={r.goal_id} /> },
    { header: 'Amount', cell: (r) => <span className="block text-right font-medium tabular-nums text-emerald-600">{money(r.amount)}</span>, className: 'text-right' },
    { header: 'Notes', cell: (r) => r.notes || '—', className: 'max-w-[14rem] truncate' },
  ],
}

export const categoryConfig: CrudConfig = {
  resource: 'expense-categories',
  title: 'Expense categories',
  singular: 'Category',
  dateFilter: false,
  duplicable: false,
  sort: 'name',
  emptyHint: 'Create categories (and subcategories) to organise your expenses.',
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 80 },
    { name: 'parent_id', label: 'Parent category', type: 'ref', ref: { resource: 'expense-categories', label: (r) => r.name, rootsOnly: true }, help: 'Optional. Choose a parent to make this a subcategory (one level only).' },
  ],
  columns: [
    { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: 'Type', cell: (r) => (r.parent_id ? <>Subcategory of <CategoryName categoryId={r.parent_id} /></> : <Badge tone="violet">Main category</Badge>) },
  ],
}
