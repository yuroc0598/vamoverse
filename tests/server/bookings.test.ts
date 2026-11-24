import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { completeSessions, expireHolds } from '@/server/modules/bookings/engine'
import { runEffects } from '@/server/modules/payments/settlement'
import { resetDb } from '../helpers/db'
import { connectPayouts, inDays, makePaidSeries, makeProvider, makeSeries, makeUser, moveSessionSoon, notificationsFor, payCheckout, startSession, verifySafety } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

const status = async (bookingId: string) =>
  (await db.query<{ status: string; payment_status: string }>(`SELECT status, payment_status FROM bookings WHERE id = $1`, [bookingId]))[0]

describe('concurrency', () => {
  it('never overbooks when many players book the last seats at once', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach, { capacity: 2 })
    const players = await Promise.all(Array.from({ length: 8 }, (_, i) => makeUser(`P${i}`)))
    const results = await Promise.all(players.map((p) => as(p)('bookings.create', { sessionId })))
    expect(results.filter((r) => r.booking.status === 'confirmed')).toHaveLength(2)
    expect(results.filter((r) => r.booking.status === 'waitlisted')).toHaveLength(6)
  })
})

describe('free sessions and the waitlist', () => {
  it('confirms, is idempotent, waitlists when full, and promotes on cancellation', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach, { capacity: 2 })
    const [a, b, c] = await Promise.all([makeUser('Ann'), makeUser('Bea'), makeUser('Cat')])
    const first = await as(a)('bookings.create', { sessionId })
    expect(first).toMatchObject({ booking: { status: 'confirmed', paymentStatus: 'none' }, checkoutUrl: null })
    expect((await as(a)('bookings.create', { sessionId })).booking.id).toBe(first.booking.id)
    await as(b)('bookings.create', { sessionId })
    const waiting = await as(c)('bookings.create', { sessionId })
    expect(waiting.booking.status).toBe('waitlisted')
    expect(waiting.message).toMatch(/waitlist/)

    await as(a)('bookings.cancel', { bookingId: first.booking.id })
    expect(await status(waiting.booking.id)).toMatchObject({ status: 'confirmed' })
    expect(await notificationsFor(c.userId)).toContain('waitlist.confirmed')
    expect(await notificationsFor(coach.userId)).toEqual(expect.arrayContaining(['booking.new', 'booking.cancelled']))
    expect((await as(coach)('sessions.roster', { sessionId })).map((r) => [r.playerName, r.status]))
      .toEqual([['Bea', 'confirmed'], ['Cat', 'confirmed'], ['Ann', 'cancelled']])
  })

  it('hides invitation-only and students-only sessions from others', async () => {
    const coach = await makeProvider()
    const { sessionIds: [inviteOnly] } = await makeSeries(coach, { visibility: 'invite' })
    const { sessionIds: [studentsOnly] } = await makeSeries(coach, { visibility: 'clients', startTime: '08:00' })
    const maya = await makeUser('Maya')
    await expect(as(maya)('bookings.create', { sessionId: inviteOnly })).rejects.toThrow('invitation')
    await expect(as(maya)('bookings.create', { sessionId: studentsOnly })).rejects.toThrow('current students')
    const { sessionIds: [open] } = await makeSeries(coach, { startTime: '12:00' })
    await as(maya)('bookings.create', { sessionId: open }) // becomes a client
    await expect(as(maya)('bookings.create', { sessionId: studentsOnly })).resolves.toMatchObject({ booking: { status: 'confirmed' } })
  })
})

