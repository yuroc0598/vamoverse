// The booking engine. Every seat change runs inside a transaction holding a row lock on
// the session (no overbooking), then offers freed seats to the waitlist in the same
// transaction. Money side effects are recorded here and executed after commit (Effects).
import { formatMoney, KIND_LABELS } from '@/lib/format'
import { formatDateTime } from '@/lib/time'
import { maybeOne, tx, type Db } from '../../db'
import { fail } from '../../errors'
import { newId } from '../../ids'
import { enqueue } from '../notifications/outbox'
import { lockUsableCredit, returnCredit, spendCredit } from '../packages/packages'
import { bookingPayment, createCheckoutPayment, createOffSessionPayment, defaultPaymentMethod, requestRefund, type Payment } from '../payments/core'
import { requireSession, type SessionView } from '../schedule/sessions'
import { assertJuniorBookable } from '../users/guardians'
import { getPlayer, type Player } from '../users/players'
import { checkEligibility } from './eligibility'
import { bookingPath } from './links'
import { OPEN_STATUSES, SEAT_SQL, SEAT_STATUSES, type BookingStatus } from './status'

export type PaymentStatus = 'none' | 'due' | 'paid' | 'paid_external' | 'credit' | 'refunded' | 'waived' | 'failed'

export interface Booking {
  id: string
  sessionId: string
  offeringId: string
  providerId: string
  playerId: string
  bookedByUserId: string
  status: BookingStatus
  paymentRule: SessionView['paymentRule']
  priceCents: number
  paymentStatus: PaymentStatus
  packagePurchaseId: string | null
  holdExpiresAt: Date | null
  offerExpiresAt: Date | null
  waitlistedAt: Date | null
  createdAt: Date
}

export const BOOKING_COLUMNS = `b.id, b.session_id AS "sessionId", b.offering_id AS "offeringId", b.provider_id AS "providerId",
  b.player_id AS "playerId", b.booked_by_user_id AS "bookedByUserId", b.status, b.payment_rule AS "paymentRule",
  b.price_cents AS "priceCents", b.payment_status AS "paymentStatus", b.package_purchase_id AS "packagePurchaseId",
  b.hold_expires_at AS "holdExpiresAt", b.offer_expires_at AS "offerExpiresAt", b.waitlisted_at AS "waitlistedAt", b.created_at AS "createdAt"`

/** Processor work to run after the transaction commits (see settlement.runEffects). */
export interface Effects { refunds: string[]; charges: string[] }
const noEffects = (): Effects => ({ refunds: [], charges: [] })
const addEffects = (into: Effects, more: Effects) => { into.refunds.push(...more.refunds); into.charges.push(...more.charges); return into }

const HOLD_MS = 30 * 60_000
const OFFER_MS = 12 * 3_600_000

async function getBooking(db: Db, bookingId: string, opts: { forUpdate?: boolean } = {}): Promise<Booking | null> {
  return maybeOne<Booking>(db, `SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.id = $1${opts.forUpdate ? ' FOR UPDATE' : ''}`, [bookingId])
}

export async function requireBooking(db: Db, bookingId: string, opts: { forUpdate?: boolean } = {}): Promise<Booking> {
  const booking = await getBooking(db, bookingId, opts)
  if (!booking) throw fail.notFound('Booking')
  return booking
}

/** Locks the session row for the rest of the transaction and returns its current view. */
export async function lockSession(t: Db, sessionId: string): Promise<SessionView> {
  await t.query(`SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE`, [sessionId])
  return requireSession(t, sessionId)
}

/**
 * Locks a booking for a change: first its session (every seat change serializes there), then
 * the booking row. With `providerId`, the booking must belong to that provider.
 */
async function lockBooking(t: Db, bookingId: string, providerId?: string): Promise<{ session: SessionView; booking: Booking }> {
  const current = await requireBooking(t, bookingId)
  if (providerId && current.providerId !== providerId) throw fail.notFound('Booking')
  const session = await lockSession(t, current.sessionId)
  return { session, booking: await requireBooking(t, bookingId, { forUpdate: true }) }
}

/** Row-locks a provider's booking for a change that doesn't move seats. */
async function lockOwnBooking(t: Db, providerId: string, bookingId: string): Promise<Booking> {
  const booking = await requireBooking(t, bookingId, { forUpdate: true })
  if (booking.providerId !== providerId) throw fail.notFound('Booking')
  return booking
}

async function closeBooking(t: Db, bookingId: string, status: BookingStatus, paymentStatus: PaymentStatus): Promise<void> {
  await t.query(`UPDATE bookings SET status = $2, payment_status = $3, cancelled_at = now(), hold_expires_at = NULL, offer_expires_at = NULL, updated_at = now() WHERE id = $1`,
    [bookingId, status, paymentStatus])
}

