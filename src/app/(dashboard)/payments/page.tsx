"use client"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatCurrency, safeNumber, safeToLocaleString } from "@/lib/utils"
import { getPaymentClient } from "@/lib/payments/client"
import { listCoachPaymentsUi } from "@/lib/domain/catalog"

// Coach-facing view derived from the canonical catalog (single source of truth).
const mockPaymentsInitial = listCoachPaymentsUi('coach_1')

export default function PaymentsPage() {
  const [payments, setPayments] = useState(mockPaymentsInitial)
  const [filter, setFilter] = useState<'all'|'requires_capture'|'captured'>('all')

  // Keep a ref to the latest payments so the interval reads current state without
  // re-subscribing, and so side effects stay OUT of the setState updater (which
  // React StrictMode double-invokes in dev -> would double toast / double capture).
  const paymentsRef = useRef(payments)
  useEffect(() => { paymentsRef.current = payments }, [payments])

  useEffect(() => {
    const isDue = (p: { status: string; auto_capture_at?: string }, now: Date) => {
      if (p.status !== 'requires_capture' || !p.auto_capture_at) return false
      const at = new Date(p.auto_capture_at)
      return !isNaN(at.getTime()) && at <= now
    }
    const interval = setInterval(() => {
      const now = new Date()
      const toCapture = paymentsRef.current.filter(p => isDue(p, now))
      if (toCapture.length === 0) return
      const dueIds = new Set(toCapture.map(p => p.id))
      // Pure updater: only maps based on precomputed ids.
      setPayments(prev => prev.map(p => dueIds.has(p.id) ? { ...p, status: 'captured' as const } : p))
      // Side effects run exactly once, outside the updater.
      toCapture.forEach(cp => {
        toast.success(`Auto-captured ${formatCurrency(safeNumber(cp.amount_cents,0))} for ${cp.student_name} - Vamos!`)
      })
      try {
        const client = getPaymentClient()
        toCapture.forEach(cp => client.capturePayment(cp.id).catch(() => {}))
      } catch {}
      fetch('/api/cron/capture', { method: 'POST' }).catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const filtered = filter==='all' ? payments : payments.filter(p=>p.status===filter)
  const totalRevenue = payments.filter(p=>p.status==='captured').reduce((s,p)=>s+safeNumber(p.amount_cents,0),0)
  const pendingRevenue = payments.filter(p=>p.status==='requires_capture').reduce((s,p)=>s+safeNumber(p.amount_cents,0),0)

  const handleCapture = (id: string) => {
    setPayments(p=>p.map(x=>x.id===id ? {...x, status: 'captured'} : x))
    try {
      const client = getPaymentClient()
      client.capturePayment(id).catch(()=>{})
    } catch {}
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
                <div className="text-xs text-muted-foreground">{safeToLocaleString(p.created_at)} • {p.id.slice(0,8)}</div>
                {p.status==='requires_capture' && p.auto_capture_at && (() => {
                  const at = new Date(p.auto_capture_at)
                  const valid = !isNaN(at.getTime())
                  if (!valid) {
                    return <div className="text-xs text-amber-700">pending • 2hr dispute window (2min demo)</div>
                  }
                  const diff = at.getTime() - Date.now()
                  const sec = Math.max(0, Math.round(diff / 1000))
                  return <div className="text-xs text-amber-700">Auto-captures in {sec}s • 2hr dispute window (2min demo)</div>
                })()}
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
