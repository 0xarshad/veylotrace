import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '@/components/ui/Common'
import { budgetConfig, categoryConfig, contributionConfig, expenseConfig, incomeConfig, savingsGoalConfig, transferConfig, useRefRows } from '@/crud/configs/finance'
import { CrudList } from '@/crud/ModuleCrud'
import { FinanceOverview } from '@/pages/finance/FinanceOverview'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'savings', label: 'Savings' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'categories', label: 'Categories' },
] as const
type TabId = (typeof TABS)[number]['id']

type AutoAdd = { autoAdd: boolean; onAutoAddHandled: () => void }

const NOTE = 'rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300'

function ExpensesTab(props: AutoAdd) {
  const [category, setCategory] = useState('')
  const categories = useRefRows('expense-categories').filter((c) => !c.parent_id)
  const config = useMemo(() => (category ? { ...expenseConfig, fixedParams: { category_id: category } } : expenseConfig), [category])
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <select className="input w-auto" aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Category: all</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <CrudList key={`expenses-${category}`} config={config} {...props} />
    </div>
  )
}

function SavingsTab(props: AutoAdd) {
  return (
    <div className="space-y-4">
      <p className={NOTE}>Unspent budget is not counted as savings — only contributions you record here.</p>
      <CrudList config={savingsGoalConfig} />
      <CrudList config={contributionConfig} {...props} />
    </div>
  )
}

export default function FinancePage() {
  const [params, setParams] = useSearchParams()
  const wantsAdd = params.get('add') === '1'
  const tab = (params.get('tab') as TabId) || (wantsAdd ? 'expenses' : 'overview')
  const [autoAdd, setAutoAdd] = useState(wantsAdd)
  const auto: AutoAdd = { autoAdd, onAutoAddHandled: () => setAutoAdd(false) }
  const set = (t: TabId) => setParams({ tab: t })
  return (
    <>
      <PageHeader title="Expenses & Savings" subtitle="Spending, income, budgets and savings goals" />
      <Tabs tabs={[...TABS]} value={tab} onChange={set} />
      {tab === 'overview' && <FinanceOverview />}
      {tab === 'expenses' && <ExpensesTab {...auto} />}
      {tab === 'income' && <CrudList config={incomeConfig} {...auto} />}
      {tab === 'budgets' && <CrudList config={budgetConfig} {...auto} />}
      {tab === 'savings' && <SavingsTab {...auto} />}
      {tab === 'transfers' && (
        <div className="space-y-3">
          <p className={NOTE}>Transfers move money between your own accounts. They are not expenses and are not counted in spending.</p>
          <CrudList config={transferConfig} {...auto} />
        </div>
      )}
      {tab === 'categories' && <CrudList config={categoryConfig} {...auto} />}
    </>
  )
}
