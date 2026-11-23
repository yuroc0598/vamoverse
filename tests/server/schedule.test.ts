import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { extendAllSessions } from '@/server/modules/schedule/offerings'
import { weekdayOf } from '@/lib/time'
import { resetDb } from '../helpers/db'
import { connectPayouts, inDays, makeProvider, makeUser, verifySafety } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

const clinic = (overrides: Record<string, unknown> = {}) => ({
  kind: 'group' as const, title: '3.5 Doubles Clinic', capacity: 8, priceCents: 4000, paymentRule: 'pay_now' as const,
  startDate: inDays(1), startTime: '18:00', durationMinutes: 90, repeatWeekdays: [weekdayOf(inDays(1))],
  levelSystem: 'ntrp' as const, levelMin: 3, levelMax: 4, ...overrides,
})

describe('offerings', () => {
  it('requires payouts before card-paid sessions, but allows free and pay-outside-the-app', async () => {
    const coach = await makeProvider()
    await expect(as(coach)('offerings.create', clinic())).rejects.toMatchObject({ code: 'payment_required' })
    const external = await as(coach)('offerings.create', clinic({ paymentRule: 'external' }))
    expect(external.sessionsCreated).toBe(12)
    await connectPayouts(coach)
    const paid = await as(coach)('offerings.create', clinic())
    expect(paid.offering).toMatchObject({ kind: 'group', priceCents: 4000, timezone: 'America/Los_Angeles', startTime: '18:00' })
  })

  it('enforces kind rules, level ranges, and offering type settings', async () => {
    const coach = await makeProvider()
    const run = as(coach)
    await expect(run('offerings.create', clinic({ kind: 'private', capacity: 2, paymentRule: 'external' }))).rejects.toThrow('one player')
    await expect(run('offerings.create', clinic({ paymentRule: 'external', levelMax: 9 }))).rejects.toThrow('NTRP levels run 1–7')
    await expect(run('offerings.create', clinic({ paymentRule: 'free', priceCents: 1000 }))).rejects.toThrow('no price')
    await expect(run('offerings.create', clinic({ kind: 'hitting', capacity: 1, paymentRule: 'external' }))).rejects.toMatchObject({ code: 'forbidden' })
    await expect(run('offerings.create', clinic({ paymentRule: 'external', audience: 'juniors' }))).rejects.toThrow('safety check')
    await verifySafety(coach)
    await expect(run('offerings.create', clinic({ paymentRule: 'external', audience: 'juniors' }))).resolves.toBeTruthy()
    await expect(run('offerings.create', clinic({ paymentRule: 'external', startDate: inDays(-30), repeatWeekdays: null })))
      .rejects.toThrow('no upcoming dates')
  })

  it('creates open slots and hides ones that are taken or overlap other teaching', async () => {
    const hitter = await makeProvider('Sam Hitter', { coaching: true, hitting: true })
    const day = inDays(2)
    const slots = await as(hitter)('offerings.create', {
      kind: 'hitting', title: 'Hitting session', capacity: 1, priceCents: 6000, paymentRule: 'external',
      startDate: day, startTime: '16:00', durationMinutes: 60, slotsPerDay: 4,
    })
    expect(slots.sessionsCreated).toBe(4)
    const page = await as(null)('schedule.public', { slug: 'sam-hitter' })
    expect(page.sessions.map((s) => s.title)).toEqual(Array(4).fill('Hitting session'))
    // A booked clinic from 5–6pm hides the overlapping 5pm slot.
    const clinicSeries = await as(hitter)('offerings.create', clinic({ paymentRule: 'external', startDate: day, startTime: '17:00', durationMinutes: 60, repeatWeekdays: null }))
    const [clinicSession] = await db.query<{ id: string }>(`SELECT id FROM sessions WHERE offering_id = $1`, [clinicSeries.offering.id])
    const player = await makeUser('Maya')
    await db.query(`INSERT INTO bookings (id, session_id, offering_id, provider_id, player_id, booked_by_user_id, status, payment_rule, price_cents)
      VALUES ('bkg_test', $1, $2, $3, $4, $5, 'confirmed', 'external', 4000)`, [clinicSession.id, clinicSeries.offering.id, hitter.providerId, player.playerId, player.userId])
    const after = await as(null)('schedule.public', { slug: 'sam-hitter' })
    expect(after.sessions.filter((s) => s.kind === 'hitting')).toHaveLength(3)
  })

  it('applies series edits to future sessions and keeps booked ones when the schedule moves', async () => {
    const coach = await makeProvider()
    const { offering } = await as(coach)('offerings.create', clinic({ paymentRule: 'external' }))
    const [first] = await db.query<{ id: string }>(`SELECT id FROM sessions WHERE offering_id = $1 ORDER BY starts_at LIMIT 1`, [offering.id])
    const player = await makeUser('Maya')
    await db.query(`INSERT INTO bookings (id, session_id, offering_id, provider_id, player_id, booked_by_user_id, status, payment_rule, price_cents)
      VALUES ('bkg_test', $1, $2, $3, $4, $5, 'confirmed', 'external', 4000)`, [first.id, offering.id, coach.providerId, player.playerId, player.userId])

    const priced = await as(coach)('offerings.update', { offeringId: offering.id, priceCents: 4500 })
    expect(priced.keptWithBookings).toBe(0)
    expect(await db.query(`SELECT DISTINCT price_cents FROM sessions WHERE offering_id = $1`, [offering.id])).toEqual([{ price_cents: 4500 }])

    const moved = await as(coach)('offerings.update', { offeringId: offering.id, startTime: '19:00' })
    expect(moved.keptWithBookings).toBe(1)
    const times = await db.query<{ id: string; local: string }>(
      `SELECT id, to_char(starts_at AT TIME ZONE 'America/Los_Angeles', 'HH24:MI') AS local FROM sessions WHERE offering_id = $1 ORDER BY starts_at`, [offering.id])
    expect(times[0]).toEqual({ id: first.id, local: '18:00' })
    expect(new Set(times.slice(1).map((t) => t.local))).toEqual(new Set(['19:00']))
  })

  it('edits one session without touching the rest, and blocks capacity below bookings', async () => {
    const coach = await makeProvider()
    const { offering } = await as(coach)('offerings.create', clinic({ paymentRule: 'external' }))
    const [first, second] = await db.query<{ id: string }>(`SELECT id FROM sessions WHERE offering_id = $1 ORDER BY starts_at LIMIT 2`, [offering.id])
    const { session, moved } = await as(coach)('sessions.update', { sessionId: first.id, startTime: '17:30', note: 'Bring water', courtStatus: 'booked', courtConfirmation: 'R-1234' })
    expect(moved).toBe(true)
    expect(session).toMatchObject({ note: 'Bring water', courtStatus: 'booked', courtConfirmation: 'R-1234' })
    await as(coach)('offerings.update', { offeringId: offering.id, priceCents: 5000 })
    const prices = await db.query<{ id: string; price_cents: number }>(`SELECT id, price_cents FROM sessions WHERE id IN ($1, $2)`, [first.id, second.id])
    expect(Object.fromEntries(prices.map((p) => [p.id, p.price_cents]))).toEqual({ [first.id]: 4000, [second.id]: 5000 })
    const other = await makeProvider('Other')
    await expect(as(other)('sessions.update', { sessionId: first.id, note: 'x' })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('archives a series and the cron keeps repeating series generated ahead', async () => {
    const coach = await makeProvider()
    const { offering } = await as(coach)('offerings.create', clinic({ paymentRule: 'external' }))
    await db.query(`DELETE FROM sessions WHERE offering_id = $1 AND starts_at > now() + interval '30 days'`, [offering.id])
    await db.query(`UPDATE offerings SET generated_through = CURRENT_DATE + 30 WHERE id = $1`, [offering.id])
    expect(await extendAllSessions(db)).toBeGreaterThan(0)
    expect(await db.query(`SELECT 1 FROM sessions WHERE offering_id = $1`, [offering.id])).toHaveLength(12)
    expect(await as(coach)('offerings.archive', { offeringId: offering.id })).toEqual({ keptWithBookings: 0 })
    expect(await as(coach)('offerings.list', {})).toEqual([])
    expect(await db.query(`SELECT 1 FROM sessions WHERE offering_id = $1`, [offering.id])).toHaveLength(0)
  })
})
