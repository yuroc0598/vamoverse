import Link from 'next/link'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { SessionDetails } from '@/components/session-details'
import { formatMoney } from '@/lib/format'
import { formatDateTime } from '@/lib/time'
import { orNotFound } from '@/server/auth/guards'
import { currentActor } from '@/server/auth/session'
import { runAs } from '@/server/commands/run'
import type { BookingDetail } from '@/server/modules/bookings/queries'
import { BookingActions } from './booking-actions'

function headline({ booking, session }: BookingDetail): { tone: 'good' | 'wait' | 'bad'; title: string; body?: string } {
  const until = (d: Date | null) => (d ? formatDateTime(d, session.timezone) : 'soon')
  switch (booking.status) {
    case 'confirmed': return { tone: 'good', title: `${booking.paymentStatus === 'due' && booking.paymentRule === 'pay_after' ? 'Booked; you’ll be charged after the session' : 'You’re booked'}` }
    case 'attended': return { tone: 'good', title: 'Session completed', body: booking.paymentStatus === 'failed' ? 'The payment didn’t go through. Update your card below.' : undefined }
    case 'held': return { tone: 'wait', title: booking.paymentRule === 'pay_now' ? 'Finish paying to confirm' : 'Save a card to confirm', body: `Your spot is held until ${until(booking.holdExpiresAt)}.` }
    case 'offered': return { tone: 'wait', title: 'A spot opened for you', body: `Claim it by ${until(booking.offerExpiresAt)}.` }
    case 'invited': return { tone: 'wait', title: `${session.providerName} added you`, body: `Confirm by ${until(booking.offerExpiresAt)}.` }
    case 'requested': return { tone: 'wait', title: 'Waiting for the coach to confirm', body: 'We’ll text and email you as soon as they do.' }
    case 'waitlisted': return { tone: 'wait', title: 'You’re on the waitlist', body: 'If a spot opens we’ll let you know right away. Nothing is charged until then.' }
    case 'no_show': return { tone: 'bad', title: 'Marked as a no-show' }
    case 'declined': return { tone: 'bad', title: 'Not booked', body: 'Check the coach’s page for other times.' }
    case 'expired': return { tone: 'bad', title: 'This hold expired', body: booking.paymentStatus === 'refunded' ? 'The spot was taken; you were refunded in full.' : 'Book again any time.' }
    default: return { tone: 'bad', title: 'Cancelled', body: booking.paymentStatus === 'refunded' ? 'Refunded.' : undefined }
  }
}

const ICON = { good: CheckCircle2, wait: Clock, bad: XCircle }
const TONE = { good: 'bg-green-50 text-green-900', wait: 'bg-amber-50 text-amber-900', bad: 'bg-gray-100 text-gray-800' }

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; paid?: string }> }) {
  const [{ id }, { t: token, paid }] = await Promise.all([params, searchParams])
  const actor = await currentActor()
  const detail = await orNotFound(runAs(actor)('bookings.get', { bookingId: id, token }))
  const h = headline(detail)
  const Icon = ICON[h.tone]
  const { booking, session } = detail
  return (
    <div className="space-y-6">
      {paid && booking.status !== 'confirmed' && h.tone === 'wait' && (
        <p className="rounded-xl bg-blue-50 p-4 text-sm">Payment received. Confirming your spot… refresh in a moment.</p>
      )}
      <section className={`flex items-start gap-3 rounded-2xl p-5 ${TONE[h.tone]}`}>
        <Icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
        <div>
          <h1 className="text-xl font-bold">{h.title}</h1>
          <p className="text-sm">{detail.playerName} · {session.title}{h.body ? ` · ${h.body}` : ''}</p>
        </div>
      </section>
      <section className="rounded-2xl border bg-white p-6">
        <Link href={`/p/${session.providerSlug}`} className="text-sm text-court-500 hover:underline">{session.providerName}</Link>
        <h2 className="mb-4 text-lg font-semibold">{session.title}</h2>
        <SessionDetails session={session} showSeats={false} />
        {booking.paymentStatus === 'paid' && (
          <p className="mt-4 text-sm text-muted-foreground">
            Paid {formatMoney(booking.priceCents)}{detail.refundedCents > 0 && `; ${formatMoney(detail.refundedCents)} refunded`}.
          </p>
        )}
        {booking.paymentStatus === 'credit' && <p className="mt-4 text-sm text-muted-foreground">Paid with a package credit.</p>}
      </section>
      <BookingActions bookingId={booking.id} token={token ?? null} status={booking.status} paymentRule={booking.paymentRule}
        cancelSummary={detail.cancelTerms?.summary ?? null} canCancel={Boolean(detail.cancelTerms) && detail.access !== 'provider'} />
      {!actor && <p className="text-center text-sm text-muted-foreground">Keep this link to manage your booking, or <Link className="underline" href={`/login?next=/today`}>sign in</Link> to see all your bookings.</p>}
    </div>
  )
}
