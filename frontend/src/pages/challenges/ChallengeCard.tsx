import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Flame, History, Pause, Pencil, Play, RotateCcw, Trash2, Trophy, Undo2 } from 'lucide-react'
import { api } from '@/api/client'
import { Badge, ProgressBar } from '@/components/ui/Common'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { Row } from '@/crud/ModuleCrud'
import { formatAmount, perUnit, targetText } from '@/crud/configs/challenges'
import { cap, errorMessage, fmtDate, toDateStr } from '@/lib/format'
import { StatusBadge } from './HistoryModal'

function CurrentProgress({ c }: { c: Row }) {
  const cur = c.progress?.current as Row | null | undefined
  if (!cur) return <p className="text-sm text-slate-500">No active period yet.</p>
  const lte = c.comparator === 'lte' && c.metric !== 'manual'
  const value = Number(cur.value)
  const target = Number(c.target)
  const over = lte && value > target
  let tone: 'brand' | 'good' | 'bad' = 'brand'
  if (over) tone = 'bad'
  else if (cur.status === 'met') tone = 'good'
  // lte with a zero target has no meaningful ratio: any value is "over", none is empty.
  const max = lte && target === 0 ? Math.max(value, 1) : target || 1
  const label = c.metric === 'manual' ? (cur.met ? 'Done this period' : 'Not done yet this period') : `${formatAmount(value, c.unit)} of ${c.comparator === 'lte' ? '≤' : '≥'} ${formatAmount(target, c.unit)}`
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="tabular-nums">
          <span className="text-xs text-slate-500">This {perUnit(c.frequency)}: </span>
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          {over && <span className="text-xs font-medium text-rose-600">Over limit</span>}
          <StatusBadge status={cur.status} />
        </span>
      </div>
      <ProgressBar value={c.metric === 'manual' ? (cur.met ? 1 : 0) : value} max={c.metric === 'manual' ? 1 : max} tone={tone} label={`${c.name} progress this ${perUnit(c.frequency)}`} />
    </div>
  )
}

export function ChallengeCard({ c, deletedView, ended, onEdit, onHistory }: { c: Row; deletedView: boolean; ended: boolean; onEdit: (c: Row) => void; onHistory: (c: Row) => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const act = (path: string, ok: string, body?: unknown) => run.mutate(() => api(`/challenges/${c.id}${path}`, { method: 'POST', body }).then(() => toast.success(ok)))

  const p = c.progress ?? {}
  const cur = p.current as Row | null | undefined
  const canCheck = c.metric === 'manual' && c.status === 'active' && !ended && !deletedView

  const restart = async () => {
    const ok = await confirm({
      title: 'Restart challenge?',
      message: 'Restarting starts the challenge fresh from today. Manual completions are cleared and the streak and success rate begin again. Badges you have already earned are kept.',
      confirmLabel: 'Restart',
      danger: false,
    })
    if (ok) act('/restart', 'Challenge restarted from today.')
  }
  const remove = async () => {
    if (await confirm({ title: 'Delete challenge?', message: 'It moves to “Show deleted” where you can restore it.', confirmLabel: 'Delete' })) run.mutate(() => api(`/challenges/${c.id}`, { method: 'DELETE' }).then(() => toast.success('Challenge deleted.')))
  }

  return (
    <article className={`card flex flex-col gap-3 p-4 ${deletedView ? 'opacity-70' : ''}`} aria-label={c.name}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{c.name}</h3>
          {c.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{c.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <Badge tone="violet">{cap(c.frequency)}</Badge>
          {c.status === 'paused' && <Badge tone="amber">Paused</Badge>}
          {ended && <Badge>Ended</Badge>}
        </div>
      </header>

      <p className="text-sm">
        <span className="font-medium">{c.metric_label}</span> <span className="text-slate-500">· {targetText(c)}</span>
        <span className="block text-xs text-slate-500">
          {fmtDate(c.start_date)}
          {c.end_date ? ` → ${fmtDate(c.end_date)}` : ' → no end date'}
        </span>
      </p>

      {c.status === 'paused' ? <p className="text-sm text-slate-500">Paused since {fmtDate(c.paused_on)}. Paused days are not counted against you.</p> : <CurrentProgress c={c} />}

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <dt className="flex items-center justify-center gap-1 text-xs text-slate-500">
            <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden /> Streak
          </dt>
          <dd className="text-lg font-semibold tabular-nums">{p.current_streak ?? 0}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <dt className="text-xs text-slate-500">Longest</dt>
          <dd className="text-lg font-semibold tabular-nums">{p.longest_streak ?? 0}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <dt className="text-xs text-slate-500">Success rate</dt>
          <dd className="text-lg font-semibold tabular-nums">{p.success_rate ?? 0}%</dd>
        </div>
      </dl>
      <p className="-mt-1 text-xs text-slate-500">
        {p.total_met ?? 0} of {p.periods_total ?? 0} periods met
      </p>

      {c.badges?.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Badges earned">
          {c.badges.map((b: Row) => (
            <li key={b.code} title={`Earned ${fmtDate(b.awarded_on)}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <Trophy className="h-3.5 w-3.5" aria-hidden /> {b.label}
            </li>
          ))}
        </ul>
      )}

      {!deletedView && c.metric !== 'manual' && <p className="text-xs text-slate-500">Progress is calculated automatically from your records.</p>}

      <footer className="mt-auto flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
        {deletedView ? (
          <button className="btn-secondary px-2.5 py-1 text-xs" disabled={run.isPending} onClick={() => act('/restore', 'Challenge restored.')}>
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </button>
        ) : (
          <>
            {canCheck &&
              (cur?.met ? (
                <button className="btn-secondary px-2.5 py-1 text-xs" disabled={run.isPending} onClick={() => act('/complete', 'Marked as not done.', { done: false, date: toDateStr() })}>
                  <Undo2 className="h-3.5 w-3.5" /> Undo
                </button>
              ) : (
                <button className="btn-primary px-2.5 py-1 text-xs" disabled={run.isPending} onClick={() => act('/complete', 'Marked done for today.', { done: true, date: toDateStr() })}>
                  <CalendarCheck className="h-3.5 w-3.5" /> Mark done today
                </button>
              ))}
            {c.status === 'active' && !ended && (
              <button className="btn-secondary px-2.5 py-1 text-xs" disabled={run.isPending} onClick={() => act('/pause', 'Challenge paused.')}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            )}
            {c.status === 'paused' && (
              <button className="btn-secondary px-2.5 py-1 text-xs" disabled={run.isPending} onClick={() => act('/resume', 'Challenge resumed.')}>
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            )}
            <button className="btn-secondary px-2.5 py-1 text-xs" disabled={run.isPending} onClick={restart}>
              <RotateCcw className="h-3.5 w-3.5" /> Restart
            </button>
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onHistory(c)}>
              <History className="h-3.5 w-3.5" /> View history
            </button>
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onEdit(c)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button className="btn-ghost px-2.5 py-1 text-xs text-rose-600" disabled={run.isPending} onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </>
        )}
      </footer>
    </article>
  )
}
