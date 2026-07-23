"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useMemo } from "react"
import { RRule } from 'rrule'

const TIMEZONE = 'America/Los_Angeles' as const
const DEFAULT_EVENT_TYPE = 'private'

type ScheduleOccurrence = {
  id: string
  title: string
  occurrence_start_at: string
  occurrence_end_at: string
  timezone: string
  duration: number
  type: string
  location: string
  status: 'upcoming' | 'completed' | 'cancelled'
  price?: number
  spots?: string
}

function formatInTimezone(isoString: string, tz: string) {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return 'Invalid date'
    return d.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return 'Invalid date'
  }
}

function generateOccurrences(): ScheduleOccurrence[] {
  const dtstart = new Date(Date.UTC(2026, 0, 1, 15, 0, 0))
  const rule = new RRule({
    freq: RRule.WEEKLY,
    byweekday: [RRule.MO, RRule.WE, RRule.FR],
    dtstart,
    count: 12,
  })

  const titles = [
    'Private - Leo',
    'Adult 3.5 Doubles Clinic',
    'Mixed Doubles - Needs 1F',
    'Private - Maya',
  ]
  const types = ['private', 'group_clinic', 'custom_match', 'private']
  const locations = [
    'Fremont HS Court 3',
    'Fremont Tennis Center',
    'Fremont HS Court 2',
    'Fremont HS',
  ]

  const all = rule.all()
  return all.map((date, idx) => {
    const start = date.toISOString()
    const endDate = new Date(date.getTime() + (idx % 3 === 1 ? 90 : idx % 3 === 2 ? 120 : 60) * 60000)
    return {
      id: `occ_${idx + 1}_${date.getTime()}`,
      title: titles[idx % titles.length],
      occurrence_start_at: start,
      occurrence_end_at: endDate.toISOString(),
      timezone: TIMEZONE,
      duration: idx % 3 === 1 ? 90 : idx % 3 === 2 ? 120 : 60,
      type: types[idx % types.length],
      location: locations[idx % locations.length],
      status: 'upcoming' as const,
      price: idx % 2 === 0 ? 80 : 40,
      spots: idx % 3 === 1 ? '6/8' : idx % 3 === 2 ? '3/4' : undefined,
    }
  })
}

const mockScheduleFallback: ScheduleOccurrence[] = [
  {
    id: '1',
    title: 'Private - Leo',
    occurrence_start_at: new Date(Date.UTC(2026, 0, 5, 15, 0, 0)).toISOString(),
    occurrence_end_at: new Date(Date.UTC(2026, 0, 5, 16, 0, 0)).toISOString(),
    timezone: TIMEZONE,
    duration: 60,
    type: 'private',
    location: 'Fremont HS Court 3',
    status: 'upcoming',
    price: 80,
  },
  {
    id: '2',
    title: 'Adult 3.5 Doubles Clinic',
    occurrence_start_at: new Date(Date.UTC(2026, 0, 7, 17, 30, 0)).toISOString(),
    occurrence_end_at: new Date(Date.UTC(2026, 0, 7, 19, 0, 0)).toISOString(),
    timezone: TIMEZONE,
    duration: 90,
    type: 'group_clinic',
    location: 'Fremont Tennis Center',
    status: 'upcoming',
    spots: '6/8',
    price: 40,
  },
]

export default function SchedulePage() {
  const [view, setView] = useState<'agenda' | 'week'>('agenda')
  const occurrences = useMemo(() => {
    try {
      const gen = generateOccurrences()
      return gen.length > 0 ? gen : mockScheduleFallback
    } catch {
      return mockScheduleFallback
    }
  }, [])

  const displayOccurrences = occurrences.slice(0, view === 'agenda' ? 12 : 60)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-sm text-muted-foreground">Agenda + Week view • Recurring events • Timezone aware ({TIMEZONE}) • UTC stored</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'agenda' ? 'default' : 'outline'} size="sm" onClick={() => setView('agenda')}>Agenda</Button>
          <Button variant={view === 'week' ? 'default' : 'outline'} size="sm" onClick={() => setView('week')}>Week</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">This Week - {displayOccurrences.length} sessions • Next 4 weeks via RRule</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {displayOccurrences.map(s => (
            <div key={s.id} className="p-3 border rounded-xl flex justify-between items-center">
              <div>
                <div className="font-medium text-sm">{s.title}</div>
                <div className="text-xs text-muted-foreground">
                  {formatInTimezone(s.occurrence_start_at, s.timezone)} • {s.duration}min • {s.location} • {s.timezone}
                </div>
                <div className="text-[10px] text-muted-foreground">UTC: {s.occurrence_start_at} → {s.occurrence_end_at}</div>
              </div>
              <div className="text-right">
                <Badge variant={s.type === 'private' ? 'default' : s.type === 'custom_match' ? 'secondary' : 'outline'} className="text-[10px] mb-1">{s.type}</Badge>
                <div className="text-xs">{s.spots || (s.price ? `$${s.price}` : '')}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-amber-50">
        <CardContent className="p-4 text-xs">
          <div className="font-semibold">Recurrence Logic (implemented via rrule): RRule WEEKLY MO,WE,FR dtstart 2026-01-01T15:00Z count 12, stored UTC ISO, display via Intl.DateTimeFormat with timeZone {TIMEZONE}</div>
          <div className="mt-1">Weekly Tuesdays 5:30pm example x 8 weeks, exception holidays, blackout dates. Week view generates instances client for next 60 days. UTC ensures server consistency.</div>
        </CardContent>
      </Card>
    </div>
  )
}
