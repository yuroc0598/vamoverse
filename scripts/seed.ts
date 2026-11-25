// Demo data for local development, created through the same commands the app uses.
// Sign in on /login (dev mode) with any of the emails printed at the end.
import { daysFromToday, weekdayOf } from '../src/lib/time'
import { runAs } from '../src/server/commands/run'
import type { ProviderActor } from '../src/server/commands/define'
import { paymentsMode } from '../src/server/config'
import { closeDb, db } from '../src/server/db'
import { newId } from '../src/server/ids'
import { ensureActor, type Actor } from '../src/server/modules/users/accounts'
import { simulate } from '../src/server/modules/payments/simulator'

const inDays = (n: number) => daysFromToday(n)

async function person(email: string, name: string, roles: { coaching?: boolean; hitting?: boolean } = {}): Promise<Actor> {
  const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, [email])
  const actor = await ensureActor(db, { id: existing[0]?.id ?? newId('usr'), email, name })
  if (actor.onboarded) return actor
  return (await runAs(actor)('onboarding.complete', { displayName: name, adult: true, offersCoaching: roles.coaching ?? false, offersHitting: roles.hitting ?? false }))!
}

async function main() {
  if (paymentsMode() !== 'dev') throw new Error('Seed data is for local development only.')
  if ((await db.query(`SELECT 1 FROM providers LIMIT 1`)).length) {
    console.log('Database already has data; skipping seed.')
    return
  }
  const alex = (await person('alex@demo.vamoverse.app', 'Alex Rivera', { coaching: true })) as ProviderActor
  const sam = (await person('sam@demo.vamoverse.app', 'Sam Okafor', { hitting: true })) as ProviderActor
  const [maya, sarah, dave] = await Promise.all([
    person('maya@demo.vamoverse.app', 'Maya Chen'), person('sarah@demo.vamoverse.app', 'Sarah Patel'), person('dave@demo.vamoverse.app', 'Dave Kim'),
  ])
  const coach = runAs(alex)
  const hitter = runAs(sam)

  for (const p of [alex, sam]) {
    await runAs(p)('payouts.connect', {})
    await simulate(db, 'connect', p.providerId)
  }
  await db.query(`UPDATE providers SET safety_status = 'verified' WHERE id = $1`, [alex.providerId])
  await coach('provider.update', {
    headline: 'USPTA pro · adult doubles and junior development', homeArea: 'Fremont & San Jose',
    ratePrivateCents: 9000, rateSemiPrivateCents: 6000, rateGroupCents: 4000, cancelWindowHours: 24,
  })
  await hitter('provider.update', { headline: 'Former D1 player · consistent, heavy ball', homeArea: 'Fremont', rateHittingCents: 6000 })
  await hitter('players.update', { playerId: sam.playerId, utrSingles: 10.5 })

  const court = await coach('courts.save', { name: 'Central Park Tennis Center', address: '40000 Paseo Padre Pkwy, Fremont, CA', bookingNote: 'Opens 7 days ahead at 8am', bookingUrl: 'https://example.com/courts' })
  const clinic = await coach('offerings.create', {
    kind: 'group', title: '3.5 Doubles Clinic', capacity: 8, priceCents: 4000, paymentRule: 'pay_now', acceptsCredits: true,
    discipline: 'doubles', levelSystem: 'ntrp', levelMin: 3, levelMax: 4, courtId: court.id,
    startDate: inDays(1), startTime: '18:30', durationMinutes: 90, repeatWeekdays: [weekdayOf(inDays(1))],
  })
  await coach('offerings.create', {
    kind: 'private', title: 'Private lesson', capacity: 1, priceCents: 9000, paymentRule: 'pay_after', acceptsCredits: true, courtId: court.id,
    startDate: inDays(2), startTime: '16:00', durationMinutes: 60, slotsPerDay: 3, repeatWeekdays: [weekdayOf(inDays(2)), weekdayOf(inDays(4))],
  })
  const juniors = await coach('offerings.create', {
    kind: 'group', title: 'Junior Development (10–14)', capacity: 6, priceCents: 3500, paymentRule: 'external', audience: 'juniors', courtId: court.id,
    startDate: inDays(3), startTime: '15:30', durationMinutes: 75, repeatWeekdays: [weekdayOf(inDays(3))],
  })
  await coach('packages.save', { name: '10 private lessons', credits: 10, priceCents: 80000, validDays: 180, kinds: ['private'] })
  await hitter('offerings.create', {
    kind: 'hitting', title: 'Hitting session', capacity: 1, priceCents: 6000, paymentRule: 'pay_now',
    startDate: inDays(1), startTime: '07:00', durationMinutes: 60, slotsPerDay: 2, repeatWeekdays: [0, 6, weekdayOf(inDays(1))],
  })

  await runAs(maya)('players.update', { playerId: maya.playerId, ntrp: 3.5, gender: 'female' })
  await runAs(sarah)('players.update', { playerId: sarah.playerId, ntrp: 4, gender: 'female' })
  const [clinicSession] = await db.query<{ id: string }>(`SELECT id FROM sessions WHERE offering_id = $1 ORDER BY starts_at LIMIT 1`, [clinic.offering.id])
  for (const player of [maya, sarah]) {
    const booked = await runAs(player)('bookings.create', { sessionId: clinicSession.id })
    if (booked.checkoutUrl) await simulate(db, 'checkout', new URL(booked.checkoutUrl).searchParams.get('id')!)
  }
  const leo = await runAs(dave)('family.addJunior', { displayName: 'Leo Kim', birthDate: `${new Date().getFullYear() - 12}-04-02`, gender: 'male', signatureName: 'Dave Kim', consent: true })
  const [juniorSession] = await db.query<{ id: string }>(`SELECT id FROM sessions WHERE offering_id = $1 ORDER BY starts_at LIMIT 1`, [juniors.offering.id])
  await runAs(dave)('bookings.create', { sessionId: juniorSession.id, playerId: leo.id })
  await coach('clients.import', { contacts: [{ name: 'Priya Shah', email: 'priya@demo.vamoverse.app' }, { name: 'Tom Lee', phone: '(415) 555-0142' }] })
  // One conversation, so Messages isn't empty (Maya is in Alex's crew from her clinic booking).
  const { threadId } = await runAs(maya)('messages.start', { providerId: alex.providerId })
  await runAs(maya)('messages.send', { threadId, body: 'Hi Alex! Could we work on my second serve at the clinic this week?' })
  await coach('messages.send', { threadId, body: 'Absolutely. Bring a basket of balls and we’ll start with the toss.' })

  console.log(`Seeded. Sign in at /login with:
  alex@demo.vamoverse.app   coach (payouts connected, safety verified)
  sam@demo.vamoverse.app    paid hitting partner
  maya@demo.vamoverse.app   player, booked into the clinic, messaging Alex
  dave@demo.vamoverse.app   parent of Leo (junior clinic)`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(closeDb)
