import { z } from 'zod'
import { command } from '../../commands/define'
import { maybeOne, tx, type Db } from '../../db'
import { fail } from '../../errors'
import { enforceRateLimit } from '../../ratelimit'
import { optionalText, personName } from '../../schemas'
import { runEffects } from '../payments/settlement'
import { requireOwnSession, requireSession, type SessionView } from '../schedule/sessions'
import { findOrCreateAccount, findUserIdByContact, type Actor } from '../users/accounts'
import { listFamily, requireManagedPlayer, getPlayer, type Player } from '../users/players'
import { creditBalance } from '../packages/packages'
import { zonedToUtc, addDays } from '@/lib/time'
import { isClientOf, isClientUser } from '../clients/clients'
import { bookingCheckoutUrl } from './checkout'
import {
  acceptInvite, approveRequest, cancelBooking, cancelSession, declineInvite, declineRequest, lockSession, markAttendance,
  markPaidExternally, placeBooking, requireBooking, waiveFee, type Effects,
} from './engine'
import { bookingPath } from './links'
import { bookingAccess, getBookingDetail, listMyBookings, listRoster } from './queries'

/** Runs a transaction that may record processor work, then executes that work after commit. */
async function withEffects<T>(db: Db, fn: (t: Db) => Promise<{ result: T; effects: Effects }>): Promise<T> {
  const { result, effects } = await tx(fn)
  await runEffects(db, effects)
  return result
}

async function assertCanSee(db: Db, session: SessionView, actor: Actor | null): Promise<void> {
  if (session.visibility === 'public') return
  if (session.visibility === 'clients' && actor && (actor.providerId === session.providerId || (await isClientUser(db, session.providerId, actor.userId)))) return
  throw fail.forbidden(session.visibility === 'invite' ? 'This session is by invitation from the coach.' : 'This session is for the coach’s current students.')
}

const tokenField = z.string().max(64).nullish()

/** The booking's player side (owner or signed link) — not the coach. Returns the booking. */
async function requirePlayerSide(db: Db, actor: Actor | null, bookingId: string, token: string | null | undefined, verb: string) {
  const booking = await requireBooking(db, bookingId)
  if (await bookingAccess(db, actor, booking, token) === 'provider') throw fail.forbidden(`Only the player can ${verb}.`)
  return booking
}

/** A provider action on one of their bookings: `{ bookingId }` in, run in a transaction. */
function providerBookingAction<R>(summary: string, fn: (t: Db, providerId: string, bookingId: string) => Promise<R>) {
  return command({
    summary, access: 'provider', mutates: true,
    input: z.object({ bookingId: z.string() }),
    run: ({ actor }, { bookingId }) => tx((t) => fn(t, actor.providerId, bookingId)),
  })
}