async function seatGenders(t: Db, sessionId: string): Promise<(string | null)[]> {
  const rows = await t.query<{ gender: string | null }>(
    `SELECT p.gender FROM bookings b JOIN players p ON p.id = b.player_id WHERE b.session_id = $1 AND b.status IN ${SEAT_SQL}`, [sessionId])
  return rows.map((r) => r.gender)
}

function when(session: SessionView): string {
  return formatDateTime(session.startsAt, session.timezone)
}

async function notifyBooker(t: Db, booking: Pick<Booking, 'id' | 'bookedByUserId'>, kind: string, title: string, body: string, dedupe?: string) {
  await enqueue(t, { userId: booking.bookedByUserId, kind, title, body, link: bookingPath(booking.id), dedupeKey: dedupe ?? null })
}

async function notifyProvider(t: Db, session: SessionView, kind: string, title: string, body: string, dedupe?: string) {
  await enqueue(t, { userId: session.providerUserId, kind, title, body, link: `/sessions/${session.id}`, dedupeKey: dedupe ?? null })
}

function offerExpiry(session: SessionView, now = Date.now()): Date {
  const latest = new Date(session.startsAt).getTime() - 3_600_000
  return new Date(Math.max(now + HOLD_MS, Math.min(now + OFFER_MS, latest)))
}

/** A coach's invite stays open until shortly before the session (weekly invites go out weeks ahead). */
function inviteExpiry(session: SessionView, now = Date.now()): Date {
  return new Date(Math.max(now + HOLD_MS, new Date(session.startsAt).getTime() - 2 * 3_600_000))
}

interface Allocation {
  status: BookingStatus
  paymentStatus: PaymentStatus
  packagePurchaseId: string | null
  expiresAt: Date | null
  checkout: 'booking' | 'card_setup' | null
}

/** How a seat is taken given the session's payment rule, the payer's credits, and saved card. */
async function decideAllocation(t: Db, session: SessionView, payerUserId: string, useCredit: boolean, holdStatus: 'held' | 'offered' | 'invited'): Promise<Allocation> {
  const confirmed = (paymentStatus: PaymentStatus, packagePurchaseId: string | null = null): Allocation =>
    ({ status: 'confirmed', paymentStatus, packagePurchaseId, expiresAt: null, checkout: null })
  if (session.paymentRule === 'free') return confirmed('none')
  if (session.paymentRule === 'external') return confirmed('due')
  if (session.acceptsCredits && useCredit) {
    const credit = await lockUsableCredit(t, payerUserId, session.providerId, session.kind)
    if (credit) {
      await spendCredit(t, credit)
      return confirmed('credit', credit)
    }
  }
  const expiresAt = holdStatus === 'held' ? new Date(Date.now() + HOLD_MS) : offerExpiry(session)
  if (session.paymentRule === 'pay_after' && (await defaultPaymentMethod(t, payerUserId))) return confirmed('due')
  return { status: holdStatus, paymentStatus: 'due', packagePurchaseId: null, expiresAt, checkout: session.paymentRule === 'pay_now' ? 'booking' : 'card_setup' }
}

/** Writes an allocation onto a booking row (new or existing). Returns the checkout payment to open, if any. */
async function applyAllocation(t: Db, bookingId: string, session: SessionView, bookedByUserId: string, a: Allocation): Promise<string | null> {
  await t.query(
    `UPDATE bookings SET status = $2, payment_status = $3, package_purchase_id = $4,
       hold_expires_at = CASE WHEN $2 = 'held' THEN $5::timestamptz END,
       offer_expires_at = CASE WHEN $2 IN ('offered','invited') THEN $5::timestamptz END, updated_at = now()
     WHERE id = $1`, [bookingId, a.status, a.paymentStatus, a.packagePurchaseId, a.expiresAt])
  if (!a.checkout) return null
  return createCheckoutPayment(t, {
    providerId: session.providerId, payerUserId: bookedByUserId, purpose: a.checkout,
    amountCents: a.checkout === 'booking' ? session.priceCents : 0, bookingId,
  })
}