describe('pay when booking', () => {
  it('holds the seat, confirms on payment with the plan fee, and refunds per the cancellation policy', async () => {
    const { coach, sessionIds: [early] } = await makePaidSeries({ startDate: inDays(5) })
    const { sessionIds: [soon] } = await makeSeries(coach, { paymentRule: 'pay_now', priceCents: 4000, startDate: inDays(3), startTime: '07:00' })
    await moveSessionSoon(soon)
    const maya = await makeUser('Maya')

    const booked = await as(maya)('bookings.create', { sessionId: early })
    expect(booked.booking.status).toBe('held')
    expect(booked.checkoutUrl).toContain('/dev/simulate?action=checkout')
    await payCheckout(booked.checkoutUrl)
    expect(await status(booked.booking.id)).toEqual({ status: 'confirmed', payment_status: 'paid' })
    const [payment] = await db.query(`SELECT amount_cents, platform_fee_cents, status FROM payments WHERE booking_id = $1`, [booked.booking.id])
    expect(payment).toEqual({ amount_cents: 4000, platform_fee_cents: 80, status: 'succeeded' })
    expect(await db.query(`SELECT last4 FROM payment_methods WHERE user_id = $1`, [maya.userId])).toEqual([{ last4: '4242' }])

    const detail = await as(maya)('bookings.get', { bookingId: booked.booking.id })
    expect(detail.cancelTerms?.summary).toBe('Full refund of $40.')
    const cancelled = await as(maya)('bookings.cancel', { bookingId: booked.booking.id })
    expect(cancelled.summary).toBe('Full refund of $40.')
    expect(await db.query(`SELECT refunded_cents, status FROM payments WHERE booking_id = $1`, [booked.booking.id])).toEqual([{ refunded_cents: 4000, status: 'refunded' }])

    // Inside the 24h window: 50% late-cancel fee kept, the rest refunded.
    const late = await as(maya)('bookings.create', { sessionId: soon })
    await payCheckout(late.checkoutUrl)
    const lateCancel = await as(maya)('bookings.cancel', { bookingId: late.booking.id })
    expect(lateCancel.summary).toBe('Late cancellation: $20 back (50% fee).')
    expect(await status(late.booking.id)).toMatchObject({ status: 'late_cancelled' })
    expect(await db.query(`SELECT refunded_cents, status FROM payments WHERE booking_id = $1`, [late.booking.id])).toEqual([{ refunded_cents: 2000, status: 'partially_refunded' }])
    expect(await as(maya)('bookings.get', { bookingId: late.booking.id })).toMatchObject({ booking: { paymentStatus: 'paid' }, refundedCents: 2000 })
  })

  it('offers freed seats to the waitlist, expires unclaimed offers, and refunds payments that arrive too late', async () => {
    const { sessionIds: [sessionId] } = await makePaidSeries({ priceCents: 3000, capacity: 1 })
    const [a, b, c] = await Promise.all([makeUser('Ann'), makeUser('Bea'), makeUser('Cat')])
    const ann = await as(a)('bookings.create', { sessionId })
    await payCheckout(ann.checkoutUrl)
    const bea = await as(b)('bookings.create', { sessionId })
    const cat = await as(c)('bookings.create', { sessionId })
    expect([bea.booking.status, cat.booking.status]).toEqual(['waitlisted', 'waitlisted'])

    await as(a)('bookings.cancel', { bookingId: ann.booking.id })
    expect(await status(bea.booking.id)).toMatchObject({ status: 'offered' })
    expect(await notificationsFor(b.userId)).toContain('waitlist.offered')
    const beaCheckout = await as(b)('bookings.checkout', { bookingId: bea.booking.id })

    // Bea doesn't claim in time: the offer moves to Cat.
    await db.query(`UPDATE bookings SET offer_expires_at = now() - interval '1 minute' WHERE id = $1`, [bea.booking.id])
    expect(await expireHolds(db)).toBe(1)
    expect(await status(bea.booking.id)).toMatchObject({ status: 'expired' })
    expect(await status(cat.booking.id)).toMatchObject({ status: 'offered' })
    const catCheckout = await as(c)('bookings.checkout', { bookingId: cat.booking.id })
    await payCheckout(catCheckout.checkoutUrl)
    expect(await status(cat.booking.id)).toEqual({ status: 'confirmed', payment_status: 'paid' })

    // Bea finishes her old checkout after all: the seat is gone, so she is refunded automatically.
    await payCheckout(beaCheckout.checkoutUrl)
    expect(await status(bea.booking.id)).toEqual({ status: 'expired', payment_status: 'refunded' })
    expect(await notificationsFor(b.userId)).toContain('booking.refunded')
  })

  it('releases unpaid holds', async () => {
    const { sessionIds: [sessionId] } = await makePaidSeries({ priceCents: 3000, capacity: 1 })
    const maya = await makeUser('Maya')
    const held = await as(maya)('bookings.create', { sessionId })
    await db.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [held.booking.id])
    await expireHolds(db)
    expect(await status(held.booking.id)).toMatchObject({ status: 'expired' })
    expect(await db.query(`SELECT status FROM payments WHERE booking_id = $1`, [held.booking.id])).toEqual([{ status: 'canceled' }])
    const sam = await makeUser('Sam')
    expect((await as(sam)('bookings.create', { sessionId })).booking.status).toBe('held')
  })
})

