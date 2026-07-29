"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatCurrency, safeNumber, safeToLocaleString } from "@/lib/utils"
import { apiUrl } from "@/lib/api"
import { useAuth } from "@/hooks/useAuth"

export default function PaymentsPage() {
  const { user } = useAuth()
  const [payments, setPayments] = useState<any[]>([])
  const [filter, setFilter] = useState<'all'|'requires_capture'|'captured'>('all')
  const [demo, setDemo] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch(apiUrl('/api/payments'))
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load payments')
        if (active) {
          setPayments(payload.payments)
          setDemo(Boolean(payload.demo))
        }
      })
      .catch((error) => active && toast.error(error instanceof Error ? error.message : 'Could not load payments'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const filtered = filter==='all' ? payments : payments.filter(p=>p.status===filter)
  const totalRevenue = payments.filter(p=>p.status==='captured').reduce((s,p)=>s+safeNumber(p.amount_cents,0),0)
  const pendingRevenue = payments.filter(p=>p.status==='requires_capture').reduce((s,p)=>s+safeNumber(p.amount_cents,0),0)

  const handleCapture = async (id: string) => {
    try {
      const response = await fetch(apiUrl(`/api/payments/${encodeURIComponent(id)}/capture`), { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Capture failed')
      setPayments(current => current.map(payment => payment.id === id ? { ...payment, status: payload.status } : payment))
      toast.success('Payment capture confirmed by Stripe.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Capture failed')
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">Authoritative payment status from the server; demo entries never move money.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total Captured (Week)</CardDescription><CardTitle>{formatCurrency(totalRevenue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Pending Capture</CardDescription><CardTitle>{formatCurrency(pendingRevenue)}</CardTitle></CardHeader><CardContent><Badge variant="warning">{payments.filter(p=>p.status==='requires_capture').length} action</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Backend</CardDescription><CardTitle className="text-base">{demo ? 'Demo ledger' : 'Stripe + database'}</CardTitle></CardHeader><CardContent><div className="text-xs">{demo ? 'Read-only sample data; no money moves in demo mode.' : 'Status is reconciled from verified Stripe webhooks.'}</div></CardContent></Card>
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
                {user?.role === 'coach' && p.status==='requires_capture' && <Button size="sm" disabled={demo || loading} onClick={()=>handleCapture(p.id)}>{demo ? 'Demo only' : 'Capture Now'}</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-gray-50">
        <CardContent className="p-4 text-xs space-y-1">
          <div className="font-semibold">Current payment boundary:</div>
          <div>Verified Stripe webhooks and the capture job reconcile existing payment records. Payment/checkout creation, disputes, session-completion billing, and semi-private splitting are not enabled in this build.</div>
        </CardContent>
      </Card>
    </div>
  )
}
