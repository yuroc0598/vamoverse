"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EventCard } from "@/components/events/EventCard"
import { DisciplineSelector } from "@/components/events/DisciplineSelector"
import { Input } from "@/components/ui/input"
import { Discipline } from "@/lib/types/enums"
import { toast } from "sonner"

const mockEvents = [
  { id: 'evt_1', title: 'Adult 3.5 Doubles Clinic', discipline: 'open_doubles', type: 'group_clinic', start_at: new Date(Date.now()+24*3600*1000).toISOString(), end_at: new Date(Date.now()+24*3600*1000+90*60000).toISOString(), capacity: 8, registered_count: 6, price_cents: 4000, is_paid: true, level_min_utr: 3.5, level_max_utr: 5.0, location_name: 'Fremont Tennis Center', location_address: 'Fremont, CA', format: 'best_of_3_10pt_tb', scoring_system: 'no_ad' },
  { id: 'evt_2', title: 'Mixed Doubles - Needs 1F UTR 4-5', discipline: 'mixed_doubles', type: 'custom_match', start_at: new Date(Date.now()+48*3600*1000).toISOString(), end_at: new Date(Date.now()+48*3600*1000+120*60000).toISOString(), capacity: 4, registered_count: 3, price_cents: 0, is_paid: false, level_min_utr: 4, level_max_utr: 5, location_name: 'Fremont HS Court 2', location_address: 'Fremont, CA', format: 'pro_set_8_game', scoring_system: 'ad' },
  { id: 'evt_3', title: 'Private Lesson - Leo (Junior)', discipline: 'open_singles', type: 'private', start_at: new Date().toISOString(), end_at: new Date(Date.now()+60*60000).toISOString(), capacity: 1, registered_count: 1, price_cents: 8000, is_paid: true, location_name: 'Central Park Courts', location_address: 'Fremont, CA', format: 'timed_90' },
  { id: 'evt_4', title: 'Womens Doubles Ladder - Round Robin', discipline: 'womens_doubles', type: 'tournament', start_at: new Date(Date.now()+72*3600*1000).toISOString(), end_at: new Date(Date.now()+72*3600*1000+180*60000).toISOString(), capacity: 12, registered_count: 9, price_cents: 3500, is_paid: true, level_min_utr: 4, level_max_utr: 6, location_name: 'Bay Club', location_address: 'Fremont, CA' },
]

export default function EventsPage() {
  const [filter, setFilter] = useState<'all'|'paid'|'free'|'doubles'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', discipline: 'open_doubles' as Discipline, price: 40, isPaid: true, capacity: 8, levelMin: 3.5, levelMax: 5 })

  let filtered = mockEvents
  if (filter==='paid') filtered = mockEvents.filter(e=>e.is_paid)
  if (filter==='free') filtered = mockEvents.filter(e=>!e.is_paid)
  if (filter==='doubles') filtered = mockEvents.filter(e=>e.discipline.includes('doubles'))

  const handleCreate = () => {
    toast.success(`Vamos! Created ${form.title} - ${form.discipline} with ${form.capacity} spots, ${form.isPaid ? `$${form.price}` : 'Free'}, UTR ${form.levelMin}-${form.levelMax}. Gender enforcement: ${form.discipline.includes('mixed') ? '2M/2F required' : form.discipline.includes('mens') ? '4M' : '4F or Open'}`)
    setShowCreate(false)
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
              <label className="text-sm font-medium mb-2 block">Discipline - Gender Enforcement Built-in</label>
              <DisciplineSelector value={form.discipline} onChange={d=>setForm({...form, discipline: d, capacity: d.includes('doubles') ? 4 : 2})} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs">Capacity (auto)</label><Input type="number" value={form.capacity} onChange={e=>setForm({...form, capacity: parseInt(e.target.value)})} /></div>
              <div><label className="text-xs">UTR Min</label><Input type="number" step="0.1" value={form.levelMin} onChange={e=>setForm({...form, levelMin: parseFloat(e.target.value)})} /></div>
              <div><label className="text-xs">UTR Max</label><Input type="number" step="0.1" value={form.levelMax} onChange={e=>setForm({...form, levelMax: parseFloat(e.target.value)})} /></div>
            </div>
            <div className="flex gap-3 items-center">
              <button onClick={()=>setForm({...form, isPaid: !form.isPaid})} className={`px-3 py-1.5 rounded-full text-sm border ${form.isPaid ? 'bg-clay-500 text-white' : 'bg-gray-100'}`}>{form.isPaid ? 'Paid $' : 'Free'}</button>
              {form.isPaid && <Input type="number" className="w-24" value={form.price} onChange={e=>setForm({...form, price: parseInt(e.target.value)})} placeholder="$" />}
              <Badge variant="outline" className="ml-auto text-[10px]">Gender: {form.discipline.includes('mixed') ? '2M/2F enforced' : form.discipline.includes('mens') ? 'All M' : 'All F/Open'}</Badge>
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