describe('pay after the session', () => {
  it('saves a card once, charges after attendance, and reports declines', async () => {
    const { coach, sessionIds } = await makePaidSeries({ paymentRule: 'pay_after', priceCents: 9000, kind: 'private', capacity: 1, repeatWeekdays: [0, 1, 2, 3, 4, 5, 6] })
    const maya = await makeUser('Maya')
    const first = await as(maya)('bookings.create', { sessionId: sessionIds[0] })
    expect(first.booking.status).toBe('held')
    await payCheckout(first.checkoutUrl) // saves the card, no charge yet
    expect(await status(first.booking.id)).toEqual({ status: 'confirmed', payment_status: 'due' })
    const second = await as(maya)('bookings.create', { sessionId: sessionIds[1] })
    expect(second).toMatchObject({ booking: { status: 'confirmed', paymentStatus: 'due' }, checkoutUrl: null })

    await startSession(sessionIds[0])
    await as(coach)('bookings.attendance', { bookingId: first.booking.id, outcome: 'attended' })
    expect(await status(first.booking.id)).toEqual({ status: 'attended', payment_status: 'paid' })

    // A declined card is surfaced to both sides.
    await db.query(`UPDATE payment_methods SET id = id || '0002' WHERE user_id = $1`, [maya.userId])
    await startSession(sessionIds[1], 4)
    const effects = await completeSessions(db)
    await runEffects(db, effects)
    expect(await status(second.booking.id)).toEqual({ status: 'attended', payment_status: 'failed' })
    expect(await notificationsFor(maya.userId)).toContain('payment.failed')
    expect((await as(coach)('money.summary', {})).owed.map((o) => o.bookingId)).toEqual([second.booking.id])
  })

  it('charges no-show and late-cancel fees from the policy, and lets the coach waive them', async () => {
    const coach = await makeProvider()
    await connectPayouts(coach)
    await as(coach)('provider.update', { cancelWindowHours: 168, noShowFeePct: 100, lateCancelFeePct: 50 })
    const { sessionIds } = await makeSeries(coach, { paymentRule: 'pay_after', priceCents: 8000, kind: 'private', capacity: 1, repeatWeekdays: [0, 1, 2, 3, 4, 5, 6] })
    const maya = await makeUser('Maya')
    const a = await as(maya)('bookings.create', { sessionId: sessionIds[0] })
    await payCheckout(a.checkoutUrl)
    const b = await as(maya)('bookings.create', { sessionId: sessionIds[1] })
    const c = await as(maya)('bookings.create', { sessionId: sessionIds[2] })

    const lateCancel = await as(maya)('bookings.cancel', { bookingId: b.booking.id })
    expect(lateCancel.summary).toBe('Late cancellation fee: $40.')
    expect(await db.query(`SELECT amount_cents, status FROM payments WHERE booking_id = $1 AND purpose = 'late_cancel_fee'`, [b.booking.id])).toEqual([{ amount_cents: 4000, status: 'succeeded' }])

    await startSession(sessionIds[0])
    await as(coach)('bookings.attendance', { bookingId: a.booking.id, outcome: 'no_show' })
    expect(await db.query(`SELECT amount_cents FROM payments WHERE booking_id = $1 AND purpose = 'no_show_fee'`, [a.booking.id])).toEqual([{ amount_cents: 8000 }])

    await startSession(sessionIds[2], 2)
    await as(coach)('bookings.attendance', { bookingId: c.booking.id, outcome: 'no_show', waiveFee: true })
    expect(await status(c.booking.id)).toEqual({ status: 'no_show', payment_status: 'waived' })
  })
})

