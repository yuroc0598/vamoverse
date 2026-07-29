"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EventCard } from "@/components/events/EventCard"
import { DisciplineSelector } from "@/components/events/DisciplineSelector"
import { Input } from "@/components/ui/input"
import { Discipline, EventType } from "@/lib/types/enums"
import { toast } from "sonner"
import { useAuth } from "@/hooks/useAuth"
import { getCapacityForDiscipline } from "@/lib/utils/gender"
import { apiUrl } from "@/lib/api"

const EVENT_TYPE_OPTIONS: EventType[] = ['private', 'semi_private', 'group_clinic', 'tournament', 'custom_match', 'social_mixer']

function safeParseInt(v: string, fallback: number): number {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}
function safeParseFloat(v: string, fallback: number): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

export default function EventsPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [filter, setFilter] = useState<'all'|'paid'|'free'|'doubles'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(() => ({
    title: '',
    discipline: 'open_doubles' as Discipline,
    eventType: 'group_clinic' as EventType,
    price: 40,
    isPaid: true,
    capacity: getCapacityForDiscipline('open_doubles', 'group_clinic'),
    levelMin: 3.5,
    levelMax: 5,
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    durationMinutes: 90,
    locationName: 'Fremont Tennis Center',
  }))

  useEffect(() => {
    let active = true
    fetch(apiUrl('/api/events'))
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load events')
        if (active) setEvents(payload.events)
      })
      .catch((error) => active && toast.error(error instanceof Error ? error.message : 'Could not load events'))
      .finally(() => active && setLoadingEvents(false))
    return () => { active = false }
  }, [])

  let filtered = events
  if (filter==='paid') filtered = events.filter(e=>e.is_paid)
  if (filter==='free') filtered = events.filter(e=>!e.is_paid)
  if (filter==='doubles') filtered = events.filter(e=>e.discipline.includes('doubles'))

  const handleCreate = async () => {
    if (user?.role !== 'coach') {
      toast.error("Only coaches can create events (KYC required)")
      return
    }
    if (!form.title.trim()) {
      toast.error("Title is required")
      return
    }
    if (!Number.isFinite(form.capacity) || form.capacity <= 0) {
      toast.error("Capacity must be a valid positive number")
      return
    }
    if (!Number.isFinite(form.levelMin) || !Number.isFinite(form.levelMax)) {
      toast.error("UTR min/max must be valid numbers")
      return
    }
    if (form.levelMin < 1 || form.levelMax > 16.5 || form.levelMin > form.levelMax) {
      toast.error("UTR must be 1-16.5 and min <= max")
      return
    }
    if (!Number.isFinite(form.price) || form.price < 0) {
      toast.error("Price must be valid")
      return
    }
    const startTime = new Date(form.startsAt).getTime()
    if (!Number.isFinite(startTime) || startTime <= Date.now()) {
      toast.error("Start time must be in the future")
      return
    }
    if (form.capacity > 20) {
      toast.error("Capacity max 20 for safety")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(apiUrl('/api/events'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          discipline: form.discipline,
          type: form.eventType,
          capacity: form.capacity,
          priceCents: form.isPaid ? Math.round(form.price * 100) : 0,
          levelMinUtr: form.levelMin,
          levelMaxUtr: form.levelMax,
          startsAt: new Date(form.startsAt).toISOString(),
          durationMinutes: form.durationMinutes,
          locationName: form.locationName,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Event creation failed')
      setEvents((current) => [payload.event, ...current])
      toast.success(payload.demo ? 'Demo event saved for this server session.' : 'Event published successfully.')
      setShowCreate(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Event creation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const onDisciplineChange = (d: Discipline) => {
    const newCap = getCapacityForDiscipline(d, form.eventType)
    setForm(prev => ({ ...prev, discipline: d, capacity: newCap }))
  }

  const onEventTypeChange = (t: EventType) => {
    const newCap = getCapacityForDiscipline(form.discipline, t)
    setForm(prev => ({ ...prev, eventType: t, capacity: newCap }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Events & Clinics</h1>
          <p className="text-muted-foreground text-sm">Group clinics, custom matches, tournaments - Paid toggle, gender enforcement, auto-balance</p>
        </div>
        {user?.role === 'coach' && <Button className="shrink-0 w-full sm:w-auto" onClick={()=>setShowCreate(!showCreate)}>{showCreate ? 'Cancel' : '+ New Event'}</Button>}
      </div>

      {showCreate && (
        <Card className="border-clay-200">
          <CardHeader><CardTitle className="text-base">Create Event - Coach Only</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={form.title} onChange={e=>setForm({...form, title: e.target.value})} placeholder="Adult 3.5 Doubles Clinic" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Event Type</label>
              <select value={form.eventType} onChange={e=>onEventTypeChange(e.target.value as EventType)} className="w-full h-11 border rounded-xl px-3 text-sm">
                {EVENT_TYPE_OPTIONS.map(t=> <option key={t} value={t}>{t.replace('_',' ')} (cap {getCapacityForDiscipline(form.discipline, t)})</option>)}
              </select>
              <div className="text-[10px] text-muted-foreground mt-1">Capacity auto: {getCapacityForDiscipline(form.discipline, form.eventType)} for {form.discipline} + {form.eventType}</div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Discipline - Gender Enforcement Built-in (validateDiscipline)</label>
              <DisciplineSelector value={form.discipline} onChange={onDisciplineChange} eventType={form.eventType} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs">Capacity (auto from getCapacityForDiscipline)</label><Input type="number" value={form.capacity} onChange={e=>setForm({...form, capacity: safeParseInt(e.target.value, form.capacity)})} /></div>
              <div><label className="text-xs">UTR Min</label><Input type="number" step="0.1" value={form.levelMin} onChange={e=>setForm({...form, levelMin: safeParseFloat(e.target.value, form.levelMin)})} /></div>
              <div><label className="text-xs">UTR Max</label><Input type="number" step="0.1" value={form.levelMax} onChange={e=>setForm({...form, levelMax: safeParseFloat(e.target.value, form.levelMax)})} /></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="text-xs">Starts</label><Input type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form, startsAt:e.target.value})} /></div>
              <div><label className="text-xs">Duration (minutes)</label><Input type="number" min={30} max={480} value={form.durationMinutes} onChange={e=>setForm({...form, durationMinutes:safeParseInt(e.target.value, form.durationMinutes)})} /></div>
              <div><label className="text-xs">Location</label><Input value={form.locationName} onChange={e=>setForm({...form, locationName:e.target.value})} /></div>
            </div>
            <div className="flex gap-3 items-center">
              <button onClick={()=>setForm({...form, isPaid: !form.isPaid})} className={`px-3 py-1.5 rounded-full text-sm border ${form.isPaid ? 'bg-clay-500 text-white' : 'bg-gray-100'}`}>{form.isPaid ? 'Paid $' : 'Free'}</button>
              {form.isPaid && <Input type="number" className="w-24" value={form.price} onChange={e=>setForm({...form, price: safeParseInt(e.target.value, form.price)})} placeholder="$" />}
              <Badge variant="outline" className="ml-auto text-[10px]">Gender: {form.discipline.includes('mixed') ? '2M/2F enforced' : form.discipline.includes('mens') ? 'All M' : form.discipline.includes('womens') ? 'All F' : 'Open/All'} • Cap {getCapacityForDiscipline(form.discipline, form.eventType)}</Badge>
            </div>
            <Button onClick={handleCreate} className="w-full" disabled={submitting}>{submitting ? 'Publishing…' : 'Publish Event'}</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {(['all','paid','free','doubles'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-sm border capitalize ${filter===f ? 'bg-clay-500 text-white border-clay-500' : 'bg-white'}`}>{f}</button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {!loadingEvents && filtered.length === 0 && <div className="text-sm text-muted-foreground">No published events found.</div>}
        {filtered.map(evt=>(
          <EventCard key={evt.id} event={evt} playerUTR={4.5} />
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4 text-sm">
          <div className="font-semibold">Paid-event status:</div>
          <div>Registration requires an already captured, server-verified payment for the exact occurrence and amount. Checkout creation is not enabled yet, so the app will refuse paid registration instead of claiming a charge occurred.</div>
        </CardContent>
      </Card>
    </div>
  )
}
