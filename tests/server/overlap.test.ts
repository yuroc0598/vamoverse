// A coach is never double-booked, whichever path fills a seat or moves a session.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { expireHolds } from '@/server/modules/bookings/engine'
import { resetDb } from '../helpers/db'
import { connectPayouts, forceBooking, makeProvider, makeSeries, makeUser, payCheckout } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

const status = async (id: string) => (await db.query<{ status: string; payment_status: string }>(`SELECT status, payment_status FROM bookings WHERE id = $1`, [id]))[0]

/** Two overlapping one-on-one slots for the same coach: 4:00–5:00 and 4:30–5:30. */
async function overlappingSlots(paymentRule: 'free' | 'pay_now' = 'free', levels = false) {
  const coach = await makeProvider('Sam', { coaching: true, hitting: true })
  if (paymentRule !== 'free') await connectPayouts(coach)
  const price = paymentRule === 'free' ? { priceCents: 0 } : { priceCents: 5000 }
  const level = levels ? { levelSystem: 'ntrp', levelMin: 4, levelMax: 5 } : {}
  const { sessionIds: [first] } = await makeSeries(coach, { kind: 'hitting', capacity: 1, startTime: '16:00', paymentRule, ...price })
  const { sessionIds: [second] } = await makeSeries(coach, { kind: 'private', capacity: 1, startTime: '16:30', paymentRule, ...price, ...level })
  return { coach, first, second }
}

describe('no double-booking', () => {
  it('does not promote the waitlist into a slot that overlaps another booking', async () => {
    // Not reachable through the app (the overlapping slot can't be booked while this one is
    // full); this guards data written before the rule, so the state is set up directly.
    const { first, second } = await overlappingSlots()
    const [a, b, e] = await Promise.all([makeUser('A'), makeUser('B'), makeUser('E')])
    const onSecond = await as(a)('bookings.create', { sessionId: second })
    const waiting = await as(b)('bookings.create', { sessionId: second })
    expect(waiting.booking.status).toBe('waitlisted')
    await forceBooking(first, e)
    await as(a)('bookings.cancel', { bookingId: onSecond.booking.id })
    expect(await status(waiting.booking.id)).toMatchObject({ status: 'waitlisted' })
  })

  it('refuses to approve a request into an overlapping slot', async () => {
    const { coach, first, second } = await overlappingSlots('free', true)
    const [a, b] = await Promise.all([makeUser('A'), makeUser('B')])
    const request = await as(a)('bookings.create', { sessionId: second }) // unrated → request
    expect(request.booking.status).toBe('requested')
    await as(b)('bookings.create', { sessionId: first })
    await expect(as(coach)('bookings.approve', { bookingId: request.booking.id })).rejects.toThrow('already have a booked session')
  })

  it('refunds a late payment instead of reviving a hold into an overlapping slot', async () => {
    const { first, second } = await overlappingSlots('pay_now')
    const [a, b] = await Promise.all([makeUser('A'), makeUser('B')])
    const held = await as(a)('bookings.create', { sessionId: second })
    await db.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [held.booking.id])
    await expireHolds(db)
    const other = await as(b)('bookings.create', { sessionId: first })
    await payCheckout(other.checkoutUrl)
    await payCheckout(held.checkoutUrl)
    expect(await status(held.booking.id)).toEqual({ status: 'expired', payment_status: 'refunded' })
  })

  it('refuses to move a booked session on top of another booked session', async () => {
    const coach = await makeProvider()
    const { sessionIds: [morning] } = await makeSeries(coach, { startTime: '09:00' })
    const { sessionIds: [evening] } = await makeSeries(coach, { startTime: '18:00' })
    const { sessionIds: [empty] } = await makeSeries(coach, { startTime: '12:00' })
    const [a, b] = await Promise.all([makeUser('A'), makeUser('B')])
    await as(a)('bookings.create', { sessionId: morning })
    await as(b)('bookings.create', { sessionId: evening })
    await expect(as(coach)('sessions.update', { sessionId: evening, startTime: '09:30' })).rejects.toThrow('overlaps another booked session')
    await expect(as(coach)('sessions.update', { sessionId: empty, startTime: '09:30' })).resolves.toMatchObject({ moved: true })
  })
})
