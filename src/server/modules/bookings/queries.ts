// Booking read models: a player's bookings, a session roster, one booking's detail, and access rules.
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { bookingPayment } from '../payments/core'
import { SESSION_SELECT, getSession, type SessionView } from '../schedule/sessions'
import type { Actor } from '../users/accounts'
import { BOOKING_COLUMNS, cancellationTerms, requireBooking, type Booking, type CancellationTerms } from './engine'
import { verifyBookingToken } from './links'
import { OPEN_STATUSES } from './status'

export type BookingAccess = 'owner' | 'provider' | 'token'

/** Who may see/manage a booking: its booker, the player (or guardian), its provider, or a signed link. */
export async function bookingAccess(db: Db, actor: Actor | null, booking: Booking, token?: string | null): Promise<BookingAccess> {
  if (actor) {
    if (actor.providerId === booking.providerId) return 'provider'
    if (actor.userId === booking.bookedByUserId) return 'owner'
    const managed = booking.playerId && await maybeOne(db, `SELECT 1 FROM players WHERE id = $1 AND (user_id = $2 OR guardian_user_id = $2)`, [booking.playerId, actor.userId])
    if (managed) return 'owner'
  }
  if (verifyBookingToken(booking.id, token)) return 'token'
  throw fail.notFound('Booking')
}

export interface BookingDetail {
  booking: Booking
  session: SessionView
  playerName: string
  pendingPayment: boolean
  /** Refunded (or being refunded) from the booking's payment, e.g. after a late cancel. */
  refundedCents: number
  cancelTerms: CancellationTerms | null
  access: BookingAccess
}

export async function getBookingDetail(db: Db, actor: Actor | null, bookingId: string, token?: string | null): Promise<BookingDetail> {
  const booking = await requireBooking(db, bookingId)
  const access = await bookingAccess(db, actor, booking, token)
  const [session, pending, payment] = await Promise.all([
    getSession(db, booking.sessionId),
    maybeOne(db, `SELECT 1 FROM payments WHERE booking_id = $1 AND status = 'pending' AND mode = 'checkout'`, [booking.id]),
    bookingPayment(db, booking.id),
  ])
  const open = OPEN_STATUSES.includes(booking.status) && new Date(session!.startsAt).getTime() > Date.now()
  return {
    booking, session: session!, playerName: booking.playerName, pendingPayment: Boolean(pending), refundedCents: payment?.refundRequestedCents ?? 0, access,
    cancelTerms: open ? cancellationTerms(booking, session!, { byProvider: access === 'provider' }) : null,
  }
}

export interface MyBooking extends Booking { session: SessionView }

export async function listMyBookings(db: Db, userId: string, scope: 'upcoming' | 'past'): Promise<MyBooking[]> {
  const rows = await db.query<Booking>(
    `SELECT ${BOOKING_COLUMNS} FROM bookings b
     LEFT JOIN players p ON p.id = b.player_id JOIN sessions s ON s.id = b.session_id
     WHERE (b.booked_by_user_id = $1 OR p.user_id = $1 OR p.guardian_user_id = $1)
       AND ${scope === 'upcoming' ? `s.ends_at > now() AND b.status = ANY($2)` : `(s.ends_at <= now() OR NOT (b.status = ANY($2)))`}
     ORDER BY s.starts_at ${scope === 'upcoming' ? 'ASC' : 'DESC'} LIMIT 100`, [userId, OPEN_STATUSES])
  if (!rows.length) return []
  const sessions = await db.query<SessionView>(`${SESSION_SELECT} WHERE s.id = ANY($1)`, [[...new Set(rows.map((r) => r.sessionId))]])
  const byId = new Map(sessions.map((s) => [s.id, s]))
  return rows.map((r) => ({ ...r, session: byId.get(r.sessionId)! }))
}

export interface RosterEntry {
  bookingId: string
  playerId: string | null
  playerName: string
  junior: boolean
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  status: Booking['status']
  paymentRule: Booking['paymentRule']
  paymentStatus: Booking['paymentStatus']
  priceCents: number
  waitlistedAt: Date | null
}

export async function listRoster(db: Db, providerId: string, sessionId: string): Promise<RosterEntry[]> {
  return db.query<RosterEntry>(
    `SELECT b.id AS "bookingId", b.player_id AS "playerId", b.player_name AS "playerName", p.guardian_user_id IS NOT NULL AS junior,
       u.display_name AS "contactName", u.email AS "contactEmail", u.phone AS "contactPhone",
       b.status, b.payment_rule AS "paymentRule", b.payment_status AS "paymentStatus", b.price_cents AS "priceCents", b.waitlisted_at AS "waitlistedAt"
     FROM bookings b LEFT JOIN players p ON p.id = b.player_id JOIN users u ON u.id = b.booked_by_user_id
     WHERE b.session_id = $1 AND b.provider_id = $2 AND b.status NOT IN ('expired')
     ORDER BY CASE b.status WHEN 'confirmed' THEN 0 WHEN 'attended' THEN 0 WHEN 'held' THEN 1 WHEN 'invited' THEN 1 WHEN 'offered' THEN 1
       WHEN 'requested' THEN 2 WHEN 'waitlisted' THEN 3 ELSE 4 END, b.waitlisted_at NULLS FIRST, b.created_at`,
    [sessionId, providerId])
}
