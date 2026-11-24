// Payment and booking state move together, and every charge reaches a definite outcome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db'
import { getProcessor } from '@/server/modules/payments/processor'
import { applyProcessorEvent, runPaymentJobs } from '@/server/modules/payments/settlement'
import { resetDb } from '../helpers/db'
import { bookPayAfterPrivate, makePaidSeries, makeUser, notificationsFor, payCheckout, startSession } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)
afterEach(async () => {
  vi.restoreAllMocks()
  await db.query(`DROP TRIGGER IF EXISTS fail_booking ON bookings`)
  await db.query(`DROP FUNCTION IF EXISTS fail_booking()`)
})

const state = async (bookingId: string) => ({
  booking: (await db.query<{ payment_status: string }>(`SELECT payment_status FROM bookings WHERE id = $1`, [bookingId]))[0].payment_status,
  payments: await db.query<{ status: string; attempts: number }>(`SELECT status, attempts FROM payments WHERE booking_id = $1 AND mode = 'off_session'`, [bookingId]),
})

/** A pay-after private that has happened, with a saved card, ready to be charged. */
async function attendedPayAfter() {
  const booked = await bookPayAfterPrivate()
  await startSession(booked.sessionId)
  return booked
}

describe('off-session charges', () => {
  it('fails definitively after the last processor error, tells the player, and reconciles a late success', async () => {
    const processor = await getProcessor()
    vi.spyOn(processor, 'chargeOffSession').mockRejectedValue(new Error('timeout'))
    const { coach, maya, bookingId } = await attendedPayAfter()
    await as(coach)('bookings.attendance', { bookingId, outcome: 'attended' }) // attempt 1
    await runPaymentJobs(db) // attempt 2
    expect(await state(bookingId)).toEqual({ booking: 'due', payments: [{ status: 'pending', attempts: 2 }] })
    await runPaymentJobs(db) // attempt 3: out of attempts
    expect(await state(bookingId)).toEqual({ booking: 'failed', payments: [{ status: 'failed', attempts: 3 }] })
    expect(await notificationsFor(maya.userId)).toContain('payment.failed')
    expect(await runPaymentJobs(db)).toEqual({ refunds: 0, charges: 0 }) // nothing left pending forever

    // The processor had actually charged: its webhook settles the booking.
    const [{ id: paymentId }] = await db.query<{ id: string }>(`SELECT id FROM payments WHERE booking_id = $1 AND mode = 'off_session'`, [bookingId])
    await applyProcessorEvent(db, 'evt_late', { type: 'payment.succeeded', paymentId, paymentIntentId: 'pi_late' }, 'stripe')
    expect(await state(bookingId)).toEqual({ booking: 'paid', payments: [{ status: 'succeeded', attempts: 3 }] })
  })

  it('keeps a charge whose success webhook arrived before our own result', async () => {
    const processor = await getProcessor()
    vi.spyOn(processor, 'chargeOffSession').mockImplementation(async ({ paymentId }) => {
      await applyProcessorEvent(db, 'evt_first', { type: 'payment.succeeded', paymentId, paymentIntentId: 'pi_race' }, 'stripe')
      return { ok: true, paymentIntentId: 'pi_race' }
    })
    const refund = vi.spyOn(processor, 'refund')
    const { coach, bookingId } = await attendedPayAfter()
    await as(coach)('bookings.attendance', { bookingId, outcome: 'attended' })
    expect(await state(bookingId)).toMatchObject({ booking: 'paid', payments: [{ status: 'succeeded' }] })
    expect(refund).not.toHaveBeenCalled()
  })

  it('ignores a late success for a payment that is already final', async () => {
    const { coach, bookingId } = await attendedPayAfter()
    await as(coach)('bookings.attendance', { bookingId, outcome: 'attended' })
    const [{ id: paymentId, i }] = await db.query<{ id: string; i: string }>(`SELECT id, payment_intent_id AS i FROM payments WHERE booking_id = $1 AND mode = 'off_session'`, [bookingId])
    await applyProcessorEvent(db, 'evt_refund', { type: 'payment.refunded', paymentIntentId: i, refundedCents: 9000 }, 'stripe')
    await applyProcessorEvent(db, 'evt_late', { type: 'payment.succeeded', paymentId, paymentIntentId: i }, 'stripe')
    expect(await state(bookingId)).toMatchObject({ booking: 'refunded', payments: [{ status: 'refunded' }] })
  })

  it('refunds a late success for a balance the coach marked paid in cash, and keeps it paid in cash', async () => {
    const processor = await getProcessor()
    vi.spyOn(processor, 'chargeOffSession').mockRejectedValue(new Error('timeout'))
    const { coach, bookingId } = await attendedPayAfter()
    await as(coach)('bookings.attendance', { bookingId, outcome: 'attended' })
    await as(coach)('bookings.markPaid', { bookingId })
    const [{ id: paymentId }] = await db.query<{ id: string }>(`SELECT id FROM payments WHERE booking_id = $1 AND mode = 'off_session'`, [bookingId])
    const refund = vi.spyOn(processor, 'refund')
    await applyProcessorEvent(db, 'evt_late', { type: 'payment.succeeded', paymentId, paymentIntentId: 'pi_late' }, 'stripe')
    expect((await state(bookingId)).booking).toBe('paid_external')
    expect(refund).toHaveBeenCalledWith('pi_late', 9000, expect.any(String))
  })

  it('rolls the payment update back if the booking update fails, so they never disagree', async () => {
    const { coach, bookingId } = await attendedPayAfter()
    await db.query(`CREATE FUNCTION fail_booking() RETURNS trigger AS $$ BEGIN IF NEW.payment_status = 'paid' THEN RAISE EXCEPTION 'crash'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    await db.query(`CREATE TRIGGER fail_booking BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION fail_booking()`)
    await as(coach)('bookings.attendance', { bookingId, outcome: 'attended' }).catch(() => undefined)
    const after = await state(bookingId)
    expect(after.payments[0].status).toBe('pending') // not 'succeeded' with the booking still 'due'
    await db.query(`DROP TRIGGER fail_booking ON bookings`)
    await runPaymentJobs(db)
    expect(await state(bookingId)).toMatchObject({ booking: 'paid', payments: [{ status: 'succeeded' }] })
  })
})

describe('refund and dispute webhooks update the booking', () => {
  it('marks refunded and disputed bookings', async () => {
    const { sessionIds: [a, b] } = await makePaidSeries({ repeatWeekdays: [0, 1, 2, 3, 4, 5, 6] })
    const maya = await makeUser('Maya')
    const first = await as(maya)('bookings.create', { sessionId: a })
    await payCheckout(first.checkoutUrl)
    const second = await as(maya)('bookings.create', { sessionId: b })
    await payCheckout(second.checkoutUrl)
    const intent = async (bookingId: string) => (await db.query<{ i: string }>(`SELECT payment_intent_id AS i FROM payments WHERE booking_id = $1`, [bookingId]))[0].i
    await applyProcessorEvent(db, 'evt_r', { type: 'payment.refunded', paymentIntentId: await intent(first.booking.id), refundedCents: 4000 }, 'stripe')
    await applyProcessorEvent(db, 'evt_d', { type: 'payment.disputed', paymentIntentId: await intent(second.booking.id) }, 'stripe')
    const statuses = await db.query<{ id: string; payment_status: string }>(`SELECT id, payment_status FROM bookings WHERE id IN ($1, $2)`, [first.booking.id, second.booking.id])
    expect(Object.fromEntries(statuses.map((r) => [r.id, r.payment_status]))).toEqual({ [first.booking.id]: 'refunded', [second.booking.id]: 'disputed' })
  })
})
