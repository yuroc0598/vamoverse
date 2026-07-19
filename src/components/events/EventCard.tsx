"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DISCIPLINE_LABELS, EVENT_TYPE_LABELS } from "@/lib/types/enums"
import { Discipline } from "@/lib/types/enums"
import { MapPin, Clock, Users, DollarSign } from "lucide-react"
import { CompatibilityBadge } from "@/components/rating/CompatibilityBadge"
import Link from "next/link"

interface EventCardProps {
  event: any
  playerUTR?: number
}

export function EventCard({ event, playerUTR }: EventCardProps) {
  const isPaid = event.is_paid || event.price_cents > 0
  const discipline = event.discipline as Discipline
  const spotsLeft = event.capacity - (event.registered_count || 0)
  const isDoubles = discipline.includes('doubles')

  return (
    <Link href={`/events/${event.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <Badge variant={isDoubles ? "secondary" : "default"} className="text-[10px]">
              {DISCIPLINE_LABELS[discipline] || discipline}
            </Badge>
            <div className="flex gap-1">
              {isPaid ? <Badge variant="outline" className="text-[10px]"><DollarSign className="w-3 h-3 mr-1" />${(event.price_cents/100).toFixed(0)}</Badge> : <Badge variant="success" className="text-[10px]">Free</Badge>}
            </div>
          </div>
          
          <div className="font-semibold text-sm mb-1 truncate">{event.title}</div>
          <div className="text-xs text-muted-foreground mb-2 truncate">{EVENT_TYPE_LABELS[event.type] || event.type} • {event.format?.replace(/_/g,' ')}</div>
          
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {new Date(event.start_at).toLocaleString()} • {Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime())/60000)}min</div>
            <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {event.location_name || 'Fremont Tennis Center'} • {event.location_address?.slice(0,25) || 'Fremont, CA'}</div>
            <div className="flex items-center gap-1.5"><Users className="w-3 h-3" /> {event.registered_count || 0}/{event.capacity} • {spotsLeft} left</div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {event.level_min_utr && <CompatibilityBadge playerUTR={playerUTR} minUTR={event.level_min_utr} maxUTR={event.level_max_utr} />}
            {event.scoring_system && <Badge variant="outline" className="text-[10px]">{event.scoring_system === 'no_ad' ? 'No-Ad' : 'Ad'}</Badge>}
            {isDoubles && <Badge variant="outline" className="text-[10px]">4 players • Gender: {discipline.includes('mixed') ? '2M/2F enforced' : discipline.includes('mens') ? '4M' : '4F'}</Badge>}
          </div>

          <div className="mt-3">
            <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-clay-500 h-1.5 rounded-full" style={{width: `${((event.registered_count||0)/event.capacity)*100}%`}} /></div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
