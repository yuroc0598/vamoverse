// Regression tests for issues found in independent review (one test per scenario).
import type Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db'
import { expireHolds } from '@/server/modules/bookings/engine'
import { setModelClient } from '@/server/modules/assistant/model'
import { getProcessor } from '@/server/modules/payments/processor'
import { runPaymentJobs } from '@/server/modules/payments/settlement'
import { resetDb } from '../helpers/db'
import { connectPayouts, makePaidSeries, makeProvider, makeSeries, makeUser, payCheckout, startSession } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)
afterEach(() => { vi.restoreAllMocks(); setModelClient(null) })

const status = async (id: string) => (await db.query<{ status: string; payment_status: string }>(`SELECT status, payment_status FROM bookings WHERE id = $1`, [id]))[0]

describe('review regressions', () => {
  it('guests cannot book as an existing account (no spending someone else’s credits or card)', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    const victim = await makeUser('Victim')
    await expect(as(null)('bookings.create', { sessionId, guest: { name: 'Attacker', email: victim.email } }))
      .rejects.toMatchObject({ code: 'unauthorized' })
    expect(await db.query(`SELECT 1 FROM bookings`)).toHaveLength(0)
  })

  it('lets a guest retry after a failed booking (no account is left behind)', async () => {
    const coach = await makeProvider()
    const { sessionIds: [mens] } = await makeSeries(coach, { discipline: 'mens_doubles', capacity: 4 })
    const { sessionIds: [open] } = await makeSeries(coach, { startTime: '08:00' })
    const guest = { name: 'Gabe', email: 'gabe@example.com' }
    await expect(as(null)('bookings.create', { sessionId: mens, guest })).rejects.toThrow('Add your gender')
    expect(await db.query(`SELECT 1 FROM users WHERE email = 'gabe@example.com'`)).toHaveLength(0)
    await expect(as(null)('bookings.create', { sessionId: open, guest })).resolves.toMatchObject({ booking: { status: 'confirmed' } })
  })

  it('a coach adding someone to a paid session needs that person to confirm before any card is used', async () => {
    const { coach, sessionIds } = await makePaidSeries({ kind: 'private', capacity: 1, paymentRule: 'pay_after', priceCents: 90000, repeatWeekdays: [0, 1, 2, 3, 4, 5, 6] })
    const victim = await makeUser('Victim')
    // The victim has a saved card from somewhere else.
    await db.query(`INSERT INTO payment_methods (id, user_id, processor, last4) VALUES ('pm_dev_x4242', $1, 'dev', '4242')`, [victim.userId])
    // Importing someone's email gives the coach nothing: no link, no details, no way to book them.
    await as(coach)('clients.import', { contacts: [{ name: 'Victim', email: victim.email }] })
    await expect(as(coach)('bookings.addPlayer', { sessionId: sessionIds[0], playerId: victim.playerId })).rejects.toMatchObject({ code: 'not_found' })
    // Once they book with the coach themselves, coach-added sessions are still only invites.
    const { sessionIds: [intro] } = await makeSeries(coach, { startTime: '06:00' })
    await as(victim)('bookings.create', { sessionId: intro })
    await as(coach)('bookings.addPlayer', { sessionId: sessionIds[0], playerId: victim.playerId })
    const [booking] = await db.query<{ id: string }>(`SELECT id FROM bookings WHERE session_id = $1`, [sessionIds[0]])
    expect(await status(booking.id)).toEqual({ status: 'invited', payment_status: 'due' })
    await startSession(sessionIds[0])
    await expect(as(coach)('bookings.attendance', { bookingId: booking.id, outcome: 'attended' })).rejects.toMatchObject({ code: 'conflict' })
    expect(await db.query(`SELECT 1 FROM payments`)).toHaveLength(0)

    // The player can confirm (uses their saved card) or leave the crew entirely.
    await as(coach)('bookings.addPlayer', { sessionId: sessionIds[1], playerId: victim.playerId })
    const [second] = await db.query<{ id: string }>(`SELECT b.id FROM bookings b WHERE b.session_id = $1`, [sessionIds[1]])
    expect(await as(victim)('bookings.acceptInvite', { bookingId: second.id })).toMatchObject({ confirmed: 1, checkoutUrl: null })
    await as(victim)('clients.leave', { providerId: coach.providerId })
    await expect(as(coach)('bookings.addPlayer', { sessionId: sessionIds[2], playerId: victim.playerId })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('refunds a late payment when the player already rebooked, instead of failing forever', async () => {
    const { sessionIds: [sessionId] } = await makePaidSeries({ priceCents: 4000 })
    const maya = await makeUser('Maya')
    const first = await as(maya)('bookings.create', { sessionId })
    await db.query(`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [first.booking.id])
    await expireHolds(db)
    const second = await as(maya)('bookings.create', { sessionId })
    expect(second.booking.status).toBe('held')
    await payCheckout(first.checkoutUrl) // the old tab finishes paying
    expect(await status(first.booking.id)).toEqual({ status: 'expired', payment_status: 'refunded' })
    expect(await db.query(`SELECT status, refunded_cents FROM payments WHERE booking_id = $1`, [first.booking.id])).toEqual([{ status: 'refunded', refunded_cents: 4000 }])
    await payCheckout(second.checkoutUrl)
    expect(await status(second.booking.id)).toEqual({ status: 'confirmed', payment_status: 'paid' })
  })

  it('never revives a booking the player cancelled when its old checkout completes', async () => {
    const { sessionIds: [sessionId] } = await makePaidSeries({ priceCents: 4000 })
    const maya = await makeUser('Maya')
    const held = await as(maya)('bookings.create', { sessionId })
    await as(maya)('bookings.cancel', { bookingId: held.booking.id })
    await payCheckout(held.checkoutUrl)
    expect(await status(held.booking.id)).toEqual({ status: 'cancelled', payment_status: 'refunded' })
  })

  it('refunds a fee that was waived while its charge was in flight', async () => {
    const coach = await makeProvider()
    await connectPayouts(coach)
    await as(coach)('provider.update', { cancelWindowHours: 168, lateCancelFeePct: 50 })
    const { sessionIds: [sessionId] } = await makeSeries(coach, { kind: 'private', capacity: 1, paymentRule: 'pay_after', priceCents: 8000 })
    const maya = await makeUser('Maya')
    const booked = await as(maya)('bookings.create', { sessionId })
    await payCheckout(booked.checkoutUrl)
    const processor = await getProcessor()
    const real = processor.chargeOffSession.bind(processor)
    vi.spyOn(processor, 'chargeOffSession').mockImplementation(async (req) => {
      await as(coach)('bookings.waiveFee', { bookingId: booked.booking.id }) // waive lands mid-charge
      return real(req)
    })
    await as(maya)('bookings.cancel', { bookingId: booked.booking.id })
    expect(await db.query(`SELECT status, refunded_cents FROM payments WHERE purpose = 'late_cancel_fee'`)).toEqual([{ status: 'refunded', refunded_cents: 4000 }])
    expect(await status(booked.booking.id)).toMatchObject({ payment_status: 'waived' })
    expect(await runPaymentJobs(db)).toEqual({ refunds: 0, charges: 0 })
  })

  it('keeps unconfirmed and cancelled players out of a series group chat', async () => {
    const { coach, offering, sessionIds: [sessionId] } = await makePaidSeries({ priceCents: 3000, capacity: 4 })
    const [payer, holder] = await Promise.all([makeUser('Payer'), makeUser('Holder')])
    const paid = await as(payer)('bookings.create', { sessionId })
    await payCheckout(paid.checkoutUrl)
    await as(holder)('bookings.create', { sessionId }) // held, never paid
    const { threadId } = await as(coach)('messages.start', { offeringId: offering.id })
    await expect(as(holder)('messages.read', { threadId })).rejects.toMatchObject({ code: 'not_found' })
    await expect(as(payer)('messages.read', { threadId })).resolves.toBeTruthy()
    await as(payer)('bookings.cancel', { bookingId: paid.booking.id })
    await expect(as(payer)('messages.read', { threadId })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('shows a server-written description on the assistant confirmation card', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach, { title: 'Tuesday Clinic' })
    const turns = [
      [{ type: 'tool_use', id: 't1', name: 'sessions__cancel', input: { sessionId, reason: 'Rain', summary: 'Totally harmless tweak' } }],
      [{ type: 'text', text: 'Confirm?', citations: null }],
    ]
    setModelClient({
      async create() {
        const content = turns.shift()!
        return { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: content[0].type === 'tool_use' ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Beta.BetaMessage
      },
    })
    const reply = await as(coach)('assistant.send', { text: 'cancel tuesday' })
    const [card] = reply.pendingAction!.actions
    expect(card.description).toMatch(/^Cancel one session \(rain, illness\): Tuesday Clinic, .* · reason: Rain$/)
    expect(card.note).toBe('Totally harmless tweak')
  })
})
