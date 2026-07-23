"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DISCIPLINE_LABELS, EVENT_TYPE_LABELS } from "@/lib/types/enums"
import { Discipline } from "@/lib/types/enums"
import { MapPin, Clock, Users, DollarSign } from "lucide-react"
import { CompatibilityBadge } from "@/components/rating/CompatibilityBadge"
import { getCapacityForDiscipline } from "@/lib/utils/gender"
import Link from "next/link"

interface EventCardProps {
  event: any
  playerUTR?: number
}

function safeNumber(v: any, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatDateSafe(iso: string): string {
  try {
    if (!iso) return 'Invalid date'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return 'Invalid date'
    return d.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
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

function formatDuration(start_at: string, end_at: string): string {
  try {
    const s = new Date(start_at)
    const e = new Date(end_at)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '—'
    return `${Math.round((e.getTime() - s.getTime()) / 60000)}min`
  } catch {
    return '—'
  }
}

export function EventCard({ event, playerUTR }: EventCardProps) {
  const priceCents = safeNumber(event.price_cents, 0)
  const isPaid = priceCents > 0
  const discipline = event.discipline as Discipline
  const capacity = safeNumber(event.capacity, getCapacityForDiscipline(discipline, event.type || 'custom_match') || 4)
  const registeredCount = safeNumber(event.registered_count, 0)
  const spotsLeft = Math.max(0, capacity - registeredCount)
  const isDoubles = typeof discipline === 'string' && discipline.includes('doubles')
  const progressPct = capacity > 0 ? Math.min(100, Math.max(0, (registeredCount / capacity) * 100)) : 0

  return (
    <Link href={`/events/${event.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <Badge variant={isDoubles ? "secondary" : "default"} className="text-[10px]">
              {DISCIPLINE_LABELS[discipline] || discipline}
            </Badge>
            <div className="flex gap-1">
              {isPaid ? <Badge variant="outline" className="text-[10px]"><DollarSign className="w-3 h-3 mr-1" />${(priceCents/100).toFixed(0)}</Badge> : <Badge variant="success" className="text-[10px]">Free</Badge>}
            </div>
          </div>
          
          <div className="font-semibold text-sm mb-1 truncate">{event.title || 'Untitled Event'}</div>
          <div className="text-xs text-muted-foreground mb-2 truncate">{(EVENT_TYPE_LABELS as any)[event.type] || event.type || 'custom_match'} • {event.format?.replace(/_/g,' ') || '—'}</div>
          
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {formatDateSafe(event.start_at)} • {formatDuration(event.start_at, event.end_at)}</div>
            <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {event.location_name || 'Fremont Tennis Center'} • {(event.location_address?.slice(0,25)) || 'Fremont, CA'}</div>
            <div className="flex items-center gap-1.5"><Users className="w-3 h-3" /> {registeredCount}/{capacity} • {spotsLeft} left</div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {event.level_min_utr && <CompatibilityBadge playerUTR={playerUTR} minUTR={event.level_min_utr} maxUTR={event.level_max_utr} />}
            {event.scoring_system && <Badge variant="outline" className="text-[10px]">{event.scoring_system === 'no_ad' ? 'No-Ad' : 'Ad'}</Badge>}
            {isDoubles && <Badge variant="outline" className="text-[10px]">4 players • Gender: {discipline.includes('mixed') ? '2M/2F enforced' : discipline.includes('mens') ? '4M' : discipline.includes('womens') ? '4F' : 'Open'}</Badge>}
          </div>

          <div className="mt-3">
            <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-clay-500 h-1.5 rounded-full" style={{width: `${isNaN(progressPct) ? 0 : progressPct}%`}} /></div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