describe('packages and credits', () => {
  it('spends a credit instead of charging, returns it on early cancel, keeps it on late cancel', async () => {
    const coach = await makeProvider()
    await connectPayouts(coach)
    await as(coach)('provider.update', { cancelWindowHours: 24 })
    const pkg = await as(coach)('packages.save', { name: '5 clinics', credits: 5, priceCents: 15000, kinds: ['group'] })
    const maya = await makeUser('Maya')
    const { checkoutUrl } = await as(maya)('packages.buy', { packageId: pkg.id })
    await payCheckout(checkoutUrl)
    expect(await as(maya)('credits.mine', {})).toEqual([expect.objectContaining({ creditsTotal: 5, creditsUsed: 0, status: 'active' })])

    const { sessionIds: [later] } = await makeSeries(coach, { paymentRule: 'pay_now', priceCents: 4000, acceptsCredits: true, startDate: inDays(4) })
    const { sessionIds: [soon] } = await makeSeries(coach, { paymentRule: 'pay_now', priceCents: 4000, acceptsCredits: true, startDate: inDays(3), startTime: '07:00' })
    await moveSessionSoon(soon)
    const early = await as(maya)('bookings.create', { sessionId: later })
    expect(early).toMatchObject({ booking: { status: 'confirmed', paymentStatus: 'credit' }, checkoutUrl: null })
    await as(maya)('bookings.cancel', { bookingId: early.booking.id })
    const late = await as(maya)('bookings.create', { sessionId: soon })
    await as(maya)('bookings.cancel', { bookingId: late.booking.id })
    expect((await as(maya)('credits.mine', {}))[0]).toMatchObject({ creditsUsed: 1 })
    const noCredit = await as(maya)('bookings.create', { sessionId: later, useCredit: false })
    expect(noCredit.booking.status).toBe('held')
  })
})

