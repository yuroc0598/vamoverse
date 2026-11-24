// Builds test data through the same commands the app uses.
import { db } from '@/server/db'
import { newId } from '@/server/ids'
import { ensureActor, type Actor } from '@/server/modules/users/accounts'
import type { ProviderActor } from '@/server/commands/define'
import { daysFromToday } from '@/lib/time'
import { simulate } from '@/server/modules/payments/simulator'
import { applyAccountStatus } from '@/server/modules/payments/settlement'
import { as } from './run'

let counter = 0

export async function makeUser(name = 'Player', opts: { onboard?: boolean } = {}): Promise<Actor> {
  counter += 1
  const actor = await ensureActor(db, { id: newId('usr'), email: `${name.toLowerCase().replace(/\W/g, '')}${counter}@example.com`, name })
  if (opts.onboard === false) return actor
  return (await as(actor)('onboarding.complete', { displayName: name, adult: true }))!
}

export async function makeProvider(name = 'Coach Alex', opts: { coaching?: boolean; hitting?: boolean } = {}): Promise<ProviderActor> {
  const user = await makeUser(name, { onboard: false })
  const actor = await as(user)('onboarding.complete', {
    displayName: name, adult: true, offersCoaching: opts.coaching ?? true, offersHitting: opts.hitting ?? false,
  })
  return actor as ProviderActor
}

/** Runs the real payout onboarding flow (processor onboarding link, then the account.updated event). */
export async function connectPayouts(provider: ProviderActor): Promise<void> {
  await as(provider)('payouts.connect', {})
  await simulate(db, 'connect', provider.providerId)
}

/** What Stripe's account.updated webhook does when a coach's payouts turn off or back on. */
export async function setPayouts(provider: ProviderActor, enabled: boolean): Promise<void> {
  const [row] = await db.query<{ a: string }>(`SELECT stripe_account_id AS a FROM providers WHERE id = $1`, [provider.providerId])
  await applyAccountStatus(db, row.a, enabled, enabled)
}

/** Completes a checkout exactly as a Stripe checkout.session.completed webhook would. */
export async function payCheckout(checkoutUrl: string | null): Promise<void> {
  const id = new URL(checkoutUrl!).searchParams.get('id')!
  await simulate(db, 'checkout', id)
}

/** Creates a session series and returns its sessions in order. */
export async function makeSeries(provider: ProviderActor, overrides: Record<string, unknown> = {}) {
  const { offering } = await as(provider)('offerings.create', {
    kind: 'group', title: 'Clinic', capacity: 2, priceCents: 0, paymentRule: 'free',
    startDate: inDays(2), startTime: '18:00', durationMinutes: 60, ...overrides,
  } as never)
  const sessions = await db.query<{ id: string }>(`SELECT id FROM sessions WHERE offering_id = $1 ORDER BY starts_at`, [offering.id])
  return { offering, sessionIds: sessions.map((s) => s.id) }
}

/** A coach with payouts connected and a paid series (pay when booking, $40 unless overridden). */
export async function makePaidSeries(overrides: Record<string, unknown> = {}) {
  const coach = await makeProvider()
  await connectPayouts(coach)
  return { coach, ...(await makeSeries(coach, { paymentRule: 'pay_now', priceCents: 4000, ...overrides })) }
}

/** Writes a confirmed booking directly, bypassing the engine (for states the app can't reach, or plain setup). */
export async function forceBooking(sessionId: string, player: Actor): Promise<string> {
  const id = newId('bkg')
  await db.query(
    `INSERT INTO bookings (id, session_id, offering_id, provider_id, player_id, player_name, booked_by_user_id, status, payment_rule, price_cents)
     SELECT $1, s.id, s.offering_id, s.provider_id, $3, $4, $5, 'confirmed', o.payment_rule, s.price_cents
     FROM sessions s JOIN offerings o ON o.id = s.offering_id WHERE s.id = $2`,
    [id, sessionId, player.playerId, player.displayName, player.userId])
  return id
}

/** Moves a session to start `hours` from now (inside the cancellation window), independent of time of day. */
export async function moveSessionSoon(sessionId: string, hours = 2): Promise<void> {
  await db.query(`UPDATE sessions SET starts_at = now() + make_interval(hours => $2), ends_at = now() + make_interval(hours => $2) + interval '1 hour' WHERE id = $1`, [sessionId, hours])
}

/** A $90 pay-after private booked by Maya, card saved, with the coach's payouts on. */
export async function bookPayAfterPrivate() {
  const coach = await makeProvider()
  await connectPayouts(coach)
  const { sessionIds: [sessionId] } = await makeSeries(coach, { kind: 'private', capacity: 1, paymentRule: 'pay_after', priceCents: 9000 })
  const maya = await makeUser('Maya')
  const booked = await as(maya)('bookings.create', { sessionId })
  await payCheckout(booked.checkoutUrl)
  return { coach, maya, sessionId, bookingId: booked.booking.id }
}

/** Moves a session into the past (for attendance and completion). */
export async function startSession(sessionId: string, hoursAgo = 1): Promise<void> {
  await db.query(`UPDATE sessions SET starts_at = now() - make_interval(hours => $2), ends_at = now() - make_interval(hours => $2) + interval '1 hour' WHERE id = $1`, [sessionId, hoursAgo])
}

export async function notificationsFor(userId: string): Promise<string[]> {
  return (await db.query<{ kind: string }>(`SELECT kind FROM notifications WHERE user_id = $1 ORDER BY created_at`, [userId])).map((r) => r.kind)
}

export async function verifySafety(provider: ProviderActor): Promise<void> {
  await db.query(`UPDATE providers SET safety_status = 'verified' WHERE id = $1`, [provider.providerId])
}

/** Calendar date `days` from today in Los Angeles. */
export const inDays = (days: number): string => daysFromToday(days)
