"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Zap, Users, Calendar, DollarSign } from "lucide-react"
import { logger } from "@/lib/logger"

interface ChatMsg { role: 'user'|'assistant', content: string, requiresConfirmation?: boolean, pendingAction?: any }

export default function VamosPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: "Vamos! I'm your court captain. I live inside Vamoverse to handle scheduling, payments, and finding you even doubles matches. Try: 'Find me mixed doubles Thu 7pm UTR 4-5 near Fremont' or 'When is my next lesson?' or 'Who owes me?'" }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  const send = async (text: string) => {
    if (!text.trim()) return
    setMessages(m => [...m, { role: 'user', content: text }])
    setInput("")
    setLoading(true)
    try {
      const res = await fetch('/api/vamos/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ message: text }) })
      if (!res.ok) logger.error('vamos.chat_http_error', { status: res.status })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: data.response, requiresConfirmation: data.requires_confirmation, pendingAction: data.pending_action }])
    } catch (e) {
      logger.error('vamos.chat_request_failed', { err: e })
      setMessages(m => [...m, { role: 'assistant', content: "I'm having trouble reaching Vamos right now - please try again in a moment." }])
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 h-[calc(100vh-100px)]">
      <div className="md:col-span-2 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="border-b py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-clay-500 to-court-500 rounded-full flex items-center justify-center text-white font-bold">V</div>
              <div>
                <CardTitle className="text-base">Vamos AI</CardTitle>
                <CardDescription>Vamoverse powered by Vamos - Your captain, on call</CardDescription>
              </div>
              <Badge variant="secondary" className="ml-auto">AI • Mock Mode Ready</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
            <div className="flex-1 space-y-3">
              {messages.map((m,i)=>(
                <div key={i} className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.role==='user' ? 'bg-clay-500 text-white self-end ml-auto' : 'bg-gray-100'}`}>
                  <div>{m.content}</div>
                  {m.requiresConfirmation && (
                    <div className="mt-2 p-2 bg-white border rounded-xl">
                      <div className="text-xs font-semibold">Confirm:</div>
                      <div className="text-xs mb-2">{m.pendingAction?.summary}</div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7" onClick={()=>send(`CONFIRM ${JSON.stringify(m.pendingAction)} Yes`)}>✓ Yes, do it</Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={()=>setMessages(ms=>[...ms,{role:'assistant',content:"Cancelled"}])}>No</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && <div className="text-xs animate-pulse">Vamos is checking your crew...</div>}
            </div>

            <div className="border-t pt-3">
              <div className="flex gap-2">
                <Input value={input} onChange={e=>setInput(e.target.value)} placeholder="Find mixed doubles Thu 7pm UTR 4-5 near Fremont..." onKeyDown={e=>e.key==='Enter' && send(input)} />
                <Button onClick={()=>send(input)} disabled={loading}><Send className="w-4 h-4" /></Button>
              </div>
              <div className="flex gap-1 mt-2 flex-wrap">
                {["Next lesson?", "Find doubles players UTR 4-5", "Who owes me?", "Create clinic Sat 9am $40"].map(chip=>(
                  <button key={chip} onClick={()=>send(chip)} className="text-[11px] px-2.5 py-1 bg-gray-50 border rounded-full hover:bg-clay-50">{chip}</button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-sm">What Vamos Can Do (V1)</CardTitle></CardHeader><CardContent className="space-y-3 text-xs">
          <div className="flex gap-2"><Zap className="w-4 h-4 text-clay-500" /> <div><b>Find Players:</b> search by UTR, gender, radius, discipline, validates Mixed 2M/2F</div></div>
          <div className="flex gap-2"><Calendar className="w-4 h-4 text-court-500" /> <div><b>Schedule:</b> list events, propose times, bulk reschedule for rain</div></div>
          <div className="flex gap-2"><DollarSign className="w-4 h-4 text-green-600" /> <div><b>Payments:</b> who owes, create ad-hoc charge, auto-pay 2hr window</div></div>
          <div className="flex gap-2"><Users className="w-4 h-4 text-purple-600" /> <div><b>Matchmaking:</b> create custom match, invite, auto-balance Δ0.2</div></div>
          <div className="pt-2 border-t text-muted-foreground">All write actions require confirmation. No silent charges. Mock mode works without OpenAI key.</div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-sm">Gender Enforcement Demo</CardTitle></CardHeader><CardContent className="text-xs space-y-1">
          <div>✅ Mens Singles: 2M required</div>
          <div>✅ Womens Doubles: 4F required</div>
          <div className="font-bold">✅ Mixed Doubles: 2M/2F exactly - our differentiator</div>
          <div>❌ Throws error if 3M/1F in mixed</div>
          <div className="mt-2 p-2 bg-green-50 rounded">Test: Try to create mixed doubles with 3M - Vamos blocks it</div>
        </CardContent></Card>
      </div>
    </div>
  )
}