describe('eligibility', () => {
  it('turns out-of-range or unrated players into requests the coach approves', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach, { levelSystem: 'ntrp', levelMin: 3.5, levelMax: 4.5 })
    const [rated, unrated] = await Promise.all([makeUser('Rated'), makeUser('Unrated')])
    await as(rated)('players.update', { playerId: rated.playerId, ntrp: 4 })
    expect((await as(rated)('bookings.create', { sessionId })).booking.status).toBe('confirmed')
    const request = await as(unrated)('bookings.create', { sessionId })
    expect(request).toMatchObject({ booking: { status: 'requested' } })
    expect(await notificationsFor(coach.userId)).toContain('booking.requested')
    await as(coach)('bookings.approve', { bookingId: request.booking.id })
    expect(await status(request.booking.id)).toMatchObject({ status: 'confirmed' })
  })

  it('keeps mixed doubles balanced and gendered sessions to the right players', async () => {
    const coach = await makeProvider()
    const { sessionIds: [mixed] } = await makeSeries(coach, { discipline: 'mixed_doubles', capacity: 4 })
    const players = await Promise.all(['W1', 'W2', 'W3', 'M1', 'Unset'].map((n) => makeUser(n)))
    for (const [i, gender] of (['female', 'female', 'female', 'male'] as const).entries()) {
      await as(players[i])('players.update', { playerId: players[i].playerId, gender })
    }
    await as(players[0])('bookings.create', { sessionId: mixed })
    await as(players[1])('bookings.create', { sessionId: mixed })
    await expect(as(players[2])('bookings.create', { sessionId: mixed })).rejects.toThrow('women’s spots')
    await expect(as(players[3])('bookings.create', { sessionId: mixed })).resolves.toMatchObject({ booking: { status: 'confirmed' } })
    await expect(as(players[4])('bookings.create', { sessionId: mixed })).rejects.toThrow('Add your gender')
  })

  it('lets guardians book juniors into junior sessions only', async () => {
    const coach = await makeProvider()
    await verifySafety(coach)
    const { sessionIds: [adults] } = await makeSeries(coach)
    const { sessionIds: [juniors] } = await makeSeries(coach, { audience: 'juniors', startTime: '15:00' })
    const dave = await makeUser('Dave')
    const leo = await as(dave)('family.addJunior', { displayName: 'Leo', birthDate: '2016-05-01', signatureName: 'Dave', consent: true })
    await expect(as(dave)('bookings.create', { sessionId: adults, playerId: leo.id })).rejects.toThrow('for adults')
    await expect(as(dave)('bookings.create', { sessionId: juniors })).rejects.toThrow('for juniors')
    const booked = await as(dave)('bookings.create', { sessionId: juniors, playerId: leo.id })
    expect(booked.booking).toMatchObject({ status: 'confirmed', bookedByUserId: dave.userId })
    const stranger = await makeUser('Stranger')
    await expect(as(stranger)('bookings.create', { sessionId: juniors, playerId: leo.id })).rejects.toMatchObject({ code: 'forbidden' })
    expect((await as(dave)('bookings.mine', {})).map((b) => b.playerName)).toEqual(['Leo'])
  })
})

