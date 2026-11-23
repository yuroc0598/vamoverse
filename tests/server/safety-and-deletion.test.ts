import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { loadActor } from '@/server/modules/users/accounts'
import { resetDb } from '../helpers/db'
import { makePaidSeries, makeProvider, makeSeries, makeUser, notificationsFor, payCheckout } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

describe('safety checks', () => {
  it('unlocks junior sessions only after an admin approves the provider’s check', async () => {
    const admin = await makeUser('Admin')
    await db.query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.userId])
    const adminActor = (await loadActor(db, admin.userId))!
    const coach = await makeProvider()
    await expect(makeSeries(coach, { audience: 'juniors' })).rejects.toThrow('safety check')
    await as(coach)('safety.submit', { method: 'usta_safe_play', reference: 'SP-12345' })
    expect(await notificationsFor(admin.userId)).toContain('admin.safety_review')
    await expect(as(coach)('admin.safetyQueue', {})).rejects.toMatchObject({ code: 'forbidden' })
    expect(await as(adminActor)('admin.safetyQueue', {})).toEqual([expect.objectContaining({ evidence: 'USTA Safe Play: SP-12345' })])
    await as(adminActor)('admin.reviewSafety', { providerId: coach.providerId, approve: true })
    expect(await notificationsFor(coach.userId)).toContain('provider.safety_reviewed')
    await expect(makeSeries(coach, { audience: 'juniors' })).resolves.toBeTruthy()
    await expect(as(coach)('safety.submit', { method: 'usta_safe_play', reference: 'again' })).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('account deletion', () => {
  it('blocks while bookings are open, then removes personal data and juniors but keeps payment records', async () => {
    const { coach, sessionIds: [sessionId] } = await makePaidSeries({ priceCents: 3000 })
    const dave = await makeUser('Dave')
    await as(dave)('family.addJunior', { displayName: 'Leo', birthDate: '2015-01-01', signatureName: 'Dave', consent: true })
    const booked = await as(dave)('bookings.create', { sessionId })
    await payCheckout(booked.checkoutUrl)

    await expect(as(dave)('account.delete', { confirm: 'DELETE' })).rejects.toThrow('Cancel your upcoming bookings first')
    await expect(as(coach)('account.delete', { confirm: 'DELETE' })).rejects.toThrow('booked sessions')
    await as(dave)('bookings.cancel', { bookingId: booked.booking.id })
    await as(dave)('account.delete', { confirm: 'DELETE' })

    expect(await db.query(`SELECT display_name, email, phone FROM users WHERE id = $1`, [dave.userId]))
      .toEqual([{ display_name: 'Deleted user', email: `deleted+${dave.userId}@invalid`, phone: null }])
    expect(await db.query(`SELECT 1 FROM players WHERE guardian_user_id = $1`, [dave.userId])).toHaveLength(0)
    expect(await db.query(`SELECT status FROM payments WHERE payer_user_id = $1`, [dave.userId])).toEqual([{ status: 'refunded' }])
    expect(await db.query(`SELECT 1 FROM payment_methods WHERE user_id = $1`, [dave.userId])).toHaveLength(0)
  })
})
