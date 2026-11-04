import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Loader2, MessageSquarePlus, Send, Trash2, User as UserIcon } from 'lucide-react'
import clsx from 'clsx'
import { api, ApiError } from '@/api/client'
import { Card, EmptyState, ErrorState, Spinner } from '@/components/ui/Common'
import { useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, fmtDateTime } from '@/lib/format'
import { SafeMarkdown } from './Markdown'
import { canUseAI, defaultRange, ExternalDisclosure, ProviderSelect, RangePicker, rangeError, SetupNotice, useAIStatus, useProviderChoice, type Range } from './shared'

interface Msg {
  id: number
  role: 'user' | 'assistant'
  content: string
  meta?: { range?: [string, string] } | null
  created_at: string
}
interface Conv {
  id: number
  title: string
  updated_at: string
}

const SUGGESTIONS = [
  'Where am I overspending?',
  'What are my biggest expenses this month?',
  'How much have I saved?',
  'Compare this month with last month.',
  'Am I maintaining workout consistency?',
  'How much time did I spend studying this week?',
  'Am I spending too much time on entertainment?',
  'What are my biggest areas for improvement?',
  'What should I focus on tomorrow?',
]

export function AssistantTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const status = useAIStatus()
  const choice = useProviderChoice()
  const [convId, setConvId] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [range, setRange] = useState<Range>(defaultRange)
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ message: string; text: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const convs = useQuery({ queryKey: ['ai', 'conversations'], queryFn: () => api<{ items: Conv[] }>('/ai/conversations') })
  const thread = useQuery({
    queryKey: ['ai', 'conversation', convId],
    queryFn: () => api<{ id: number; messages: Msg[] }>(`/ai/conversations/${convId}`),
    enabled: convId !== null,
  })

  const rErr = rangeError(range)
  const ready = canUseAI(status.data, choice.query.data) && !!choice.selected

  const send = useMutation({
    mutationFn: (message: string) =>
      api<{ conversation: Conv; reply: Msg }>('/ai/chat', {
        method: 'POST',
        body: { message, conversation_id: convId ?? undefined, start: range.start, end: range.end, provider_id: choice.selected?.id },
      }),
    onSuccess: (res) => {
      setConvId(res.conversation.id)
      setPending(null)
      setFailure(null)
      qc.invalidateQueries({ queryKey: ['ai'] })
    },
    onError: (e, message) => {
      setFailure({ message: errorMessage(e), text: message })
      qc.invalidateQueries({ queryKey: ['ai'] })
      if (e instanceof ApiError && e.code === 'not_found') setConvId(null)
    },
  })

  const del = useMutation({
    mutationFn: (id: number) => api(`/ai/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: (_r, id) => {
      if (convId === id) setConvId(null)
      qc.invalidateQueries({ queryKey: ['ai'] })
      toast.success('Conversation deleted')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const submit = (message: string) => {
    const m = message.trim()
    if (!m || send.isPending || !ready || rErr) return
    setPending(m)
    setFailure(null)
    setText('')
    send.mutate(m)
  }

  const messages = thread.data?.messages ?? []
  const lastId = messages[messages.length - 1]?.id
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [lastId, pending, failure])

  const newChat = () => {
    setConvId(null)
    setPending(null)
    setFailure(null)
  }
  const removeConv = async (c: Conv) => {
    if (await confirm({ title: 'Delete conversation?', message: `"${c.title}" and all its messages will be permanently deleted.` })) del.mutate(c.id)
  }

  return (
    <>
      <SetupNotice status={status.data} providers={choice.query.data} />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Conversations" className="card flex max-h-72 flex-col overflow-hidden lg:max-h-[36rem]">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <button className="btn-ghost px-2 py-1" onClick={newChat} aria-label="New conversation" title="New conversation">
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convs.isLoading ? (
              <Spinner />
            ) : convs.isError ? (
              <div className="p-3"><ErrorState error={convs.error} onRetry={() => convs.refetch()} /></div>
            ) : convs.data!.items.length === 0 ? (
              <EmptyState title="No conversations yet" hint="Ask your first question to start one." />
            ) : (
              <ul>
                {convs.data!.items.map((c) => (
                  <li key={c.id} className={clsx('group flex items-center gap-1 border-b border-slate-50 px-2 dark:border-slate-800/60', c.id === convId && 'bg-brand-50 dark:bg-brand-950/40')}>
                    <button className="min-w-0 flex-1 py-2 text-left" onClick={() => { setConvId(c.id); setPending(null); setFailure(null) }} aria-current={c.id === convId}>
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      <span className="block text-xs text-slate-500">{fmtDateTime(c.updated_at)}</span>
                    </button>
                    <button className="btn-ghost p-1.5 text-slate-400 hover:text-rose-600" onClick={() => removeConv(c)} aria-label={`Delete conversation ${c.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <Card padded={false} className="flex min-h-[28rem] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:max-h-[30rem]" aria-live="polite" aria-label="Conversation messages">
            {convId !== null && thread.isLoading ? (
              <Spinner />
            ) : convId !== null && thread.isError ? (
              <ErrorState error={thread.error} onRetry={() => thread.refetch()} />
            ) : messages.length === 0 && !pending ? (
              <div>
                <EmptyState title="Ask about your own data" hint="Answers are based on statistics the app calculated from your records for the selected period. The assistant is read-only." icon={<Bot className="h-6 w-6" />} />
                <div className="mt-2 flex flex-wrap justify-center gap-2" role="group" aria-label="Suggested questions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-brand-950/40" disabled={!ready || send.isPending || !!rErr} onClick={() => submit(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content} range={m.meta?.range} />)}
                {pending && !messages.some((m) => m.role === 'user' && m.content === pending && m.id === lastId) && <Bubble role="user" content={pending} />}
                {send.isPending && (
                  <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" /> {choice.selected?.label ?? 'Assistant'} is analysing your data…
                  </div>
                )}
              </>
            )}
            {failure && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">
                {failure.message}
                <button className="ml-3 font-medium underline" onClick={() => submit(failure.text)} disabled={send.isPending}>Retry</button>
                <p className="mt-1 text-xs opacity-80">No other provider was tried. Pick a different provider below if you want to switch.</p>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800"
            onSubmit={(e) => {
              e.preventDefault()
              submit(text)
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <RangePicker idPrefix="chat-range" value={range} onChange={setRange} />
              <ProviderSelect choice={choice} id="chat-provider" />
            </div>
            {rErr && <p role="alert" className="text-xs text-rose-600">{rErr}</p>}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="label" htmlFor="chat-input">Your question</label>
                <textarea
                  id="chat-input"
                  className="input resize-none"
                  rows={2}
                  maxLength={2000}
                  value={text}
                  disabled={!ready}
                  placeholder={ready ? 'Ask about spending, health, study time…' : 'Set up a provider and privacy options to start chatting'}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit(text)
                    }
                  }}
                />
              </div>
              <button className="btn-primary" disabled={!ready || !text.trim() || send.isPending || !!rErr} aria-label="Send">
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} <span className="hidden sm:inline">Send</span>
              </button>
            </div>
            <div className="space-y-1">
              <ExternalDisclosure provider={choice.selected} />
              <p className="text-xs text-slate-500">Considering data from {range.start || '…'} to {range.end || '…'}. AI answers can be wrong — figures are calculated by the app and the AI only interprets them.</p>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}

function Bubble({ role, content, range }: { role: 'user' | 'assistant'; content: string; range?: [string, string] }) {
  const mine = role === 'user'
  return (
    <div className={clsx('message-enter flex gap-2', mine && 'flex-row-reverse')}>
      <div className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')} aria-hidden>
        {mine ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={clsx('max-w-[85%] rounded-xl px-3 py-2', mine ? 'bg-brand-600 text-white' : 'border border-white/70 bg-white/45 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40')}>
        {mine ? <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{content}</p> : <SafeMarkdown text={content} />}
        {mine && range && <p className="mt-1 text-[10px] opacity-75">{range[0]} → {range[1]}</p>}
      </div>
    </div>
  )
}
