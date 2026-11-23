"use client"
// The assistant: one button, one panel. Changes always show a confirmation card first.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { call, CommandError } from '@/lib/client/api'
import { cn } from '@/lib/utils'
import type { PendingAction } from '@/server/modules/assistant/assistant'

interface Line { role: 'user' | 'assistant' | 'result'; text: string }

const SUGGESTIONS = {
  provider: ['What do I have today?', 'Who owes me money?', 'Rain tomorrow: cancel my sessions and tell everyone', 'Book Maya every Thursday at 3pm'],
  player: ['What do I have coming up?', 'Find a hitting partner this weekend', 'Cancel my next booking', 'Which coaches have openings Saturday?'],
}

export function AssistantPanel({ isProvider }: { isProvider: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void call('assistant.history', {}).then((h) => {
      setLines(h.messages.map((m) => ({ role: m.role, text: m.text })))
      setPending(h.pendingAction)
    }).catch(() => undefined)
  }, [open])
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [lines.length, pending, busy])

  async function guarded(work: () => Promise<void>) {
    setBusy(true)
    try { await work() } catch (error) {
      setLines((l) => [...l, { role: 'assistant', text: error instanceof CommandError ? error.message : 'Something went wrong. Try again.' }])
    } finally { setBusy(false) }
  }

  const send = (text: string) => guarded(async () => {
    setDraft('')
    setPending(null)
    setLines((l) => [...l, { role: 'user', text }])
    const result = await call('assistant.send', { text })
    setLines((l) => [...l, { role: 'assistant', text: result.reply }])
    setPending(result.pendingAction)
  })

  const resolve = (decision: 'confirm' | 'cancel') => guarded(async () => {
    if (!pending) return
    const { outcomes } = await call('assistant.resolve', { actionId: pending.id, decision })
    setPending(null)
    setLines((l) => [...l, ...outcomes.map((o) => ({ role: 'result' as const, text: `${o.ok ? '✓' : decision === 'cancel' ? '–' : '✗'} ${o.summary}${o.ok || decision === 'cancel' ? '' : `: ${o.message}`}` }))])
    if (decision === 'confirm') router.refresh()
  })

  const restart = () => guarded(async () => {
    await call('assistant.reset', {})
    setLines([])
    setPending(null)
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button aria-label="Open assistant" className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-court-500 text-white shadow-lg hover:bg-court-600 md:bottom-6">
          <Sparkles className="h-6 w-6" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col rounded-t-2xl bg-background p-4 shadow-xl md:inset-auto md:bottom-6 md:right-6 md:h-[640px] md:w-[420px] md:rounded-2xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-court-500" aria-hidden />Assistant</Dialog.Title>
            <div className="flex gap-1">
              <button onClick={restart} className="rounded-lg p-2 hover:bg-gray-100" aria-label="New conversation"><RotateCcw className="h-4 w-4" aria-hidden /></button>
              <Dialog.Close className="rounded-lg p-2 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4" aria-hidden /></Dialog.Close>
            </div>
          </div>
          <Dialog.Description className="sr-only">Ask in plain words. Anything that changes your schedule or money is shown for you to confirm first.</Dialog.Description>

          <div className="flex-1 space-y-2 overflow-y-auto" aria-live="polite">
            {lines.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Ask in plain words. I’ll show you any change before it happens.</p>
                {SUGGESTIONS[isProvider ? 'provider' : 'player'].map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy} className="block w-full rounded-xl border bg-white p-3 text-left text-sm hover:border-court-500">{s}</button>
                ))}
              </div>
            )}
            {lines.map((line, i) => (
              <div key={i} className={cn('flex', line.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                  line.role === 'user' ? 'bg-court-500 text-white' : line.role === 'result' ? 'bg-green-50 text-green-900' : 'bg-white border')}>{line.text}</div>
              </div>
            ))}
            {pending && (
              <div className="rounded-2xl border-2 border-court-500 bg-white p-3">
                <p className="mb-2 text-sm font-semibold">Confirm {pending.actions.length > 1 ? `these ${pending.actions.length} changes` : 'this change'}:</p>
                <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">{pending.actions.map((a, i) => (
                  <li key={i}><span className="font-medium">{a.description}</span>{a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}</li>
                ))}</ul>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => resolve('confirm')}><Check className="mr-1 h-4 w-4" aria-hidden />Confirm</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve('cancel')}>Cancel</Button>
                </div>
              </div>
            )}
            {busy && <p className="text-sm text-muted-foreground">Working…</p>}
            <div ref={bottom} />
          </div>

          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void send(draft.trim()) }}>
            <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
            <input id="assistant-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Move Tuesday’s clinic to 7pm"
              className="h-11 flex-1 rounded-xl border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court-500" />
            <Button size="icon" aria-label="Send" disabled={busy || !draft.trim()}><Send className="h-4 w-4" aria-hidden /></Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
