// One row per session, used on the schedule, Today, and public pages.
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { KIND_LABELS, levelLabel, priceLabel, seatsLabel } from '@/lib/format'
import { formatDayHeading, formatSessionRange } from '@/lib/time'
import type { SessionView } from '@/server/modules/schedule/sessions'

export function SessionRow({ session, href, showPrice = true, aside }: {
  session: SessionView; href: string; showPrice?: boolean; aside?: React.ReactNode
}) {
  const level = levelLabel(session.levelSystem, session.levelMin, session.levelMax)
  const cancelled = session.status === 'cancelled'
  return (
    <Link href={href} className="flex items-start justify-between gap-3 rounded-xl border bg-white p-4 transition-colors hover:border-clay-500">
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{formatSessionRange(session.startsAt, session.endsAt, session.timezone)}</div>
        <div className={`font-semibold ${cancelled ? 'line-through' : ''}`}>{session.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{KIND_LABELS[session.kind]}</span>
          {level && <span>{level}</span>}
          {session.locationName && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{session.locationName}</span>}
          {showPrice && <span>{priceLabel(session.priceCents, session.paymentRule)}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {cancelled ? <Badge variant="error">Cancelled</Badge> : aside ?? (
          <Badge variant={session.seatsTaken >= session.capacity ? 'muted' : 'success'}>
            {seatsLabel(session.seatsTaken, session.capacity, session.waitlistCount)}
          </Badge>
        )}
      </div>
    </Link>
  )
}

/** Groups sessions under day headings in their own timezone. */
export function groupByDay<T extends { startsAt: Date | string; timezone: string }>(items: T[]): { day: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const day = formatDayHeading(item.startsAt, item.timezone)
    groups.set(day, [...(groups.get(day) ?? []), item])
  }
  return [...groups].map(([day, list]) => ({ day, items: list }))
}