async function addClient(t: Db, providerId: string, playerId: string, source: 'booking' | 'manual') {
  await t.query(`INSERT INTO clients (provider_id, player_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [providerId, playerId, source])
}

function outcomeMessage(status: BookingStatus, session: SessionView, checkout: string | null): string {
  switch (status) {
    case 'confirmed': return `You’re booked for ${session.title}.`
    case 'waitlisted': return 'The session is full, so you’re on the waitlist. We’ll let you know the moment a spot opens.'
    case 'requested': return `Request sent. ${session.providerName} will confirm your spot.`
    case 'invited': return 'Added. The player will be asked to confirm.'
    default: return checkout === null ? 'Saved.' : session.paymentRule === 'pay_now' ? 'Complete payment to confirm your spot.' : 'Save a card to confirm. You’ll be charged after the session.'
  }
}

export interface PlaceResult { booking: Booking; paymentId: string | null; message: string }

/**
 * Books `player` into the (already locked) session. Idempotent per player and session.
 * `byProvider`: the coach is adding the player, so level approval is skipped and payment becomes an invite.
 */
export async function placeBooking(t: Db, input: {
  session: SessionView; player: Player; bookedByUserId: string; useCredit: boolean; byProvider?: boolean
}): Promise<PlaceResult> {
  const { session, player, bookedByUserId } = input
  const existing = await maybeOne<Booking>(t,
    `SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.session_id = $1 AND b.player_id = $2 AND b.status = ANY($3)`,
    [session.id, player.id, OPEN_STATUSES])
  if (existing) {
    const pending = await maybeOne<{ id: string }>(t, `SELECT id FROM payments WHERE booking_id = $1 AND status = 'pending' AND mode = 'checkout'`, [existing.id])
    return { booking: existing, paymentId: pending?.id ?? null, message: outcomeMessage(existing.status, session, pending?.id ?? null) }
  }
  if (session.status !== 'scheduled') throw fail.conflict('This session was cancelled.')
  if (new Date(session.startsAt).getTime() <= Date.now()) throw fail.conflict('This session has already started.')
  await assertJuniorBookable(t, player)

  const genders = await seatGenders(t, session.id)
  const eligibility = checkEligibility(session, player, genders.filter((g) => g === player.gender).length)
  if (!eligibility.ok) throw fail.forbidden(eligibility.reason)

  const id = newId('bkg')
  await t.query(
    `INSERT INTO bookings (id, session_id, offering_id, provider_id, player_id, booked_by_user_id, status, payment_rule, price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, 'requested', $7, $8)`,
    [id, session.id, session.offeringId, session.providerId, player.id, bookedByUserId, session.paymentRule, session.priceCents])
  await addClient(t, session.providerId, player.id, input.byProvider ? 'manual' : 'booking')

  let paymentId: string | null = null
  if (eligibility.needsApproval && !input.byProvider) {
    await notifyProvider(t, session, 'booking.requested', `${player.displayName} asked to join`, `${session.title}, ${when(session)}. ${eligibility.reason}`)
  } else if (genders.length >= session.capacity) {
    if (input.byProvider) throw fail.conflict('This session is full. Raise its capacity first.')
    await t.query(`UPDATE bookings SET status = 'waitlisted', waitlisted_at = clock_timestamp() WHERE id = $1`, [id])
  } else {
    if (session.capacity === 1) {
      // Overlapping one-on-one slots are different session rows: serialize per provider.
      await t.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [session.providerId])
      const clash = await maybeOne(t,
        `SELECT 1 FROM sessions s JOIN bookings b ON b.session_id = s.id AND b.status IN ${SEAT_SQL}
         WHERE s.provider_id = $1 AND s.id <> $2 AND s.status = 'scheduled' AND s.starts_at < $4 AND s.ends_at > $3`,
        [session.providerId, session.id, session.startsAt, session.endsAt])
      if (clash) throw fail.conflict('That time was just taken. Pick another slot.')
    }
    // A coach adding someone never spends that person's credits or card: money waits for the player's yes.
    const needsConsent = input.byProvider && (session.paymentRule === 'pay_now' || session.paymentRule === 'pay_after')
    const allocation: Allocation = needsConsent
      ? { status: 'invited', paymentStatus: 'due', packagePurchaseId: null, expiresAt: inviteExpiry(session), checkout: null }
      : await decideAllocation(t, session, bookedByUserId, input.useCredit, 'held')
    paymentId = await applyAllocation(t, id, session, bookedByUserId, allocation)
    if (allocation.status === 'confirmed') {
      const by = input.byProvider ? `${session.providerName} booked ${player.displayName}` : `You’re booked`
      await notifyBooker(t, { id, bookedByUserId }, 'booking.confirmed', `${by}: ${session.title}`, `${when(session)}${session.locationName ? ` at ${session.locationName}` : ''}.`)
      if (!input.byProvider) await notifyProvider(t, session, 'booking.new', `${player.displayName} booked`, `${session.title}, ${when(session)}.`)
    } else if (allocation.status === 'invited') {
      await notifyBooker(t, { id, bookedByUserId }, 'booking.invited', `${session.providerName} added ${player.displayName} to ${session.title}`,
        `${when(session)}, ${formatMoney(session.priceCents)}${session.paymentRule === 'pay_after' ? ' after the session' : ''}. Confirm to keep your spot.`)
    }
  }
  const booking = (await getBooking(t, id))!
  return { booking, paymentId, message: outcomeMessage(booking.status, session, paymentId) }
}

/** Offers freed seats to the waitlist, first come first served, skipping players who no longer fit. */
export async function promoteWaitlist(t: Db, session: SessionView): Promise<void> {
  if (session.status !== 'scheduled' || new Date(session.startsAt).getTime() <= Date.now()) return
  const waiting = await t.query<Booking>(
    `SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.session_id = $1 AND b.status = 'waitlisted' ORDER BY b.waitlisted_at, b.created_at FOR UPDATE`, [session.id])
  for (const candidate of waiting) {
    const genders = await seatGenders(t, session.id)
    if (genders.length >= session.capacity) return
    const player = (await getPlayer(t, candidate.playerId))!
    if (!checkEligibility(session, player, genders.filter((g) => g === player.gender).length).ok) continue
    const allocation = await decideAllocation(t, session, candidate.bookedByUserId, true, 'offered')
    await applyAllocation(t, candidate.id, session, candidate.bookedByUserId, allocation)
    if (allocation.status === 'confirmed') {
      await notifyBooker(t, candidate, 'waitlist.confirmed', `A spot opened: you’re in ${session.title}`, `${when(session)}.`)
    } else {
      await notifyBooker(t, candidate, 'waitlist.offered', `A spot opened in ${session.title}`,
        `${when(session)}. Claim it by ${formatDateTime(allocation.expiresAt!, session.timezone)}.`)
    }
  }
}

export interface CancellationTerms {
  late: boolean
  newStatus: 'cancelled' | 'late_cancelled'
  refundCents: number
  returnCredit: boolean
  feeCents: number
  summary: string
}

const pct = (cents: number, percent: number) => Math.round((cents * percent) / 100)

/** What cancelling costs. Used for the preview shown to players and by the cancellation itself. */
export function cancellationTerms(booking: Booking, session: SessionView, opts: { byProvider: boolean; waiveFee?: boolean }, now = Date.now()): CancellationTerms {
  const late = !opts.byProvider && booking.status === 'confirmed'
    && new Date(session.startsAt).getTime() - now < session.cancelWindowHours * 3_600_000
  const feePct = late && !opts.waiveFee ? session.lateCancelFeePct : 0
  const fee = pct(booking.priceCents, feePct)
  const base = { late, newStatus: late ? 'late_cancelled' as const : 'cancelled' as const }
  switch (booking.paymentStatus) {
    case 'paid':
      return { ...base, refundCents: booking.priceCents - fee, returnCredit: false, feeCents: 0,
        summary: fee ? `Late cancellation: ${formatMoney(booking.priceCents - fee)} back (${feePct}% fee).` : `Full refund of ${formatMoney(booking.priceCents)}.` }
    case 'credit':
      return { ...base, refundCents: 0, returnCredit: feePct === 0, feeCents: 0,
        summary: feePct ? 'Late cancellation: the package credit is used.' : 'Your package credit is returned.' }
    case 'due':
      return { ...base, refundCents: 0, returnCredit: false, feeCents: booking.paymentRule === 'pay_after' ? fee : 0,
        summary: fee ? (booking.paymentRule === 'pay_after' ? `Late cancellation fee: ${formatMoney(fee)}.` : `Late cancellation: ${session.providerName} may ask for ${formatMoney(fee)}.`) : 'No charge.' }
    default:
      return { ...base, refundCents: 0, returnCredit: false, feeCents: 0, summary: 'No charge.' }
  }
}

async function cancelPendingCheckouts(t: Db, bookingId: string) {
  await t.query(`UPDATE payments SET status = 'canceled', updated_at = now() WHERE booking_id = $1 AND status = 'pending' AND mode = 'checkout'`, [bookingId])
}

/** Applies money consequences of ending a booking. */
async function settleEnd(t: Db, booking: Booking, terms: Pick<CancellationTerms, 'refundCents' | 'returnCredit' | 'feeCents'>, feePurpose: 'late_cancel_fee' | 'no_show_fee'): Promise<{ effects: Effects; paymentStatus: PaymentStatus }> {
  const effects = noEffects()
  let paymentStatus = booking.paymentStatus
  if (booking.paymentStatus === 'paid' && terms.refundCents > 0) {
    const payment = await bookingPayment(t, booking.id)
    if (payment) {
      await requestRefund(t, payment.id, terms.refundCents)
      effects.refunds.push(payment.id)
    }
    if (terms.refundCents >= booking.priceCents) paymentStatus = 'refunded'
  }
  if (booking.paymentStatus === 'credit' && booking.packagePurchaseId && terms.returnCredit) {
    await returnCredit(t, booking.packagePurchaseId)
    paymentStatus = 'refunded'
  }
  if (booking.paymentStatus === 'due') {
    paymentStatus = 'none'
    if (terms.feeCents > 0) {
      const charge = await createOffSessionPayment(t, { providerId: booking.providerId, payerUserId: booking.bookedByUserId, purpose: feePurpose, amountCents: terms.feeCents, bookingId: booking.id })
      if (charge) effects.charges.push(charge)
      paymentStatus = charge ? 'due' : 'failed'
    }
  }
  await cancelPendingCheckouts(t, booking.id)
  return { effects, paymentStatus }
}

/** Cancels one booking (by the player/guardian, or by the provider removing them). */
export async function cancelBooking(t: Db, bookingId: string, opts: { byProvider: boolean; waiveFee?: boolean }): Promise<{ booking: Booking; terms: CancellationTerms; effects: Effects }> {
  const { session, booking } = await lockBooking(t, bookingId)
  if (!OPEN_STATUSES.includes(booking.status)) throw fail.conflict('This booking is already closed.')
  if (!opts.byProvider && new Date(session.startsAt).getTime() <= Date.now()) throw fail.conflict('This session has started; ask the coach to update it.')
  const terms = cancellationTerms(booking, session, opts)
  const { effects, paymentStatus } = await settleEnd(t, booking, terms, 'late_cancel_fee')
  await closeBooking(t, booking.id, terms.newStatus, paymentStatus)
  const player = (await getPlayer(t, booking.playerId))!
  if (opts.byProvider) {
    await notifyBooker(t, booking, 'booking.removed', `${session.providerName} removed ${player.displayName} from ${session.title}`, `${when(session)}. ${terms.summary}`)
  } else {
    await notifyBooker(t, booking, 'booking.cancelled', `Cancelled: ${session.title}`, `${when(session)}. ${terms.summary}`)
    await notifyProvider(t, session, 'booking.cancelled', `${player.displayName} cancelled`, `${session.title}, ${when(session)}.${terms.late ? ' Late cancellation.' : ''}`)
  }
  if (SEAT_STATUSES.includes(booking.status)) await promoteWaitlist(t, session)
  return { booking: (await getBooking(t, booking.id))!, terms, effects }
}

/** Provider cancels a whole session (rain-out, illness): everyone refunded or credited, everyone told. */
export async function cancelSession(t: Db, providerId: string, sessionId: string, reason: string | null): Promise<{ notified: number; effects: Effects }> {
  const session = await lockSession(t, sessionId)
  if (session.providerId !== providerId) throw fail.notFound('Session')
  if (session.status !== 'scheduled') throw fail.conflict('This session is not scheduled.')
  const effects = noEffects()
  const open = await t.query<Booking>(`SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.session_id = $1 AND b.status = ANY($2) FOR UPDATE`, [sessionId, OPEN_STATUSES])
  for (const booking of open) {
    const settled = await settleEnd(t, booking, { refundCents: booking.priceCents, returnCredit: true, feeCents: 0 }, 'late_cancel_fee')
    addEffects(effects, settled.effects)
    await closeBooking(t, booking.id, 'cancelled', settled.paymentStatus)
    const money = booking.paymentStatus === 'paid' ? ' You’ll get a full refund.' : booking.paymentStatus === 'credit' ? ' Your package credit is returned.' : ''
    await notifyBooker(t, booking, 'session.cancelled', `Cancelled: ${session.title}, ${when(session)}`, `${reason ? `${reason}. ` : ''}${session.providerName} cancelled this session.${money}`, `session.cancelled:${booking.id}`)
  }
  await t.query(`UPDATE sessions SET status = 'cancelled', cancel_reason = $2, updated_at = now() WHERE id = $1`, [sessionId, reason])
  return { notified: open.length, effects }
}

/** Tells everyone booked that the session moved (called after sessions.update moves a session). */
export async function notifySessionMoved(t: Db, session: SessionView): Promise<number> {
  const open = await t.query<Booking>(`SELECT ${BOOKING_COLUMNS} FROM bookings b WHERE b.session_id = $1 AND b.status = ANY($2)`, [session.id, OPEN_STATUSES])
  for (const booking of open) {
    await notifyBooker(t, booking, 'session.moved', `${session.title} moved`, `Now ${when(session)}${session.locationName ? ` at ${session.locationName}` : ''}. Can’t make it? Cancel free from your booking.`)
  }
  return open.length
}

/** Coach approves a level-check request: the player gets a seat (or the waitlist). */
export async function approveRequest(t: Db, providerId: string, bookingId: string): Promise<Booking> {
  const { session, booking } = await lockBooking(t, bookingId, providerId)
  if (booking.status !== 'requested') throw fail.conflict('This request was already handled.')
  if ((await seatGenders(t, session.id)).length >= session.capacity) {
    await t.query(`UPDATE bookings SET status = 'waitlisted', waitlisted_at = clock_timestamp(), updated_at = now() WHERE id = $1`, [booking.id])
    await notifyBooker(t, booking, 'booking.approved', `Approved for ${session.title}`, `${when(session)}. It’s full right now, so you’re first in line on the waitlist.`)
  } else {
    const allocation = await decideAllocation(t, session, booking.bookedByUserId, true, 'offered')
    await applyAllocation(t, booking.id, session, booking.bookedByUserId, allocation)
    await notifyBooker(t, booking, 'booking.approved', `Approved for ${session.title}`,
      allocation.status === 'confirmed' ? `${when(session)}. You’re booked.` : `${when(session)}. Confirm by ${formatDateTime(allocation.expiresAt!, session.timezone)}.`)
  }
  return (await getBooking(t, booking.id))!
}

export async function declineRequest(t: Db, providerId: string, bookingId: string): Promise<Booking> {
  const booking = await lockOwnBooking(t, providerId, bookingId)
  if (booking.status !== 'requested') throw fail.conflict('This request was already handled.')
  const session = await requireSession(t, booking.sessionId)
  await t.query(`UPDATE bookings SET status = 'declined', updated_at = now() WHERE id = $1`, [bookingId])
  await notifyBooker(t, booking, 'booking.declined', `Not this time: ${session.title}`, `${session.providerName} suggests a different session for you. Check their page for other times.`)
  return (await getBooking(t, bookingId))!
}

/** Player accepts a coach's invite: uses a credit or saved card if available, otherwise returns a checkout to open. */
export async function acceptInvite(t: Db, bookingId: string): Promise<{ booking: Booking; paymentId: string | null }> {
  const { session, booking } = await lockBooking(t, bookingId)
  if (booking.status !== 'invited') throw fail.conflict('This invite was already answered.')
  const pending = await maybeOne<{ id: string }>(t, `SELECT id FROM payments WHERE booking_id = $1 AND status = 'pending' AND mode = 'checkout'`, [booking.id])
  if (pending) return { booking, paymentId: pending.id }
  const allocation = await decideAllocation(t, session, booking.bookedByUserId, true, 'invited')
  const paymentId = await applyAllocation(t, booking.id, session, booking.bookedByUserId,
    allocation.status === 'invited' ? { ...allocation, expiresAt: booking.offerExpiresAt ?? inviteExpiry(session) } : allocation)
  if (allocation.status === 'confirmed') {
    const player = (await getPlayer(t, booking.playerId))!
    await notifyProvider(t, session, 'booking.new', `${player.displayName} confirmed`, `${session.title}, ${when(session)}.`)
  }
  return { booking: (await getBooking(t, booking.id))!, paymentId }
}

/** Player declines an invite from the coach. */
export async function declineInvite(t: Db, bookingId: string): Promise<Booking> {
  const { session, booking } = await lockBooking(t, bookingId)
  if (booking.status !== 'invited') throw fail.conflict('This invite was already answered.')
  await cancelPendingCheckouts(t, booking.id)
  await t.query(`UPDATE bookings SET status = 'declined', offer_expires_at = NULL, updated_at = now() WHERE id = $1`, [booking.id])
  const player = (await getPlayer(t, booking.playerId))!
  await notifyProvider(t, session, 'booking.declined', `${player.displayName} can’t make it`, `${session.title}, ${when(session)}.`)
  await promoteWaitlist(t, session)
  return (await getBooking(t, booking.id))!
}

/** Coach marks attendance. Attended pay-after bookings are charged now; no-shows follow the policy. */
export async function markAttendance(t: Db, providerId: string, bookingId: string, outcome: 'attended' | 'no_show', waiveFee = false): Promise<{ booking: Booking; effects: Effects }> {
  const booking = await lockOwnBooking(t, providerId, bookingId)
  const session = await requireSession(t, booking.sessionId)
  if (new Date(session.startsAt).getTime() > Date.now()) throw fail.conflict('Mark attendance once the session starts.')
  if (!['confirmed', 'attended', 'no_show'].includes(booking.status)) throw fail.conflict('Only booked players can be marked.')
  if (booking.status === outcome) return { booking, effects: noEffects() }
  if (booking.status !== 'confirmed' && (booking.paymentRule === 'pay_now' || booking.paymentRule === 'pay_after' || booking.paymentStatus === 'credit')) {
    // Changing it would charge or refund twice; exceptions go through waive or a refund.
    throw fail.conflict('Attendance is final once payment is settled. Use Waive fee if needed.')
  }
  const effects = noEffects()
  let paymentStatus = booking.paymentStatus
  if (booking.paymentStatus === 'due' && booking.paymentRule === 'pay_after') {
    const amount = outcome === 'attended' ? booking.priceCents : waiveFee ? 0 : pct(booking.priceCents, session.noShowFeePct)
    if (amount > 0) {
      const charge = await createOffSessionPayment(t, {
        providerId, payerUserId: booking.bookedByUserId, purpose: outcome === 'attended' ? 'booking' : 'no_show_fee', amountCents: amount, bookingId,
      })
      if (charge) effects.charges.push(charge)
      else await notifyBooker(t, booking, 'payment.card_needed', `Add a card for ${session.title}`, `${formatMoney(amount)} is due to ${session.providerName}. Add a card from your booking.`)
      paymentStatus = charge ? 'due' : 'failed'
    } else {
      paymentStatus = 'waived'
    }
  } else if (outcome === 'no_show') {
    const keep = waiveFee ? 0 : session.noShowFeePct
    const settled = await settleEnd(t, booking, { refundCents: booking.priceCents - pct(booking.priceCents, keep), returnCredit: keep === 0, feeCents: 0 }, 'no_show_fee')
    addEffects(effects, settled.effects)
    paymentStatus = settled.paymentStatus === 'none' ? booking.paymentStatus : settled.paymentStatus
  }
  await t.query(`UPDATE bookings SET status = $2, payment_status = $3, attended_at = CASE WHEN $2 = 'attended' THEN now() END, updated_at = now() WHERE id = $1`,
    [bookingId, outcome, paymentStatus])
  if (outcome === 'no_show') {
    await notifyBooker(t, booking, 'booking.no_show', `Missed: ${session.title}`, `${when(session)}. ${waiveFee || !session.noShowFeePct ? 'No fee this time.' : `No-show fee: ${session.noShowFeePct}% of the price.`}`)
  }
  return { booking: (await getBooking(t, bookingId))!, effects }
}

export async function waiveFee(t: Db, providerId: string, bookingId: string): Promise<Booking> {
  const booking = await lockOwnBooking(t, providerId, bookingId)
  await t.query(
    `UPDATE payments SET status = 'canceled', updated_at = now()
     WHERE booking_id = $1 AND purpose IN ('late_cancel_fee','no_show_fee') AND status IN ('pending','failed')`, [bookingId])
  if (booking.paymentStatus === 'due' || booking.paymentStatus === 'failed') {
    await t.query(`UPDATE bookings SET payment_status = 'waived', updated_at = now() WHERE id = $1`, [bookingId])
  }
  return (await getBooking(t, bookingId))!
}

export async function markPaidExternally(t: Db, providerId: string, bookingId: string): Promise<Booking> {
  const booking = await lockOwnBooking(t, providerId, bookingId)
  if (booking.paymentStatus !== 'due' && booking.paymentStatus !== 'failed') throw fail.conflict('Nothing is owed on this booking.')
  await t.query(`UPDATE payments SET status = 'canceled', updated_at = now() WHERE booking_id = $1 AND status IN ('pending','failed')`, [bookingId])
  await t.query(`UPDATE bookings SET payment_status = 'paid_external', updated_at = now() WHERE id = $1`, [bookingId])
  return (await getBooking(t, bookingId))!
}

/** Cron: closes expired holds, offers, and invites, and passes seats on. */
export async function expireHolds(db: Db): Promise<number> {
  const expired = await db.query<{ id: string; sessionId: string }>(
    `SELECT id, session_id AS "sessionId" FROM bookings
     WHERE (status = 'held' AND hold_expires_at < now()) OR (status IN ('offered','invited') AND offer_expires_at < now()) LIMIT 500`)
  for (const row of expired) {
    await tx(async (t) => {
      const session = await lockSession(t, row.sessionId)
      const updated = await t.query<Booking>(
        `UPDATE bookings b SET status = 'expired', hold_expires_at = NULL, offer_expires_at = NULL, updated_at = now()
         WHERE b.id = $1 AND ((b.status = 'held' AND b.hold_expires_at < now()) OR (b.status IN ('offered','invited') AND b.offer_expires_at < now()))
         RETURNING ${BOOKING_COLUMNS}`, [row.id])
      if (!updated[0]) return
      await cancelPendingCheckouts(t, row.id)
      await notifyBooker(t, updated[0], 'booking.expired', `Spot released: ${session.title}`, 'The time to confirm ran out, so the spot went to the next player. Book again any time.')
      await promoteWaitlist(t, session)
    })
  }
  return expired.length
}

/** Cron: two hours after a session ends it completes; booked players count as attended and pay-after bookings are charged. */
export async function completeSessions(db: Db): Promise<Effects> {
  const effects = noEffects()
  const due = await db.query<{ id: string; providerId: string }>(
    `SELECT id, provider_id AS "providerId" FROM sessions WHERE status = 'scheduled' AND ends_at < now() - interval '2 hours' LIMIT 200`)
  for (const s of due) {
    await tx(async (t) => {
      await lockSession(t, s.id)
      const confirmed = await t.query<{ id: string }>(`SELECT id FROM bookings WHERE session_id = $1 AND status = 'confirmed'`, [s.id])
      for (const b of confirmed) addEffects(effects, (await markAttendance(t, s.providerId, b.id, 'attended')).effects)
      await t.query(`UPDATE bookings SET status = 'expired', updated_at = now() WHERE session_id = $1 AND status IN ('held','offered','invited','requested','waitlisted')`, [s.id])
      await t.query(`UPDATE sessions SET status = 'completed', updated_at = now() WHERE id = $1`, [s.id])
    })
  }
  return effects
}

// ---- Settlement callbacks (payments/settlement.ts calls these inside its transaction) ----

/** A booking's checkout succeeded. Confirm the seat, or refund if the seat is gone. */
export async function onBookingPaid(t: Db, payment: Payment, kind: 'paid' | 'card_saved'): Promise<Effects> {
  const effects = noEffects()
  if (!payment.bookingId) return effects
  if (!(await getBooking(t, payment.bookingId))) return effects
  const { session, booking } = await lockBooking(t, payment.bookingId)
  const paymentStatus: PaymentStatus = kind === 'paid' ? 'paid' : 'due'
  const holding = ['held', 'offered', 'invited'].includes(booking.status)
  const seatFree = (await seatGenders(t, session.id)).length < session.capacity
  const otherOpen = await maybeOne(t, `SELECT 1 FROM bookings WHERE session_id = $1 AND player_id = $2 AND id <> $3 AND status = ANY($4)`,
    [session.id, booking.playerId, booking.id, OPEN_STATUSES])
  // A payment finishing after its hold timed out may still take a free seat. Cancelled or declined
  // bookings are never revived, and a second open booking means refund (never a constraint error).
  const canTakeSeat = holding || (booking.status === 'expired' && seatFree && !otherOpen
    && session.status === 'scheduled' && new Date(session.startsAt).getTime() > Date.now())
  if (canTakeSeat) {
    await t.query(`UPDATE bookings SET status = 'confirmed', payment_status = $2, hold_expires_at = NULL, offer_expires_at = NULL, updated_at = now() WHERE id = $1`, [booking.id, paymentStatus])
    await notifyBooker(t, booking, 'booking.confirmed', `You’re booked: ${session.title}`, `${when(session)}${session.locationName ? ` at ${session.locationName}` : ''}.`, `booking.confirmed:${booking.id}`)
    const player = (await getPlayer(t, booking.playerId))!
    await notifyProvider(t, session, 'booking.new', `${player.displayName} booked`, `${session.title}, ${when(session)}.`, `booking.new:${booking.id}`)
  } else if (kind === 'paid' && booking.status !== 'confirmed') {
    await requestRefund(t, payment.id, payment.amountCents)
    effects.refunds.push(payment.id)
    await t.query(`UPDATE bookings SET payment_status = 'refunded', updated_at = now() WHERE id = $1`, [booking.id])
    await notifyBooker(t, booking, 'booking.refunded', `Refunded: ${session.title}`, 'The spot was taken before your payment finished, so we refunded you in full.')
  }
  return effects
}

/** An off-session charge (after-session payment, late-cancel or no-show fee) finished. */
export async function onChargeResult(t: Db, payment: Payment, ok: boolean, message: string | null): Promise<void> {
  if (!payment.bookingId) return
  const booking = await getBooking(t, payment.bookingId, { forUpdate: true })
  if (!booking) return
  await t.query(`UPDATE bookings SET payment_status = $2, updated_at = now() WHERE id = $1`, [booking.id, ok ? 'paid' : 'failed'])
  if (!ok) {
    const session = await requireSession(t, booking.sessionId)
    await notifyBooker(t, booking, 'payment.failed', `Payment didn’t go through: ${session.title}`,
      `${message ?? 'Your card was declined.'} Update your card from your booking so ${session.providerName} gets paid.`, `payment.failed:${payment.id}`)
    await notifyProvider(t, session, 'payment.failed', `Payment failed for a ${KIND_LABELS[session.kind].toLowerCase()}`, `${formatMoney(payment.amountCents)} for ${when(session)}. We’ve asked the player to update their card.`)
  }
}
