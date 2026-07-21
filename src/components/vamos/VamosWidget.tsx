"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, X, Send, Zap } from "lucide-react"
import { logger } from "@/lib/logger"

interface Message {
  role: 'user' | 'assistant'
  content: string
  requiresConfirmation?: boolean
  pendingAction?: any
}

export function VamosWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Vamos! I'm your court captain. I can find doubles partners, check schedule, handle payments. Try: 'Find me mixed doubles Thu 7pm UTR 4-5'" }
  ])
  const [loading, setLoading] = useState(false)

  const send = async (text: string) => {
    if (!text.trim()) return
    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch('/api/vamos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      if (!res.ok) {
        // A non-2xx is a real failure — surface it to logs instead of masking it as "mock mode".
        logger.error('vamos.chat_http_error', { status: res.status })
      }
      const data = await res.json()

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.response || data.message || "Got it - Vamos!",
        requiresConfirmation: data.requires_confirmation,
        pendingAction: data.pending_action
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      // Network/parse failure. Log it — don't disguise the error as a canned success.
      logger.error('vamos.chat_request_failed', { err: e })
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm having trouble reaching Vamos right now - please try again in a moment." }])
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = (msg: Message) => {
    if (msg.pendingAction) {
      send(`CONFIRM: ${JSON.stringify(msg.pendingAction)} - Yes, do it`)
    }
  }

  if (!open) {
    return (
      <button onClick={()=>setOpen(true)} className="fixed bottom-20 md:bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-clay-500 to-court-500 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-105 transition-transform z-50">
        <Zap className="w-6 h-6" />
      </button>
    )
  }

  return (
    <Card className="fixed bottom-20 md:bottom-6 right-6 w-[90vw] md:w-96 h-[500px] shadow-2xl flex flex-col z-50 border-2 border-clay-100">
      <CardHeader className="p-4 border-b flex flex-row justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-clay-500 to-court-500 rounded-full flex items-center justify-center text-white font-bold text-sm">V</div>
          <div>
            <CardTitle className="text-sm">Vamos AI</CardTitle>
            <div className="text-xs text-muted-foreground">Your captain - on call</div>
          </div>
          <Badge variant="secondary" className="ml-2 text-[10px]">AI</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={()=>setOpen(false)}><X className="w-4 h-4" /></Button>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
        <div className="flex-1 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`p-3 rounded-2xl text-sm max-w-[85%] ${m.role==='user' ? 'bg-clay-500 text-white self-end ml-auto' : 'bg-gray-100 self-start'}`}>
              <div>{m.content}</div>
              {m.requiresConfirmation && m.pendingAction && (
                <div className="mt-3 p-2 bg-white rounded-xl border text-xs text-gray-800">
                  <div className="font-semibold mb-1">Confirm action:</div>
                  <div className="mb-2">{m.pendingAction.summary}</div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={()=>handleConfirm(m)}>✓ Confirm</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>setMessages(prev=>[...prev,{role:'assistant',content:"Cancelled - not doing it"}])}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {loading && <div className="text-xs text-muted-foreground animate-pulse">Vamos is thinking...</div>}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Input value={input} onChange={e=>setInput(e.target.value)} placeholder="Find mixed doubles Thu 7pm UTR 4-5..." className="flex-1" onKeyDown={e=>e.key==='Enter' && send(input)} />
          <Button size="icon" onClick={()=>send(input)} disabled={loading}><Send className="w-4 h-4" /></Button>
        </div>
        
        <div className="flex gap-1 flex-wrap">
          {["Next lesson?", "Find doubles 4-5", "Who owes me?", "Create clinic Sat 9am"].map(chip => (
            <button key={chip} onClick={()=>send(chip)} className="text-[10px] px-2 py-1 bg-gray-50 border rounded-full hover:bg-gray-100">{chip}</button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
