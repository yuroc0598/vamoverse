// A coach's payment setup or one bad record must never stop other people's work.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { completeSessions } from '@/server/modules/bookings/engine'
import { runPaymentJobs } from '@/server/modules/payments/settlement'
import { JOBS } from '@/server/jobs'
import { resetDb } from '../helpers/db'
import { connectPayouts, makePaidSeries, makeProvider, makeSeries, makeUser, moveSessionSoon, notificationsFor, payCheckout, setPayouts, startSession } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)
afterEach(async () => {
  await db.query(`DROP TRIGGER IF EXISTS fail_one ON sessions`)
  await db.query(`DROP FUNCTION IF EXISTS fail_one()`)
})

const status = async (id: string) => (await db.query<{ status: string; payment_status: string }>(`SELECT status, payment_status FROM bookings WHERE id = $1`, [id]))[0]

describe('payment setup problems stay with that coach', () => {
  it('lets players cancel and the waitlist move even when the coach can’t take cards', async () => {
    const { coach, sessionIds: [sessionId] } = await makePaidSeries({ capacity: 1 })
    const [a, b] = await Promise.all([makeUser('Ann'), makeUser('Bea')])
    const ann = await as(a)('bookings.create', { sessionId })
    await payCheckout(ann.checkoutUrl)
    const bea = await as(b)('bookings.create', { sessionId })
    await setPayouts(coach, false)

    await as(a)('bookings.cancel', { bookingId: ann.booking.id })
    expect(await status(bea.booking.id)).toMatchObject({ status: 'offered' })
    // Paying is the moment the coach's setup matters, and only to the person paying.
    await expect(as(b)('bookings.checkout', { bookingId: bea.booking.id })).rejects.toMatchObject({ code: 'payment_required' })
  })

  it('holds a fee until the coach’s payouts are back, then charges it, instead of blocking the cancellation', async () => {
    const coach = await makeProvider()
    await connectPayouts(coach)
    await as(coach)('provider.update', { lateCancelFeePct: 50 })
    const { sessionIds: [sessionId] } = await makeSeries(coach, { kind: 'private', capacity: 1, paymentRule: 'pay_after', priceCents: 8000 })
    await moveSessionSoon(sessionId)
    const maya = await makeUser('Maya')
    const booked = await as(maya)('bookings.create', { sessionId })
    await payCheckout(booked.checkoutUrl)
    await setPayouts(coach, false)
    await as(maya)('bookings.cancel', { bookingId: booked.booking.id })
    expect(await status(booked.booking.id)).toEqual({ status: 'late_cancelled', payment_status: 'due' })
    expect(await notificationsFor(coach.userId)).toContain('payouts.needed')
    expect(await runPaymentJobs(db)).toMatchObject({ charges: 0 }) // waits, without using up attempts

    await setPayouts(coach, true)
    expect(await runPaymentJobs(db)).toMatchObject({ charges: 1 })
    expect(await status(booked.booking.id)).toEqual({ status: 'late_cancelled', payment_status: 'paid' })
  })
})

describe('background jobs isolate failures', () => {
  it('completes other sessions when one fails, in a stable order', async () => {
    const coach = await makeProvider()
    const { sessionIds: [bad] } = await makeSeries(coach, { title: 'Bad' })
    const { sessionIds: [good] } = await makeSeries(coach, { title: 'Good', startTime: '08:00' })
    await startSession(bad, 6)
    await startSession(good, 5)
    await db.query(`CREATE FUNCTION fail_one() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'corrupt'; END $$ LANGUAGE plpgsql`)
    await db.query(`CREATE TRIGGER fail_one BEFORE UPDATE ON sessions FOR EACH ROW WHEN (OLD.id = '${bad}') EXECUTE FUNCTION fail_one()`)
    await completeSessions(db)
    expect(await db.query(`SELECT id, status FROM sessions WHERE id IN ($1, $2) ORDER BY status`, [bad, good]))
      .toEqual([{ id: good, status: 'completed' }, { id: bad, status: 'scheduled' }])
  })

  it('keeps running the remaining steps when one step fails', async () => {
    await db.query(`CREATE FUNCTION fail_one() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'corrupt'; END $$ LANGUAGE plpgsql`)
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    await startSession(sessionId, 6)
    await db.query(`CREATE TRIGGER fail_one BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION fail_one()`)
    const result = await JOBS.hourly()
    expect(result.completed).toBe(0) // the failing session is isolated inside the step
    expect(result).toHaveProperty('sessionsGenerated')
    expect(result).toHaveProperty('pruned')
  })
})
