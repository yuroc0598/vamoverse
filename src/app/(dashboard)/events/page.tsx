"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EventCard } from "@/components/events/EventCard"
import { DisciplineSelector } from "@/components/events/DisciplineSelector"
import { Input } from "@/components/ui/input"
import { Discipline, EventType } from "@/lib/types/enums"
import { toast } from "sonner"
import { useAuth } from "@/hooks/useAuth"
import { getCapacityForDiscipline, validateDiscipline } from "@/lib/utils/gender"
import { listEvents, toApiEvent } from "@/lib/domain/catalog"

const mockEvents = listEvents().map(toApiEvent)

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
  const [filter, setFilter] = useState<'all'|'paid'|'free'|'doubles'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    title: '',
    discipline: 'open_doubles' as Discipline,
    eventType: 'group_clinic' as EventType,
    price: 40,
    isPaid: true,
    capacity: getCapacityForDiscipline('open_doubles', 'group_clinic'),
    levelMin: 3.5,
    levelMax: 5,
  })

  let filtered = mockEvents
  if (filter==='paid') filtered = mockEvents.filter(e=>e.is_paid)
  if (filter==='free') filtered = mockEvents.filter(e=>!e.is_paid)
  if (filter==='doubles') filtered = mockEvents.filter(e=>e.discipline.includes('doubles'))

  const handleCreate = () => {
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

    const expectedCap = getCapacityForDiscipline(form.discipline, form.eventType)
    if (form.eventType === 'custom_match' && form.capacity !== expectedCap) {
      // For custom_match capacity should match discipline, but allow override for open=20
      // Warn if mismatch but don't block for group_clinic which has default 8 up to 12
    }
    if (form.capacity > 20) {
      toast.error("Capacity max 20 for safety")
      return
    }

    const genderValidation = validateDiscipline(form.discipline, [])
    if (!genderValidation.valid) {
      toast.error(`Invalid discipline: ${genderValidation.error}`)
      return
    }

    const capForType = getCapacityForDiscipline(form.discipline, form.eventType)
    toast.success(`Vamos! Created ${form.title} - ${form.discipline} (${form.eventType}) with ${form.capacity} spots (expected ${capForType}), ${form.isPaid ? `$${form.price}` : 'Free'}, UTR ${form.levelMin}-${form.levelMax}. Gender enforcement: ${form.discipline.includes('mixed') ? '2M/2F required' : form.discipline.includes('mens') ? '4M' : form.discipline.includes('womens') ? '4F' : 'Open'}`)
    setShowCreate(false)
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Events & Clinics</h1>
          <p className="text-muted-foreground text-sm">Group clinics, custom matches, tournaments - Paid toggle, gender enforcement, auto-balance</p>
        </div>
        <Button onClick={()=>setShowCreate(!showCreate)}>{showCreate ? 'Cancel' : '+ New Event'}</Button>
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
            <div className="flex gap-3 items-center">
              <button onClick={()=>setForm({...form, isPaid: !form.isPaid})} className={`px-3 py-1.5 rounded-full text-sm border ${form.isPaid ? 'bg-clay-500 text-white' : 'bg-gray-100'}`}>{form.isPaid ? 'Paid $' : 'Free'}</button>
              {form.isPaid && <Input type="number" className="w-24" value={form.price} onChange={e=>setForm({...form, price: safeParseInt(e.target.value, form.price)})} placeholder="$" />}
              <Badge variant="outline" className="ml-auto text-[10px]">Gender: {form.discipline.includes('mixed') ? '2M/2F enforced' : form.discipline.includes('mens') ? 'All M' : form.discipline.includes('womens') ? 'All F' : 'Open/All'} • Cap {getCapacityForDiscipline(form.discipline, form.eventType)}</Badge>
            </div>
            <Button onClick={handleCreate} className="w-full">Publish - Notify Crew (Vamos!)</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {(['all','paid','free','doubles'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-sm border capitalize ${filter===f ? 'bg-clay-500 text-white border-clay-500' : 'bg-white'}`}>{f}</button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(evt=>(
          <EventCard key={evt.id} event={evt} playerUTR={4.5} />
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4 text-sm">
          <div className="font-semibold">How Paid Events Work:</div>
          <div>Coach toggles Free/Paid + Price when creating. Student pays at registration to secure spot. If paid event, payment captured immediately. If lesson, auto-pay after completed with 2hr dispute window. Semi-private split automatically.</div>
        </CardContent>
      </Card>
    </div>
  )
}
