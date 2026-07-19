"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapPin, Clock, Users, DollarSign } from "lucide-react"
import { toast } from "sonner"

export default function EventDetailPage({ params }: { params: { id: string } }) {
  const [registered, setRegistered] = useState(false)
  const [waitlisted, setWaitlisted] = useState(false)
  
  // Mock event
  const event = {
    id: params.id,
    title: params.id === 'evt_2' ? 'Mixed Doubles - Needs 1F UTR 4-5' : 'Adult 3.5 Doubles Clinic',
    discipline: params.id === 'evt_2' ? 'mixed_doubles' : 'open_doubles',
    type: params.id === 'evt_2' ? 'custom_match' : 'group_clinic',
    start_at: new Date(Date.now()+24*3600*1000).toISOString(),
    end_at: new Date(Date.now()+24*3600*1000+90*60000).toISOString(),
    capacity: 4,
    registered_count: 3,
    price_cents: params.id === 'evt_2' ? 0 : 4000,
    is_paid: params.id !== 'evt_2',
    level_min_utr: 4,
    level_max_utr: 5,
    location_name: 'Fremont Tennis Center',
    location_address: 'Fremont, CA 94536 - Court 2',
    format: 'Best of 3 with 10pt TB',
    scoring: 'No-Ad',
    description: 'Looking for 1 more female player at UTR 4-5 for competitive mixed doubles. We are 2M (4.5, 4.2) and 1F (4.8) looking for even match. Format: Best of 3 with match tiebreak, No-Ad scoring, verified for UTR optional.'
  }

  const roster = [
    { id: '1', name: 'Maya', gender: 'F', utr: 4.5, avatar: 'M' },
    { id: '2', name: 'Sarah', gender: 'F', utr: 4.8, avatar: 'S' },
    { id: '3', name: 'Leo', gender: 'M', utr: 4.5, avatar: 'L' },
  ]

  const handleRegister = () => {
    if (event.is_paid) {
      toast.success(`Charged $${(event.price_cents/100).toFixed(0)} - Registered! You are in. Coach Alex notified. Vamos!`)
    } else {
      toast.success("Registered! Free event - you are in. Group chat created.")
    }
    setRegistered(true)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><a href="/events" className="hover:text-foreground">← Events</a> / {event.id}</div>
      
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between">
                <Badge>{event.discipline.replace('_',' ')} • {event.type}</Badge>
                <Badge variant={event.is_paid ? "default" : "success"}>{event.is_paid ? `$${(event.price_cents/100).toFixed(0)} Paid` : 'Free'}</Badge>
              </div>
              <CardTitle className="text-2xl mt-3">{event.title}</CardTitle>
              <CardDescription>{event.format} • {event.scoring} • UTR {event.level_min_utr}-{event.level_max_utr}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> {new Date(event.start_at).toLocaleString()}</div>
                <div className="flex items-center gap-2"><Users className="w-4 h-4" /> {event.registered_count}/{event.capacity} - {event.capacity - event.registered_count} spots left</div>
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {event.location_name}</div>
                <div className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> {event.is_paid ? `$${(event.price_cents/100).toFixed(0)} pay at registration` : 'Free, no payment'}</div>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-xl text-sm">{event.description}</div>

              <div className="flex gap-2">
                <Badge variant="outline">Gender: {event.discipline.includes('mixed') ? '2M/2F enforced' : 'Open'}</Badge>
                <Badge variant="outline">Capacity: {event.capacity}</Badge>
                <Badge variant="outline">Level gated: UTR {event.level_min_utr}-{event.level_max_utr}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Roster - Gender Enforcement Live</CardTitle></CardHeader>
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
                <div className="font-semibold">Auto-Balance: Balanced Δ0.2 - Great match!</div>
                <div>Team A: Maya 4.5 + Leo 4.5 = 9.0 vs Team B: Sarah 4.8 + Emma 4.2 = 9.0 • Delta 0.0 • Vamos!</div>
                {roster.length===3 && <div className="mt-1 text-amber-700">If you join (UTR 4.5F), teams stay balanced</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Action</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!registered ? (
                <>
                  <div className="text-xs p-2 bg-blue-50 rounded">Compatibility: Good Match • Δ0.3 • You are UTR 4.5F, event 4-5</div>
                  <Button className="w-full" onClick={handleRegister}>{event.is_paid ? `Register + Pay $${(event.price_cents/100).toFixed(0)} - Vamos!` : 'Join - Free'}</Button>
                  <Button variant="outline" className="w-full" onClick={()=>{setWaitlisted(true); toast("Joined waitlist - Vamos will notify when spot opens")}}>Join Waitlist</Button>
                </>
              ) : (
                <div className="text-center">
                  <Badge variant="success" className="mb-2">Registered ✓</Badge>
                  <div className="text-sm">You are in! Group chat created.</div>
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={()=>setRegistered(false)}>Cancel Registration</Button>
                </div>
              )}
              <div className="text-xs text-muted-foreground">Cancelling &lt;24h incurs 50% late fee per coach policy. No-show 100%.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Location - Google Places</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="font-medium">{event.location_name}</div>
              <div className="text-muted-foreground">{event.location_address}</div>
              <div className="mt-2 w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center">Map Pin • {event.location_name}</div>
              <div className="text-xs mt-2">Notes: Court 2, bring balls, parking behind</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Ask Vamos About This</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={()=>window.location.href='/vamos'}>Who is in this match + UTRs?</Button>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={()=>window.location.href='/vamos'}>Is this a good level for me?</Button>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={()=>window.location.href='/vamos'}>Balance the teams</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
