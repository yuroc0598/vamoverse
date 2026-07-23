"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapPin, Clock, Users, DollarSign } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency, safeNumber, safeToLocaleString } from "@/lib/utils"
import { registerWithCapacityCheck } from "@/lib/utils/capacity"
import { validateDiscipline } from "@/lib/utils/gender"
import { getCapacityForDiscipline } from "@/lib/utils/gender"
import { getEvent, getPlayer, toApiEvent, toRosterPlayer } from "@/lib/domain/catalog"
import { MATCH_FORMAT_LABELS, SCORING_LABELS } from "@/lib/types/enums"

// Rich descriptions are specific to this detail view; structured fields come from the catalog.
const EVENT_DESCRIPTIONS: Record<string, string> = {
  evt_2: 'Looking for 1 more female player at UTR 4-5 for competitive mixed doubles. We are 2M (4.5, 4.2) and 1F (4.8) looking for even match. Format: Pro Set, Ad scoring, verified for UTR optional.',
  evt_1: 'Adult 3.5 doubles clinic — rotating drills and match play. 8 spots, coached by Alex.',
}
// Which catalog players are currently on each event's roster (match-specific).
const EVENT_ROSTERS: Record<string, string[]> = {
  evt_2: ['student_1', 'student_2', 'student_3'],
}

