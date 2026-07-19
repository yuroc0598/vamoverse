"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"

const mockPaymentsInitial = [
  { id: 'pay_1', coach_id: 'coach_1', student_id: 'student_3', student_name: 'Leo (Junior)', amount_cents: 8000, type: 'lesson_auto', status: 'requires_capture', description: 'Private Lesson Mon 3pm', auto_capture_at: new Date(Date.now()+2*60*1000).toISOString(), created_at: new Date().toISOString() },
  { id: 'pay_2', coach_id: 'coach_1', student_id: 'student_1', student_name: 'Maya', amount_cents: 4000, type: 'event_registration', status: 'captured', description: 'Group Clinic Sat 9am', created_at: new Date().toISOString() },
  { id: 'pay_3', coach_id: 'coach_1', student_id: 'student_2', student_name: 'Sarah', amount_cents: 4000, type: 'adhoc', status: 'captured', description: 'Stringing', created_at: new Date().toISOString() },
  { id: 'pay_4', coach_id: 'coach_1', student_id: 'student_1', student_name: 'Maya', amount_cents: 4000, type: 'late_fee', status: 'pending', description: 'Late cancel <24h', created_at: new Date().toISOString() },
]

export default function PaymentsPage() {
  const [payments, setPayments] = useState(mockPaymentsInitial)
  const [filter, setFilter] = useState<'all'|'requires_capture'|'captured'>('all')

  useEffect(() => {
    // Auto-capture timer check every 5 sec for demo
    const interval = setInterval(() => {
      setPayments(prev => prev.map(p => {
        if (p.status==='requires_capture' && p.auto_capture_at && new Date(p.auto_capture_at) <= new Date()) {
          toast.success(`Auto-captured $${(p.amount_cents/100).toFixed(0)} for ${p.student_name} - Vamos!`)
          return { ...p, status: 'captured' }
        }
        return p
      }))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const filtered = filter==='all' ? payments : payments.filter(p=>p.status===filter)
  const totalRevenue = payments.filter(p=>p.status==='captured').reduce((s,p)=>s+p.amount_cents,0)
  const pendingRevenue = payments.filter(p=>p.status==='requires_capture').reduce((s,p)=>s+p.amount_cents,0)

  const handleCapture = (id: string) => {
    setPayments(p=>p.map(x=>x.id===id ? {...x, status: 'captured'} : x))
    toast.success("Captured! Receipt sent. Vamos!")
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Payments - Stripe Mock</h1>
        <p className="text-sm text-muted-foreground">Auto-pay after session with 2hr dispute window (2min for demo), Paid events at registration, Ad-hoc charges</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total Captured (Week)</CardDescription><CardTitle>{formatCurrency(totalRevenue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Pending Capture</CardDescription><CardTitle>{formatCurrency(pendingRevenue)}</CardTitle></CardHeader><CardContent><Badge variant="warning">{payments.filter(p=>p.status==='requires_capture').length} action</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Mock Mode</CardDescription><CardTitle className="text-base">No Stripe Key Needed</CardTitle></CardHeader><CardContent><div className="text-xs">Payments stored in localStorage, auto-capture after 2min for demo</div></CardContent></Card>
      </div>

      <div className="flex gap-2">
        {(['all','requires_capture','captured'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-sm border capitalize ${filter===f ? 'bg-clay-500 text-white' : 'bg-white'}`}>{f.replace('_',' ')}</button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {filtered.map(p=>(
            <div key={p.id} className="flex items-center justify-between p-3 border rounded-xl">
              <div>
                <div className="font-medium text-sm">{p.student_name} • {p.description} • {p.type.replace('_',' ')}</div>
                <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()} • {p.id.slice(0,8)}</div>
                {p.status==='requires_capture' && p.auto_capture_at && <div className="text-xs text-amber-700">Auto-captures in {Math.max(0, Math.round((new Date(p.auto_capture_at).getTime() - Date.now())/1000))}s • 2hr dispute window (2min demo)</div>}
              </div>
              <div className="text-right flex items-center gap-3">
                <div>
                  <div className="font-bold">{formatCurrency(p.amount_cents)}</div>
                  <Badge variant={p.status==='captured' ? 'success' : p.status==='requires_capture' ? 'warning' : 'muted'} className="text-[10px]">{p.status}</Badge>
                </div>
                {p.status==='requires_capture' && <Button size="sm" onClick={()=>handleCapture(p.id)}>Capture Now</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-gray-50">
        <CardContent className="p-4 text-xs space-y-1">
          <div className="font-semibold">How Auto-Pay Works (Vamoverse spec):</div>
          <div>1. Coach marks session Completed</div>
          <div>2. System creates Payment with status requires_capture, auto_capture_at = now + 2h (2min demo)</div>
          <div>3. Student sees "Auto-pay in 1h 45m" + Dispute button for 2h</div>
          <div>4. Cron /api/cron/capture checks every minute, captures if auto_capture_at passed and not disputed</div>
          <div>5. Semi-private split: create 2-4 payment intents divided evenly</div>
          <div>6. Paid events: capture immediately at registration</div>
        </CardContent>
      </Card>
    </div>
  )
}
