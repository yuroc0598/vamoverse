"use client"
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { call, useCommand } from '@/lib/client/api'
import { cn } from '@/lib/utils'

interface Item { id: string; senderName: string; body: string; createdAt: string; mine: boolean }

const POLL_MS = 5000

export function Conversation({ threadId, initial }: { threadId: string; initial: Item[] }) {
  const [messages, setMessages] = useState(initial)
  const [draft, setDraft] = useState('')
  const send = useCommand('messages.send')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return
      const { messages: latest } = await call('messages.read', { threadId }).catch(() => ({ messages: null }))
      if (latest) setMessages(latest.map((m) => ({ ...m, createdAt: new Date(m.createdAt).toISOString() })))
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [threadId])

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [messages.length])

  return (
    <>
      <ol className="flex-1 space-y-2 overflow-y-auto rounded-2xl border bg-white p-4" aria-live="polite">
        {messages.length === 0 && <li className="text-center text-sm text-muted-foreground">Say hello 👋</li>}
        {messages.map((m) => (
          <li key={m.id} className={cn('flex flex-col', m.mine ? 'items-end' : 'items-start')}>
            {!m.mine && <span className="text-xs text-muted-foreground">{m.senderName}</span>}
            <span className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm', m.mine ? 'bg-clay-500 text-white' : 'bg-gray-100')}>{m.body}</span>
          </li>
        ))}
        <div ref={bottom} />
      </ol>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault()
        const body = draft.trim()
        if (!body) return
        const sent = await send.run({ threadId, body })
        if (!sent) return
        setDraft('')
        setMessages((list) => [...list, { ...sent, createdAt: new Date(sent.createdAt).toISOString() }])
      }}>
        <label htmlFor="composer" className="sr-only">Message</label>
        <textarea id="composer" rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
          className="min-h-11 flex-1 resize-none rounded-xl border px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-500" />
        <Button size="icon" aria-label="Send" disabled={send.pending || !draft.trim()}><Send className="h-4 w-4" aria-hidden /></Button>
      </form>
    </>
  )
}
