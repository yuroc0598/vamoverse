import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db'
import { getProcessor } from '@/server/modules/payments/processor'
import { applyProcessorEvent, runPaymentJobs } from '@/server/modules/payments/settlement'
import { simulate } from '@/server/modules/payments/simulator'
import { resetDb } from '../helpers/db'
import { makePaidSeries, makeProvider, makeSeries, makeUser, payCheckout } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

describe('payouts and plans', () => {
  it('requires payout onboarding before card payments and reflects processor status', async () => {
    const coach = await makeProvider()
    expect(await as(coach)('provider.settings', {})).toMatchObject({ chargesEnabled: false })
    const { url } = await as(coach)('payouts.connect', {})
    expect(url).toContain('action=connect')
    await simulate(db, 'connect', coach.providerId)
    expect(await as(coach)('provider.settings', {})).toMatchObject({ chargesEnabled: true, payoutsEnabled: true })
    expect(await as(coach)('payouts.refresh', {})).toEqual({ chargesEnabled: true, payoutsEnabled: true })
  })

  it('charges the platform fee on Free and none on Pro, switching both ways', async () => {
    const { coach, sessionIds } = await makePaidSeries({ priceCents: 10000, capacity: 5, repeatWeekdays: [0, 1, 2, 3, 4, 5, 6] })
    const maya = await makeUser('Maya')
    const fee = async (sessionId: string) => {
      const booked = await as(maya)('bookings.create', { sessionId })
      await payCheckout(booked.checkoutUrl)
      return (await db.query<{ fee: number }>(`SELECT platform_fee_cents AS fee FROM payments WHERE booking_id = $1`, [booked.booking.id]))[0].fee
    }
    expect(await fee(sessionIds[0])).toBe(200)
    expect((await as(coach)('plan.get', {})).current).toBe('free')
    await simulate(db, 'subscribe', coach.providerId)
    expect(await as(coach)('plan.get', {})).toMatchObject({ current: 'pro', status: 'active' })
    expect(await fee(sessionIds[1])).toBe(0)
    await simulate(db, 'cancel_subscription', coach.providerId)
    expect((await as(coach)('plan.get', {})).current).toBe('free')
    expect(await fee(sessionIds[2])).toBe(200)
  })
})

describe('settlement', () => {
  it('applies each processor event once', async () => {
    const coach = await makeProvider()
    await as(coach)('payouts.connect', {})
    const accountId = (await db.query<{ a: string }>(`SELECT stripe_account_id AS a FROM providers WHERE id = $1`, [coach.providerId]))[0].a
    const event = { type: 'account.updated' as const, accountId, chargesEnabled: true, payoutsEnabled: false }
    expect(await applyProcessorEvent(db, 'evt_1', event, 'stripe')).toBe('processed')
    expect(await applyProcessorEvent(db, 'evt_1', { ...event, chargesEnabled: false }, 'stripe')).toBe('duplicate')
    expect(await as(coach)('provider.settings', {})).toMatchObject({ chargesEnabled: true, payoutsEnabled: false })
  })

  it('keeps a requested refund until the processor accepts it', async () => {
    const { sessionIds: [sessionId] } = await makePaidSeries({ priceCents: 4000 })
    const maya = await makeUser('Maya')
    const booked = await as(maya)('bookings.create', { sessionId })
    await payCheckout(booked.checkoutUrl)
    const processor = await getProcessor()
    const refund = vi.spyOn(processor, 'refund').mockRejectedValueOnce(new Error('processor down'))
    await as(maya)('bookings.cancel', { bookingId: booked.booking.id })
    expect(await db.query(`SELECT refund_requested_cents AS req, refunded_cents AS done FROM payments WHERE booking_id = $1`, [booked.booking.id]))
      .toEqual([{ req: 4000, done: 0 }])
    expect(await runPaymentJobs(db)).toEqual({ refunds: 1, charges: 0 })
    expect(await db.query(`SELECT refunded_cents AS done, status FROM payments WHERE booking_id = $1`, [booked.booking.id]))
      .toEqual([{ done: 4000, status: 'refunded' }])
    expect(refund).toHaveBeenCalledTimes(2)
    refund.mockRestore()
  })

  it('summarizes money for the coach', async () => {
    const { coach, sessionIds: [paidSession] } = await makePaidSeries({ priceCents: 5000 })
    const { sessionIds: [cashSession] } = await makeSeries(coach, { paymentRule: 'external', priceCents: 3000, startTime: '08:00' })
    const maya = await makeUser('Maya')
    await payCheckout((await as(maya)('bookings.create', { sessionId: paidSession })).checkoutUrl)
    await as(maya)('bookings.create', { sessionId: cashSession })
    const summary = await as(coach)('money.summary', {})
    expect(summary).toMatchObject({ collectedCents: 5000, feesCents: 100, owedCents: 3000 })
    expect(summary.recent).toHaveLength(1)
    expect((await as(maya)('payments.mine', {})).card).toMatchObject({ last4: '4242' })
  })
})
