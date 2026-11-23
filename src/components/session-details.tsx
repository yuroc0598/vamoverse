// Everything a player needs to know about a session, shown on every session-facing page.
import { CalendarDays, DollarSign, MapPin, Users } from 'lucide-react'
import { KIND_LABELS, PAYMENT_RULE_LABELS, levelLabel, policyLabel, priceLabel, seatsLabel } from '@/lib/format'
import { formatSessionRange } from '@/lib/time'
import type { SessionView } from '@/server/modules/schedule/sessions'

export function SessionDetails({ session, showSeats = true }: { session: SessionView; showSeats?: boolean }) {
  const level = levelLabel(session.levelSystem, session.levelMin, session.levelMax)
  const mapsQuery = encodeURIComponent([session.locationName, session.locationAddress].filter(Boolean).join(', '))
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{formatSessionRange(session.startsAt, session.endsAt, session.timezone)}</p>
      {session.locationName && (
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <a className="underline" href={`https://maps.google.com/?q=${mapsQuery}`} target="_blank" rel="noreferrer">{session.locationName}</a>
            {session.locationAddress && <span className="block text-muted-foreground">{session.locationAddress}</span>}
            {session.locationNote && <span className="block text-muted-foreground">{session.locationNote}</span>}
            {session.courtStatus === 'booked' && <span className="block text-green-800">Court booked{session.courtConfirmation ? ` · #${session.courtConfirmation}` : ''}</span>}
            {session.courtStatus === 'walk_up' && <span className="block text-muted-foreground">First-come courts: arrive a few minutes early.</span>}
          </span>
        </p>
      )}
      <p className="flex items-start gap-2"><DollarSign className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{priceLabel(session.priceCents, session.paymentRule)}{session.paymentRule !== 'free' && <span className="block text-muted-foreground">{PAYMENT_RULE_LABELS[session.paymentRule]}{session.acceptsCredits ? ' · package credits accepted' : ''}</span>}</span>
      </p>
      <p className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{KIND_LABELS[session.kind]}{level ? ` · ${level}` : ''}{session.audience !== 'adults' ? ` · ${session.audience === 'juniors' ? 'Juniors' : 'Adults and juniors'}` : ''}
          {showSeats && <span className="block text-muted-foreground">{seatsLabel(session.seatsTaken, session.capacity, session.waitlistCount)}</span>}</span>
      </p>
      {session.note && <p className="rounded-lg bg-amber-50 p-3">{session.note}</p>}
      {session.description && <p className="whitespace-pre-line text-muted-foreground">{session.description}</p>}
      {session.paymentRule !== 'free' && <p className="text-xs text-muted-foreground">{policyLabel(session.cancelWindowHours, session.lateCancelFeePct, session.noShowFeePct)}</p>}
    </div>
  )
}
