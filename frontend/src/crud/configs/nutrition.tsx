import { Badge } from '@/components/ui/Common'
import type { ColumnDef, CrudConfig, FieldDef } from '@/crud/ModuleCrud'
import { fmtDateTime, num } from '@/lib/format'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))
const TYPE_TONE = { breakfast: 'amber', lunch: 'green', dinner: 'violet', snack: 'blue' } as const

const macros = (r: Record<string, any>) => `${num(r.calories)} kcal · P ${num(r.protein_g, 1)} · C ${num(r.carbs_g, 1)} · F ${num(r.fat_g, 1)} · Fi ${num(r.fibre_g, 1)}`

export const foodConfig: CrudConfig = {
  resource: 'foods',
  title: 'Foods',
  singular: 'Food',
  sort: 'name',
  duplicable: true,
  dateFilter: false,
  emptyHint: 'Add foods you eat often, then log them in one tap.',
  filters: [{ name: 'favorite', label: 'Favorites', options: [{ value: 'true', label: 'Favorites only' }, { value: 'false', label: 'Not favorites' }] }],
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 120 },
    { name: 'serving_size', label: 'Serving size', type: 'text', default: '1 serving', maxLength: 60, placeholder: 'e.g. 100 g, 1 cup' },
    { name: 'calories', label: 'Calories (kcal per serving)', type: 'number', default: 0 },
    { name: 'protein_g', label: 'Protein (g per serving)', type: 'number', default: 0 },
    { name: 'carbs_g', label: 'Carbs (g per serving)', type: 'number', default: 0 },
    { name: 'fat_g', label: 'Fat (g per serving)', type: 'number', default: 0 },
    { name: 'fibre_g', label: 'Fibre (g per serving)', type: 'number', default: 0 },
    { name: 'favorite', label: 'Favorite', type: 'checkbox' },
  ],
  columns: [
    { header: 'Food', cell: (r) => <span className="font-medium">{r.favorite ? '★ ' : ''}{r.name}</span> },
    { header: 'Serving', cell: (r) => r.serving_size },
    { header: 'Per serving', cell: (r) => macros(r), className: 'whitespace-nowrap text-xs' },
    { header: 'Used', cell: (r) => `Used ${r.use_count}×`, className: 'whitespace-nowrap' },
  ],
}

const itemFields: FieldDef[] = [
  { name: 'name', label: 'Item', type: 'text', required: true, maxLength: 120 },
  { name: 'quantity', label: 'Quantity (servings)', type: 'number', default: 1, min: 0.01, help: 'Total = quantity × per-serving values' },
  { name: 'serving_size', label: 'Serving size', type: 'text', default: '1 serving', maxLength: 60 },
  { name: 'calories', label: 'Calories / serving', type: 'number', default: 0 },
  { name: 'protein_g', label: 'Protein g / serving', type: 'number', default: 0 },
  { name: 'carbs_g', label: 'Carbs g / serving', type: 'number', default: 0 },
  { name: 'fat_g', label: 'Fat g / serving', type: 'number', default: 0 },
  { name: 'fibre_g', label: 'Fibre g / serving', type: 'number', default: 0 },
  { name: 'food_item_id', label: 'Linked food (optional)', type: 'ref', ref: { resource: 'foods', label: (r) => r.name } },
]

const mealFields: FieldDef[] = [
  { name: 'meal_type', label: 'Meal type', type: 'select', required: true, options: MEAL_TYPES, default: 'breakfast' },
  { name: 'eaten_at', label: 'Date & time', type: 'datetime', required: true },
  { name: 'name', label: 'Name (optional)', type: 'text', maxLength: 120 },
  { name: 'is_template', label: 'Saved meal', type: 'checkbox' },
  { name: 'items', label: 'Items — nutrition values are per serving', type: 'list', listLabel: 'Add item', listFields: itemFields },
  { name: 'notes', label: 'Notes', type: 'textarea' },
]

const itemsCell: ColumnDef = {
  header: 'Items',
  cell: (r) => (r.items.length ? <span title={r.items.map((i: any) => `${i.quantity}× ${i.name}`).join(', ')}>{r.items.length}</span> : '—'),
}
const totalsCell: ColumnDef = {
  header: 'Totals (qty × serving)',
  cell: (r) => `${num(r.totals.calories)} kcal · ${num(r.totals.protein_g, 1)} g protein`,
  className: 'whitespace-nowrap',
}
const typeCell: ColumnDef = {
  header: 'Type',
  cell: (r) => <Badge tone={TYPE_TONE[r.meal_type as keyof typeof TYPE_TONE] ?? 'slate'}>{r.meal_type}</Badge>,
}
const nameCell: ColumnDef = { header: 'Name', cell: (r) => r.name || <span className="text-slate-400">—</span> }

export const mealConfig: CrudConfig = {
  resource: 'meals',
  title: 'Meals',
  singular: 'Meal',
  duplicable: true,
  fixedParams: { is_template: 'false' },
  createDefaults: { is_template: false },
  hiddenFields: ['is_template'],
  filters: [{ name: 'meal_type', label: 'Type', options: MEAL_TYPES }],
  fields: mealFields,
  columns: [{ header: 'Time', cell: (r) => fmtDateTime(r.eaten_at), className: 'whitespace-nowrap' }, typeCell, nameCell, itemsCell, totalsCell],
}

export const savedMealConfig: CrudConfig = {
  resource: 'meals',
  title: 'Saved meals',
  singular: 'Saved meal',
  duplicable: true,
  dateFilter: false,
  fixedParams: { is_template: 'true' },
  createDefaults: { is_template: true },
  hiddenFields: ['is_template'],
  emptyHint: 'Save meals you repeat often, then log them with one click.',
  filters: [{ name: 'meal_type', label: 'Type', options: MEAL_TYPES }],
  fields: mealFields,
  columns: [nameCell, typeCell, itemsCell, totalsCell],
}

export const waterConfig: CrudConfig = {
  resource: 'water',
  title: 'Water intake',
  singular: 'Water entry',
  fields: [
    { name: 'logged_at', label: 'Date & time', type: 'datetime', required: true },
    { name: 'amount_ml', label: 'Amount (ml)', type: 'number', required: true, min: 1, max: 10000, default: 250 },
  ],
  columns: [
    { header: 'When', cell: (r) => fmtDateTime(r.logged_at) },
    { header: 'Amount', cell: (r) => `${num(r.amount_ml)} ml` },
  ],
}

export { MEAL_TYPES }