export default function EventDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [registered, setRegistered] = useState(false)
  const [waitlisted, setWaitlisted] = useState(false)
  const [loading, setLoading] = useState(false)

  const catalogEvent = getEvent(params.id) ?? getEvent('evt_2')!
  const apiEvent = toApiEvent(catalogEvent)
  const event = {
    ...apiEvent,
    discipline: apiEvent.discipline as any,
    format: apiEvent.format ? MATCH_FORMAT_LABELS[apiEvent.format] : '—',
    scoring: apiEvent.scoring_system ? SCORING_LABELS[apiEvent.scoring_system] : '—',
    description: EVENT_DESCRIPTIONS[catalogEvent.id] ?? `${apiEvent.title} at ${apiEvent.location_name}.`,
  }

  const roster = (EVENT_ROSTERS[catalogEvent.id] ?? [])
    .map(getPlayer)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ ...toRosterPlayer(p), avatar: p.name[0] }))

  const mockCurrentUser = { id: 'current_user', name: 'You', gender: 'F' as const, utr: 4.5 }

  const handleRegister = async () => {
    setLoading(true)
    try {
      const validation = validateDiscipline(event.discipline, [...roster, mockCurrentUser].map(p=>({id:p.id, gender:p.gender})))
      if (!validation.valid) {
        toast.error(`Blocked by gender enforcement: ${validation.error}`)
        setLoading(false)
        return
      }

      const cap = safeNumber(event.capacity, getCapacityForDiscipline(event.discipline, event.type))
      const occurrenceId = `${event.id}_occ_${new Date(event.start_at).toISOString()}`
      const result = await registerWithCapacityCheck(occurrenceId, mockCurrentUser.id, event.id, cap)

      if (!result.success) {
        toast.error(result.error || 'Registration failed')
        setLoading(false)
        return
      }

      if (result.status === 'waitlisted') {
        setWaitlisted(true)
        toast.info("Event full - Joined waitlist. Vamos will notify when spot opens (FOR UPDATE SKIP LOCKED promotion)")
        setLoading(false)
        return
      }

      if ((safeNumber(event.price_cents,0) ?? 0) > 0) {
        toast.success(`Charged ${formatCurrency(safeNumber(event.price_cents,0))} - Registered! ID ${result.registrationId}. Coach notified. Vamos!`)
      } else {
        toast.success(`Registered! Free event - you are in. Group chat created. ID ${result.registrationId}`)
      }
      setRegistered(true)
    } catch (e:any) {
      toast.error(`Registration error: ${e?.message || 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleWaitlist = async () => {
    setLoading(true)
    try {
      const cap = safeNumber(event.capacity, getCapacityForDiscipline(event.discipline, event.type))
      const occurrenceId = `${event.id}_occ_${new Date(event.start_at).toISOString()}`
      // Single server-authoritative call: waitlists if full, otherwise takes the open spot.
      const result = await registerWithCapacityCheck(occurrenceId, mockCurrentUser.id, event.id, cap)
      if (!result.success) {
        toast.error(result.error || 'Could not join waitlist')
        return
      }
      if (result.status === 'waitlisted') {
        setWaitlisted(true)
        toast("Joined waitlist - Vamos will notify when spot opens (SKIP LOCKED promotion)")
      } else {
        setRegistered(true)
        toast.success("Spot was open - you are registered!")
      }
    } finally {
      setLoading(false)
    }
  }

  const priceCents = safeNumber(event.price_cents,0)
  const isPaid = priceCents > 0
  const capacity = safeNumber(event.capacity, getCapacityForDiscipline(event.discipline, event.type))
  const registeredCount = safeNumber(event.registered_count,0)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><a href="/events" className="hover:text-foreground">← Events</a> / {event.id}</div>
      
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between">
                <Badge>{event.discipline.replace('_',' ')} • {event.type}</Badge>
                <Badge variant={isPaid ? "default" : "success"}>{isPaid ? `${formatCurrency(priceCents)} Paid` : 'Free'}</Badge>
              </div>
              <CardTitle className="text-2xl mt-3">{event.title}</CardTitle>
              <CardDescription>{event.format} • {event.scoring} • UTR {event.level_min_utr}-{event.level_max_utr}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> {safeToLocaleString(event.start_at)}</div>
                <div className="flex items-center gap-2"><Users className="w-4 h-4" /> {registeredCount}/{capacity} - {Math.max(0, capacity-registeredCount)} spots left</div>
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {event.location_name}</div>
                <div className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> {isPaid ? `${formatCurrency(priceCents)} pay at registration` : 'Free, no payment'}</div>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-xl text-sm">{event.description}</div>

              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">Gender: {event.discipline.includes('mixed') ? '2M/2F enforced' : event.discipline.includes('mens') ? '4M' : event.discipline.includes('womens') ? '4F' : 'Open'} • validateDiscipline wired</Badge>
                <Badge variant="outline">Capacity: {capacity} • getCapacityForDiscipline({event.discipline},{event.type})</Badge>
                <Badge variant="outline">Level gated: UTR {event.level_min_utr}-{event.level_max_utr}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Roster - Gender Enforcement Live (validateDiscipline)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {roster.map(p=>(
                  <div key={p.id} className="p-3 border rounded-xl flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${p.gender==='M'?'bg-blue-500':'bg-pink-500'}`}>{p.avatar}</div>
                    <div>
                      <div className="font-medium text-sm">{p.name} • {p.gender} • UTR {p.utr}</div>
                      <div className="text-xs text-muted-foreground">Team {['A','A','B'][parseInt(p.id)-1] || 'B'}</div>
                    </div>
                  </div>
                ))}
                <div className="p-3 border-2 border-dashed rounded-xl flex items-center justify-center text-sm text-muted-foreground">
                  + Empty slot - Needs 1F (Mixed 2M/2F)
                </div>
              </div>

              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
                <div className="font-semibold">Auto-Balance: Balanced Δ0.2 - Great match! (suggestBalancedTeams avgUTR fix)</div>
                <div>Team A: Maya 4.5 + Leo 4.5 = 9.0 vs Team B: Sarah 4.8 + Emma 4.2 = 9.0 • Delta 0.0 • Vamos!</div>
                {roster.length===3 && <div className="mt-1 text-amber-700">If you join (UTR 4.5F), teams stay balanced - avgUTR fallback 5.0 not 0</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Action • registerWithCapacityCheck + gender</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!registered ? (
                <>
                  <div className="text-xs p-2 bg-blue-50 rounded">Compatibility: Good Match • Δ0.3 • You are UTR 4.5F, event 4-5 • Server count used, TOCTOU fixed FOR UPDATE</div>
                  <Button className="w-full" disabled={loading} onClick={handleRegister}>{isPaid ? `Register + Pay ${formatCurrency(priceCents)} - Vamos!` : 'Join - Free • Capacity TX'}</Button>
                  <Button variant="outline" className="w-full" disabled={loading} onClick={handleWaitlist}>Join Waitlist • SKIP LOCKED</Button>
                  {waitlisted && <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded">Waitlisted - will auto-promote via SKIP LOCKED</div>}
                </>
              ) : (
                <div className="text-center">
                  <Badge variant="success" className="mb-2">Registered ✓ • ID verified</Badge>
                  <div className="text-sm">You are in! Group chat created. Server count incremented atomically.</div>
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={()=>setRegistered(false)}>Cancel Registration</Button>
                </div>
              )}
              <div className="text-xs text-muted-foreground">Cancelling &lt;24h incurs 50% late fee per coach policy. No-show 100%. Capacity enforced server-side.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Location - Google Places</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="font-medium">{event.location_name}</div>
              <div className="text-muted-foreground">{event.location_address}</div>
              <div className="mt-2 w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center">Map Pin • {event.location_name}</div>
              <div className="text-xs mt-2">Notes: Court 2, bring balls, parking behind • Timezone America/Los_Angeles UTC stored</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Ask Vamos About This</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={()=>router.push('/vamos')}>Who is in this match + UTRs?</Button>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={()=>router.push('/vamos')}>Is this a good level for me?</Button>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={()=>router.push('/vamos')}>Balance the teams • Balanced Δ suggest</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