describe('coach actions', () => {
  it('books a student into every future session and the student can decline one', async () => {
    const { coach, sessionIds } = await makePaidSeries({ kind: 'private', capacity: 1, priceCents: 9000, repeatWeekdays: [new Date().getDay()], startDate: inDays(1) })
    const maya = await makeUser('Maya')
    await expect(as(coach)('bookings.addPlayer', { sessionId: sessionIds[0], playerId: maya.playerId })).rejects.toMatchObject({ code: 'not_found' })
    const { sessionIds: [intro] } = await makeSeries(coach, { startTime: '07:00' })
    await as(maya)('bookings.create', { sessionId: intro })

    const result = await as(coach)('bookings.addPlayer', { sessionId: sessionIds[0], playerId: maya.playerId, allFuture: true })
    expect(result.added).toBe(sessionIds.length)
    const mine = await as(maya)('bookings.mine', {})
    expect(mine.filter((b) => b.status === 'invited')).toHaveLength(sessionIds.length)
    expect(await notificationsFor(maya.userId)).toContain('booking.invited')
    const invite = mine.find((b) => b.status === 'invited')!
    await as(maya)('bookings.declineInvite', { bookingId: invite.id })
    expect(await status(invite.id)).toMatchObject({ status: 'declined' })
  })

  it('rains out a day: cancels sessions, refunds payments, returns credits, notifies everyone', async () => {
    const coach = await makeProvider()
    await connectPayouts(coach)
    const pkg = await as(coach)('packages.save', { name: '5 clinics', credits: 5, priceCents: 15000, kinds: ['group'] })
    const day = inDays(3)
    const { sessionIds: [morning] } = await makeSeries(coach, { paymentRule: 'pay_now', priceCents: 4000, acceptsCredits: true, startDate: day, startTime: '09:00' })
    const { sessionIds: [evening] } = await makeSeries(coach, { startDate: day, startTime: '18:00' })
    const [payer, creditUser, freeUser] = await Promise.all([makeUser('Payer'), makeUser('Credit'), makeUser('Free')])
    const paid = await as(payer)('bookings.create', { sessionId: morning })
    await payCheckout(paid.checkoutUrl)
    await payCheckout((await as(creditUser)('packages.buy', { packageId: pkg.id })).checkoutUrl)
    const credited = await as(creditUser)('bookings.create', { sessionId: morning })
    await as(freeUser)('bookings.create', { sessionId: evening })

    expect(await as(coach)('sessions.cancelDay', { date: day, reason: 'Rain' })).toEqual({ cancelled: 2, notified: 3 })
    expect(await status(paid.booking.id)).toEqual({ status: 'cancelled', payment_status: 'refunded' })
    expect(await db.query(`SELECT refunded_cents FROM payments WHERE booking_id = $1`, [paid.booking.id])).toEqual([{ refunded_cents: 4000 }])
    expect(await status(credited.booking.id)).toEqual({ status: 'cancelled', payment_status: 'refunded' })
    expect((await as(creditUser)('credits.mine', {}))[0].creditsUsed).toBe(0)
    for (const user of [payer, creditUser, freeUser]) expect(await notificationsFor(user.userId)).toContain('session.cancelled')
  })

  it('tells booked players when a session moves, and records cash payments', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach, { paymentRule: 'external', priceCents: 5000 })
    const maya = await makeUser('Maya')
    const booked = await as(maya)('bookings.create', { sessionId })
    expect(booked.booking.paymentStatus).toBe('due')
    const moved = await as(coach)('sessions.update', { sessionId, startTime: '19:30' })
    expect(moved).toMatchObject({ moved: true, notified: 1 })
    expect(await notificationsFor(maya.userId)).toContain('session.moved')
    await as(coach)('bookings.markPaid', { bookingId: booked.booking.id })
    expect(await status(booked.booking.id)).toMatchObject({ payment_status: 'paid_external' })
  })

  it('prevents double-booking overlapping open slots', async () => {
    const coach = await makeProvider('Sam', { coaching: true, hitting: true })
    const { sessionIds: [slot] } = await makeSeries(coach, { kind: 'hitting', capacity: 1, startTime: '16:00' })
    const { sessionIds: [overlap] } = await makeSeries(coach, { kind: 'private', capacity: 1, startTime: '16:30' })
    const [a, b] = await Promise.all([makeUser('A'), makeUser('B')])
    await as(a)('bookings.create', { sessionId: slot })
    await expect(as(b)('bookings.create', { sessionId: overlap })).rejects.toThrow('just taken')
  })
})

describe('guest checkout and booking links', () => {
  it('books without an account and manages the booking only with its signed link', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    await expect(as(null)('bookings.create', { sessionId })).rejects.toMatchObject({ code: 'unauthorized' })
    const guest = await as(null)('bookings.create', { sessionId, guest: { name: 'Gabe', email: 'gabe@example.com' } })
    expect(guest.booking.status).toBe('confirmed')
    const token = new URL(`http://x${guest.manageUrl}`).searchParams.get('t')!
    await expect(as(null)('bookings.get', { bookingId: guest.booking.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(as(null)('bookings.get', { bookingId: guest.booking.id, token: 'forged' })).rejects.toMatchObject({ code: 'not_found' })
    expect((await as(null)('bookings.get', { bookingId: guest.booking.id, token })).playerName).toBe('Gabe')
    await as(null)('bookings.cancel', { bookingId: guest.booking.id, token })
    expect(await status(guest.booking.id)).toMatchObject({ status: 'cancelled' })
    // The same email later signs in and sees the account the booking created.
    expect(await db.query(`SELECT display_name FROM users WHERE email = 'gabe@example.com'`)).toEqual([{ display_name: 'Gabe' }])
  })
})
