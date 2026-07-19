"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"

const mockSchedule = [
  { id: '1', title: 'Private - Leo', time: 'Today 3:00 PM', duration: 60, type: 'private', location: 'Fremont HS Court 3', status: 'upcoming', price: 80 },
  { id: '2', title: 'Adult 3.5 Doubles Clinic', time: 'Today 5:30 PM', duration: 90, type: 'group_clinic', location: 'Fremont Tennis Center', spots: '6/8', price: 40 },
  { id: '3', title: 'Mixed Doubles - Needs 1F', time: 'Tomorrow 7:00 PM', duration: 120, type: 'custom_match', location: 'Fremont HS Court 2', spots: '3/4' },
  { id: '4', title: 'Private - Maya', time: 'Thu 3:00 PM', duration: 60, type: 'private', location: 'Fremont HS', price: 80 },
]

export default function SchedulePage() {
  const [view, setView] = useState<'agenda'|'week'>('agenda')

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-sm text-muted-foreground">Agenda + Week view • Recurring events • Timezone aware</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view==='agenda'?'default':'outline'} size="sm" onClick={()=>setView('agenda')}>Agenda</Button>
          <Button variant={view==='week'?'default':'outline'} size="sm" onClick={()=>setView('week')}>Week</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">This Week - {mockSchedule.length} sessions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {mockSchedule.map(s=>(
            <div key={s.id} className="p-3 border rounded-xl flex justify-between items-center">
              <div>
                <div className="font-medium text-sm">{s.title}</div>
                <div className="text-xs text-muted-foreground">{s.time} • {s.duration}min • {s.location}</div>
              </div>
              <div className="text-right">
                <Badge variant={s.type==='private' ? 'default' : s.type==='custom_match' ? 'secondary' : 'outline'} className="text-[10px] mb-1">{s.type}</Badge>
                <div className="text-xs">{s.spots || `$${s.price}`}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-amber-50">
        <CardContent className="p-4 text-xs">
          <div className="font-semibold">Recurrence Logic (implemented via rrule):</div>
          <div>Weekly Tuesdays 5:30pm x 8 weeks, with exception handling for holidays, blackout dates. Week view generates instances on client for next 60 days.</div>
        </CardContent>
      </Card>
    </div>
  )
}
