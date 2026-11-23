// Opens (or reopens) the checkout that confirms a held, offered, or invited booking.
import { formatDateTime } from '@/lib/time'
import { appUrl } from '../../config'
import { maybeOne, tx, type Db } from '../../db'
import { fail } from '../../errors'
import { createCheckoutPayment, openCheckout } from '../payments/core'
import { requireSession } from '../schedule/sessions'
import { requireBooking, type Booking } from './engine'
import { bookingUrl } from './links'

const MIN_CHECKOUT_MS = 31 * 60_000 // processors require at least ~30 minutes
const MAX_CHECKOUT_MS = 23 * 3_600_000

export async function bookingCheckoutUrl(db: Db, bookingId: string): Promise<string> {
  const booking: Booking = await requireBooking(db, bookingId)
  if (!['held', 'offered', 'invited'].includes(booking.status) || booking.paymentStatus !== 'due') {
    throw fail.conflict(booking.status === 'confirmed' ? 'This booking is already confirmed.' : 'This booking can no longer be paid.')
  }
  const session = await requireSession(db, booking.sessionId)
  let pending = await maybeOne<{ id: string }>(db, `SELECT id FROM payments WHERE booking_id = $1 AND status = 'pending' AND mode = 'checkout' ORDER BY created_at DESC LIMIT 1`, [booking.id])
  if (!pending) {
    // The previous checkout expired or was abandoned while the seat is still held: start a new one.
    const id = await tx((t) => createCheckoutPayment(t, {
      providerId: booking.providerId, payerUserId: booking.bookedByUserId, bookingId: booking.id,
      purpose: booking.paymentRule === 'pay_now' ? 'booking' : 'card_setup', amountCents: booking.paymentRule === 'pay_now' ? booking.priceCents : 0,
    }))
    pending = { id }
  }
  const deadline = (booking.holdExpiresAt ?? booking.offerExpiresAt ?? new Date()).getTime()
  const expiresAt = new Date(Math.min(Date.now() + MAX_CHECKOUT_MS, Math.max(Date.now() + MIN_CHECKOUT_MS, deadline)))
  return openCheckout(db, pending.id, {
    description: `${session.title} · ${formatDateTime(session.startsAt, session.timezone)}`,
    successUrl: `${bookingUrl(booking.id)}&paid=1`,
    cancelUrl: `${appUrl()}/s/${session.id}`,
    expiresAt,
  })
}
