"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const mockConversations = [
  { id: '1', name: 'Adult 3.5 Doubles Clinic (Group)', type: 'group', last: 'Coach Alex: See you Sat 9am! Bring balls', unread: 2 },
  { id: '2', name: 'Maya • Player', type: 'dm', last: 'Maya: Can we reschedule Thu?', unread: 1 },
  { id: '3', name: 'Mixed Doubles Thu 7pm', type: 'group', last: 'Leo: I can bring extra balls', unread: 0 },
  { id: '4', name: 'Coach Alex Broadcast', type: 'broadcast', last: 'Broadcast: Rain - Mon clinics moved to Fri', unread: 0 },
]

export default function MessagesPage() {
  const [selected, setSelected] = useState(mockConversations[0])
  const [msg, setMsg] = useState("")
  const [messages, setMessages] = useState([
    { from: 'Coach Alex', body: 'See you Sat 9am! Bring balls, water, and good vibes - Vamos!', time: '9:00am' },
    { from: 'Maya', body: 'Got it! UTR 4-5 group right?', time: '9:05am' },
    { from: 'Coach Alex', body: 'Yes - 6/8 spots, Good Match for you Δ0.3', time: '9:06am' },
  ])

  const send = () => {
    if (!msg.trim()) return
    setMessages([...messages, { from: 'You', body: msg, time: 'now' }])
    setMsg("")
  }

  return (
    <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 h-[calc(100vh-120px)]">
      <Card className="md:col-span-1 flex flex-col">
        <CardHeader><CardTitle className="text-base">Messages - Permission Matrix Active</CardTitle><div className="text-xs text-muted-foreground">Coach broadcast • Coach-Student if linked • Student-Student only if Hitting Partners</div></CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-2">
          {mockConversations.map(c=>(
            <button key={c.id} onClick={()=>setSelected(c)} className={`w-full text-left p-3 rounded-xl border ${selected.id===c.id ? 'bg-clay-50 border-clay-200' : 'hover:bg-gray-50'}`}>
              <div className="flex justify-between"><span className="font-medium text-sm">{c.name}</span>{c.unread>0 && <Badge variant="default" className="text-[10px]">{c.unread}</Badge>}</div>
              <div className="text-xs text-muted-foreground truncate">{c.last}</div>
              <Badge variant="outline" className="text-[10px] mt-1">{c.type}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="md:col-span-2 flex flex-col">
        <CardHeader className="border-b py-3"><CardTitle className="text-base">{selected.name}</CardTitle><div className="text-xs text-muted-foreground">{selected.type} • Junior safety: Parent audit enabled for &lt;18</div></CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
          <div className="flex-1 space-y-3">
            {messages.map((m,i)=>(
              <div key={i} className={`p-2.5 rounded-xl text-sm max-w-[80%] ${m.from==='You' ? 'bg-clay-500 text-white self-end ml-auto' : 'bg-gray-100'}`}>
                <div className="font-medium text-xs opacity-70">{m.from}</div>
                <div>{m.body}</div>
                <div className="text-[10px] opacity-60 mt-1">{m.time}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t pt-3">
            <Input value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Message - Vamos style, short..." onKeyDown={e=>e.key==='Enter' && send()} />
            <Button onClick={send}>Send</Button>
          </div>
          <div className="text-[10px] text-muted-foreground">Safety: Profanity filter, rate limit 10/min, report button, parent audit for juniors</div>
        </CardContent>
      </Card>
    </div>
  )
}
