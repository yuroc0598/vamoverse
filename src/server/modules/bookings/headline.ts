// What a booking's page says at the top, by status. Returned by `bookings.get` so the web booking
// page and the native app show the same words (times in the session's time zone).
import { formatDateTime } from '@/lib/time'
import type { Booking } from './engine'
import type { SessionView } from '../schedule/sessions'

export interface BookingHeadline {
  /** good = booked/done, wait = needs something or someone, bad = not happening. */
  tone: 'good' | 'wait' | 'bad'
  title: string
  body: string | null
}

export function bookingHeadline(booking: Booking, session: SessionView): BookingHeadline {
  const until = (d: Date | string | null) => (d ? formatDateTime(d, session.timezone) : 'soon')
  const good = (title: string, body: string | null = null): BookingHeadline => ({ tone: 'good', title, body })
  const wait = (title: string, body: string | null = null): BookingHeadline => ({ tone: 'wait', title, body })
  const bad = (title: string, body: string | null = null): BookingHeadline => ({ tone: 'bad', title, body })
  switch (booking.status) {
    case 'confirmed': return good(booking.paymentStatus === 'due' && booking.paymentRule === 'pay_after' ? 'Booked; you’ll be charged after the session' : 'You’re booked')
    case 'attended': return good('Session completed', booking.paymentStatus === 'failed' ? 'The payment didn’t go through. Update your card below.' : null)
    case 'held': return wait(booking.paymentRule === 'pay_now' ? 'Finish paying to confirm' : 'Save a card to confirm', `Your spot is held until ${until(booking.holdExpiresAt)}.`)
    case 'offered': return wait('A spot opened for you', `Claim it by ${until(booking.offerExpiresAt)}.`)
    case 'invited': return wait(`${session.providerName} added you`, `Confirm by ${until(booking.offerExpiresAt)}.`)
    case 'requested': return wait('Waiting for the coach to confirm', 'We’ll text and email you as soon as they do.')
    case 'waitlisted': return wait('You’re on the waitlist', 'If a spot opens we’ll let you know right away. Nothing is charged until then.')
    case 'no_show': return bad('Marked as a no-show')
    case 'declined': return bad('Not booked', 'Check the coach’s page for other times.')
    case 'expired': return bad('This hold expired', booking.paymentStatus === 'refunded' ? 'The spot was taken; you were refunded in full.' : 'Book again any time.')
    default: return bad('Cancelled', booking.paymentStatus === 'refunded' ? 'Refunded.' : null)
  }
}