export const bookingCommands = {
  'sessions.view': command({
    summary: 'A session’s public details, plus (when signed in) who you can book and any booking you already have.',
    access: 'public',
    mutates: false,
    input: z.object({ sessionId: z.string() }),
    run: async ({ actor, db }, { sessionId }) => {
      const session = await requireSession(db, sessionId)
      const mine = actor
        ? await db.query<{ id: string; playerId: string; status: string }>(
          `SELECT b.id, b.player_id AS "playerId", b.status FROM bookings b JOIN players p ON p.id = b.player_id
           WHERE b.session_id = $1 AND (b.booked_by_user_id = $2 OR p.user_id = $2 OR p.guardian_user_id = $2)
           ORDER BY b.created_at DESC`, [sessionId, actor.userId])
        : []
      if (!mine.length && actor?.providerId !== session.providerId) await assertCanSee(db, session, actor)
      return {
        session,
        family: actor ? await listFamily(db, actor) : [],
        bookings: mine,
        credits: actor && session.acceptsCredits ? await creditBalance(db, actor.userId, session.providerId, session.kind) : 0,
        isOwner: actor?.providerId === session.providerId,
        bookable: session.status === 'scheduled' && new Date(session.startsAt).getTime() > Date.now(),
      }
    },
  }),

  'bookings.create': command({
    summary: 'Book a session for yourself or a junior you manage. Uses a package credit when available; returns a checkout link when payment is needed.',
    access: 'public',
    mutates: true,
    input: z.object({
      sessionId: z.string(),
      playerId: z.string().optional(),
      useCredit: z.boolean().default(true),
      guest: z.object({ name: personName, email: z.email().nullish(), phone: z.string().trim().max(32).nullish() })
        .refine((g) => g.email || g.phone, 'Enter an email or phone number').optional(),
    }),
    run: async ({ actor, db, ip }, input) => {
      let booker = actor
      if (!booker) {
        if (!input.guest) throw fail.unauthorized('Sign in, or enter your name and email to book as a guest.')
        if (input.playerId) throw fail.badRequest('Sign in to book for a junior.')
        await enforceRateLimit(db, `guest-book:${ip ?? 'unknown'}`, 20, 3600)
        // A guest can only create a new account. Booking as an existing account (its credits,
        // saved card, juniors) requires signing in as that person.
        if (await findUserIdByContact(db, input.guest)) throw fail.unauthorized('You already have an account with that email or phone. Sign in to book.')
        booker = await findOrCreateAccount(db, input.guest)
      }
      const playerId = input.playerId ?? booker.playerId
      const player: Player = actor ? await requireManagedPlayer(db, actor, playerId) : (await getPlayer(db, playerId))!
      const placed = await tx(async (t) => {
        const session = await lockSession(t, input.sessionId)
        await assertCanSee(t, session, actor)
        return placeBooking(t, { session, player, bookedByUserId: booker.userId, useCredit: Boolean(actor) && input.useCredit })
      })
      const checkoutUrl = placed.paymentId ? await bookingCheckoutUrl(db, placed.booking.id) : null
      return { booking: placed.booking, message: placed.message, checkoutUrl, manageUrl: bookingPath(placed.booking.id) }
    },
  }),

  'bookings.mine': command({
    summary: 'Your bookings (and your juniors’): upcoming or past.',
    access: 'user',
    mutates: false,
    input: z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') }),
    run: ({ actor, db }, { scope }) => listMyBookings(db, actor.userId, scope),
  }),

  'bookings.get': command({
    summary: 'Get one booking with its session, payment state, and what cancelling would cost.',
    access: 'public',
    mutates: false,
    input: z.object({ bookingId: z.string(), token: tokenField }),
    run: ({ actor, db }, { bookingId, token }) => getBookingDetail(db, actor, bookingId, token),
  }),

  'bookings.checkout': command({
    summary: 'Get the payment link that confirms a held or offered booking.',
    access: 'public',
    mutates: true,
    assistant: false,
    input: z.object({ bookingId: z.string(), token: tokenField }),
    run: async ({ actor, db }, { bookingId, token }) => {
      const booking = await requirePlayerSide(db, actor, bookingId, token, 'pay')
      if (booking.status === 'invited') throw fail.conflict('Confirm the invite first.')
      return { checkoutUrl: await bookingCheckoutUrl(db, bookingId) }
    },
  }),

  'bookings.acceptInvite': command({
    summary: 'Accept a coach’s invitation (optionally every invite in that series). Uses a credit or saved card when available; otherwise returns a payment link.',
    access: 'public',
    mutates: true,
    input: z.object({ bookingId: z.string(), token: tokenField, allInSeries: z.boolean().default(false) }),
    run: async ({ actor, db }, { bookingId, token, allInSeries }) => {
      const booking = await requirePlayerSide(db, actor, bookingId, token, 'accept')
      const ids = allInSeries
        ? (await db.query<{ id: string }>(`SELECT b.id FROM bookings b JOIN sessions s ON s.id = b.session_id
            WHERE b.offering_id = $1 AND b.player_id = $2 AND b.status = 'invited' ORDER BY s.starts_at`, [booking.offeringId, booking.playerId])).map((r) => r.id)
        : [bookingId]
      let firstCheckout: string | null = null
      let confirmed = 0
      for (const id of ids) {
        const result = await tx((t) => acceptInvite(t, id))
        if (result.booking.status === 'confirmed') confirmed++
        else if (!firstCheckout && result.paymentId) firstCheckout = id
      }
      return { confirmed, checkoutUrl: firstCheckout ? await bookingCheckoutUrl(db, firstCheckout) : null }
    },
  }),

  'bookings.cancel': command({
    summary: 'Cancel a booking. Players get refunds/credits per the cancellation policy; coaches removing a player always refund in full.',
    access: 'public',
    mutates: true,
    input: z.object({ bookingId: z.string(), token: tokenField, waiveFee: z.boolean().default(false) }),
    run: async ({ actor, db }, { bookingId, token, waiveFee: waive }) => {
      const access = await bookingAccess(db, actor, await requireBooking(db, bookingId), token)
      return withEffects(db, async (t) => {
        const { booking, terms, effects } = await cancelBooking(t, bookingId, { byProvider: access === 'provider', waiveFee: access === 'provider' && waive })
        return { result: { booking, summary: terms.summary }, effects }
      })
    },
  }),

  'bookings.declineInvite': command({
    summary: 'Decline a coach’s invitation to a session.',
    access: 'public',
    mutates: true,
    input: z.object({ bookingId: z.string(), token: tokenField }),
    run: async ({ actor, db }, { bookingId, token }) => {
      await requirePlayerSide(db, actor, bookingId, token, 'decline')
      return tx((t) => declineInvite(t, bookingId))
    },
  }),

  'bookings.addPlayer': command({
    summary: 'Add one of your students (or their junior) to a session — optionally every future session in the series (e.g. “book Maya Thursdays at 3”).',
    access: 'provider',
    mutates: true,
    input: z.object({ sessionId: z.string(), playerId: z.string(), allFuture: z.boolean().default(false) }),
    run: async ({ actor, db }, { sessionId, playerId, allFuture }) => {
      const first = await requireOwnSession(db, actor.providerId, sessionId)
      const player = await getPlayer(db, playerId)
      if (!player || !(await isClientOf(db, actor.providerId, playerId))) {
        throw fail.notFound('Student')
      }
      const sessionIds = allFuture
        ? (await db.query<{ id: string }>(`SELECT id FROM sessions WHERE offering_id = $1 AND status = 'scheduled' AND starts_at >= $2 ORDER BY starts_at`, [first.offeringId, first.startsAt])).map((r) => r.id)
        : [sessionId]
      const results = []
      for (const id of sessionIds) {
        results.push(await tx(async (t) => {
          const session = await lockSession(t, id)
          const placed = await placeBooking(t, { session, player, bookedByUserId: player.userId ?? player.guardianUserId!, useCredit: true, byProvider: true })
          return { sessionId: id, status: placed.booking.status }
        }).catch((error) => ({ sessionId: id, status: 'skipped' as const, reason: error instanceof Error ? error.message : 'Could not add' })))
      }
      return { added: results.filter((r) => r.status !== 'skipped').length, results }
    },
  }),

  'bookings.approve': providerBookingAction('Approve a player’s request to join (outside the level range or unrated).', approveRequest),

  'bookings.decline': providerBookingAction('Decline a player’s request to join.', declineRequest),

  'bookings.attendance': command({
    summary: 'Mark a player attended or no-show. Pay-after bookings are charged when marked attended; no-shows follow your policy unless you waive the fee.',
    access: 'provider',
    mutates: true,
    input: z.object({ bookingId: z.string(), outcome: z.enum(['attended', 'no_show']), waiveFee: z.boolean().default(false) }),
    run: ({ actor, db }, { bookingId, outcome, waiveFee: waive }) =>
      withEffects(db, async (t) => {
        const { booking, effects } = await markAttendance(t, actor.providerId, bookingId, outcome, waive)
        return { result: booking, effects }
      }),
  }),

  'bookings.waiveFee': providerBookingAction('Waive a late-cancel or no-show fee (or an unpaid balance) for a booking.', waiveFee),

  'bookings.markPaid': providerBookingAction('Record that a player paid you outside the app (cash, Venmo, Zelle).', markPaidExternally),

  'sessions.roster': command({
    summary: 'Who is booked, waitlisted, or requesting for one of your sessions, with payment status and contact.',
    access: 'provider',
    mutates: false,
    input: z.object({ sessionId: z.string() }),
    run: async ({ actor, db }, { sessionId }) => {
      await requireOwnSession(db, actor.providerId, sessionId)
      return listRoster(db, actor.providerId, sessionId)
    },
  }),

  'sessions.cancel': command({
    summary: 'Cancel one session (rain, illness): everyone booked is notified and refunded in full or has their credit returned.',
    access: 'provider',
    mutates: true,
    input: z.object({ sessionId: z.string(), reason: optionalText(300) }),
    run: ({ actor, db }, { sessionId, reason }) =>
      withEffects(db, async (t) => {
        const { notified, effects } = await cancelSession(t, actor.providerId, sessionId, reason)
        return { result: { cancelled: 1, notified }, effects }
      }),
  }),

  'sessions.cancelDay': command({
    summary: 'Rain-out: cancel all of your sessions on a date (YYYY-MM-DD, your time zone), notifying and refunding everyone.',
    access: 'provider',
    mutates: true,
    input: z.object({ date: z.iso.date(), reason: optionalText(300) }),
    run: async ({ actor, db }, { date, reason }) => {
      const tz = (await maybeOne<{ tz: string }>(db, `SELECT timezone AS tz FROM providers WHERE id = $1`, [actor.providerId]))!.tz
      const ids = (await db.query<{ id: string }>(
        `SELECT id FROM sessions WHERE provider_id = $1 AND status = 'scheduled' AND starts_at >= $2 AND starts_at < $3 AND starts_at > now()`,
        [actor.providerId, zonedToUtc(date, '00:00', tz), zonedToUtc(addDays(date, 1), '00:00', tz)])).map((r) => r.id)
      let notified = 0
      for (const id of ids) {
        notified += await withEffects(db, async (t) => {
          const outcome = await cancelSession(t, actor.providerId, id, reason ?? 'Rained out')
          return { result: outcome.notified, effects: outcome.effects }
        })
      }
      return { cancelled: ids.length, notified }
    },
  }),
}
