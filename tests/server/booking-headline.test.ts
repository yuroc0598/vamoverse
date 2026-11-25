// The booking page's headline comes from the server (bookings.get), so the web page and the native
// app say the same thing for every status.
import { beforeEach, describe, expect, it } from 'vitest'
import { bookingHeadline } from '@/server/modules/bookings/headline'
import type { Booking } from '@/server/modules/bookings/engine'
import type { SessionView } from '@/server/modules/schedule/sessions'
import { resetDb } from '../helpers/db'
import { makePaidSeries, makeUser, payCheckout } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

const session = { timezone: 'America/Los_Angeles', providerName: 'Alex Rivera' } as SessionView
const at = '2026-12-02T02:00:00.000Z' // Tue, Dec 1, 6:00 PM in Los Angeles
const headline = (overrides: Partial<Booking>) =>
  bookingHeadline({ status: 'confirmed', paymentStatus: 'paid', paymentRule: 'pay_now', holdExpiresAt: null, offerExpiresAt: null, ...overrides } as Booking, session)

describe('booking headline', () => {
  it('covers every status with the web page’s wording', () => {
    expect(headline({})).toEqual({ tone: 'good', title: 'You’re booked', body: null })
    expect(headline({ paymentStatus: 'due', paymentRule: 'pay_after' }).title).toBe('Booked; you’ll be charged after the session')
    expect(headline({ status: 'attended', paymentStatus: 'failed' })).toEqual({ tone: 'good', title: 'Session completed', body: 'The payment didn’t go through. Update your card below.' })
    expect(headline({ status: 'held', holdExpiresAt: new Date(at) })).toEqual({ tone: 'wait', title: 'Finish paying to confirm', body: 'Your spot is held until Tue, Dec 1, 6:00 PM.' })
    expect(headline({ status: 'held', paymentRule: 'pay_after' }).title).toBe('Save a card to confirm')
    expect(headline({ status: 'held' }).body).toBe('Your spot is held until soon.')
    expect(headline({ status: 'offered', offerExpiresAt: new Date(at) })).toEqual({ tone: 'wait', title: 'A spot opened for you', body: 'Claim it by Tue, Dec 1, 6:00 PM.' })
    expect(headline({ status: 'invited', offerExpiresAt: new Date(at) })).toEqual({ tone: 'wait', title: 'Alex Rivera added you', body: 'Confirm by Tue, Dec 1, 6:00 PM.' })
    expect(headline({ status: 'requested' }).title).toBe('Waiting for the coach to confirm')
    expect(headline({ status: 'waitlisted' }).title).toBe('You’re on the waitlist')
    expect(headline({ status: 'no_show' })).toEqual({ tone: 'bad', title: 'Marked as a no-show', body: null })
    expect(headline({ status: 'declined' }).body).toBe('Check the coach’s page for other times.')
    expect(headline({ status: 'expired', paymentStatus: 'refunded' }).body).toBe('The spot was taken; you were refunded in full.')
    expect(headline({ status: 'expired', paymentStatus: 'none' }).body).toBe('Book again any time.')
    expect(headline({ status: 'cancelled', paymentStatus: 'refunded' })).toEqual({ tone: 'bad', title: 'Cancelled', body: 'Refunded.' })
    expect(headline({ status: 'late_cancelled', paymentStatus: 'paid' })).toEqual({ tone: 'bad', title: 'Cancelled', body: null })
  })

  it('is returned by bookings.get and follows the booking through payment and cancellation', async () => {
    const { sessionIds: [sessionId] } = await makePaidSeries()
    const maya = await makeUser('Maya')
    const booked = await as(maya)('bookings.create', { sessionId })
    const held = await as(maya)('bookings.get', { bookingId: booked.booking.id })
    expect(held.headline).toMatchObject({ tone: 'wait', title: 'Finish paying to confirm' })
    expect(held.headline.body).toMatch(/^Your spot is held until \w{3}, \w{3} \d+, \d+:\d{2} [AP]M\.$/)
    await payCheckout(booked.checkoutUrl)
    expect((await as(maya)('bookings.get', { bookingId: booked.booking.id })).headline).toEqual({ tone: 'good', title: 'You’re booked', body: null })
    await as(maya)('bookings.cancel', { bookingId: booked.booking.id })
    expect((await as(maya)('bookings.get', { bookingId: booked.booking.id })).headline).toEqual({ tone: 'bad', title: 'Cancelled', body: 'Refunded.' })
  })
})
