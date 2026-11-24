// Deleting accounts stops a coach's business, and never erases a coach's booking history.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db'
import { completeSessions } from '@/server/modules/bookings/engine'
import { getProcessor } from '@/server/modules/payments/processor'
import { extendAllSessions } from '@/server/modules/schedule/offerings'
import { resetDb } from '../helpers/db'
import { bookPayAfterPrivate, makePaidSeries, makeProvider, makeSeries, makeUser, setPayouts, startSession, verifySafety } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)
afterEach(() => vi.restoreAllMocks())

describe('deleting a coach', () => {
  it('archives their series, cancels future sessions, and turns off payments', async () => {
    const { coach, sessionIds: [sessionId] } = await makePaidSeries({ repeatWeekdays: [0, 1, 2, 3, 4, 5, 6] })
    await as(coach)('account.delete', { confirm: 'DELETE' })
    expect(await db.query(`SELECT DISTINCT status FROM offerings WHERE provider_id = $1`, [coach.providerId])).toEqual([{ status: 'archived' }])
    expect(await db.query(`SELECT DISTINCT status FROM sessions WHERE provider_id = $1`, [coach.providerId])).toEqual([{ status: 'cancelled' }])
    expect(await db.query(`SELECT charges_enabled, listed FROM providers WHERE id = $1`, [coach.providerId])).toEqual([{ charges_enabled: false, listed: false }])
    const maya = await makeUser('Maya')
    await expect(as(maya)('bookings.create', { sessionId })).rejects.toMatchObject({ code: 'conflict' })
    expect((await as(maya)('sessions.view', { sessionId })).bookable).toBe(false)
    await db.query(`UPDATE offerings SET generated_through = CURRENT_DATE WHERE provider_id = $1`, [coach.providerId])
    expect(await extendAllSessions(db)).toBe(0)
  })

  it('waits for a just-ended session to settle, then writes off what can no longer be collected', async () => {
    const { coach, sessionId, bookingId } = await bookPayAfterPrivate()
    await startSession(sessionId, 2) // ended an hour ago; attendance and the charge haven't run yet
    await expect(as(coach)('account.delete', { confirm: 'DELETE' })).rejects.toThrow('just ended')

    await setPayouts(coach, false)
    await startSession(sessionId, 6)
    await completeSessions(db) // the charge waits for payouts that will never come back
    await as(coach)('account.delete', { confirm: 'DELETE' })
    expect(await db.query(`SELECT b.payment_status, p.status FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.mode = 'off_session' WHERE b.id = $1`, [bookingId]))
      .toEqual([{ payment_status: 'waived', status: 'canceled' }])
  })

  it('makes a player settle what they owe before leaving; a coach leaving writes it off', async () => {
    vi.spyOn(await getProcessor(), 'chargeOffSession').mockResolvedValue({ ok: false, message: 'Your card was declined.' })
    const { coach, maya, sessionId, bookingId } = await bookPayAfterPrivate()
    await startSession(sessionId)
    await as(coach)('bookings.attendance', { bookingId, outcome: 'attended' })
    await expect(as(maya)('account.delete', { confirm: 'DELETE' })).rejects.toThrow('Settle what you owe')

    await as(coach)('account.delete', { confirm: 'DELETE' })
    expect(await db.query(`SELECT b.payment_status, p.status FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.mode = 'off_session' WHERE b.id = $1`, [bookingId]))
      .toEqual([{ payment_status: 'waived', status: 'canceled' }])
    await expect(as(maya)('account.delete', { confirm: 'DELETE' })).resolves.not.toThrow()
  })
})

describe('booking history', () => {
  it('keeps attendance and revenue rows when a junior is removed, without the child’s name', async () => {
    const coach = await makeProvider()
    await verifySafety(coach)
    const { sessionIds: [sessionId] } = await makeSeries(coach, { audience: 'juniors', paymentRule: 'external', priceCents: 3000 })
    const dave = await makeUser('Dave')
    const leo = await as(dave)('family.addJunior', { displayName: 'Leo', birthDate: '2015-01-01', signatureName: 'Dave', consent: true })
    const booked = await as(dave)('bookings.create', { sessionId, playerId: leo.id })
    await startSession(sessionId)
    await as(coach)('bookings.attendance', { bookingId: booked.booking.id, outcome: 'attended' })
    await as(dave)('family.removeJunior', { playerId: leo.id })
    expect(await db.query(`SELECT player_id, player_name, status FROM bookings WHERE id = $1`, [booked.booking.id]))
      .toEqual([{ player_id: null, player_name: 'Removed player', status: 'attended' }])
    expect((await as(coach)('sessions.roster', { sessionId }))[0]).toMatchObject({ playerName: 'Removed player', status: 'attended' })
    expect(await as(dave)('bookings.mine', { scope: 'past' })).toMatchObject([{ playerName: 'Removed player', status: 'attended' }])
  })

  it('shows a player’s new name on their upcoming bookings', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    const maya = await makeUser('Maya')
    await as(maya)('bookings.create', { sessionId })
    await as(maya)('account.update', { displayName: 'Maya Chen' })
    expect((await as(coach)('sessions.roster', { sessionId }))[0].playerName).toBe('Maya Chen')
  })
})
