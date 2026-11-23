import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { assertJuniorBookable, getConsent, markGuardianVerified } from '@/server/modules/users/guardians'
import { getPlayer } from '@/server/modules/users/players'
import { resetDb } from '../helpers/db'
import { makeProvider, makeUser } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

const yearsAgo = (years: number) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

describe('onboarding', () => {
  it('requires adults and creates a provider profile instantly when coaching is chosen', async () => {
    const fresh = await makeUser('Alex Coach', { onboard: false })
    await expect(as(fresh)('onboarding.complete', { displayName: 'Alex', adult: false as true })).rejects.toMatchObject({ code: 'bad_request' })
    const coach = await as(fresh)('onboarding.complete', { displayName: 'Alex Rivera', adult: true, offersCoaching: true })
    expect(coach).toMatchObject({ onboarded: true, adultConfirmed: true, displayName: 'Alex Rivera' })
    expect(coach!.providerId).toBeTruthy()
    const settings = await as(coach)('provider.settings', {})
    expect(settings).toMatchObject({ slug: 'alex-rivera', offersCoaching: true, offersHitting: false, plan: 'free', cancelWindowHours: 24 })
  })

  it('gives unique profile links to coaches with the same name', async () => {
    const a = await makeProvider('Sam Lee')
    const b = await makeProvider('Sam Lee')
    const [sa, sb] = await Promise.all([as(a)('provider.settings', {}), as(b)('provider.settings', {})])
    expect(sa.slug).toBe('sam-lee')
    expect(sb.slug).toBe('sam-lee-2')
  })
})

describe('provider settings', () => {
  it('updates rates and policies, rejects a taken link, and blocks non-providers', async () => {
    const coach = await makeProvider('Alex Rivera')
    const other = await makeProvider('Jordan')
    const updated = await as(coach)('provider.update', { ratePrivateCents: 9000, cancelWindowHours: 12, lateCancelFeePct: 0, headline: 'USPTA pro' })
    expect(updated).toMatchObject({ ratePrivateCents: 9000, cancelWindowHours: 12, lateCancelFeePct: 0, headline: 'USPTA pro' })
    await expect(as(other)('provider.update', { slug: 'alex-rivera' })).rejects.toMatchObject({ code: 'conflict' })
    await expect(as(coach)('provider.update', { offersCoaching: false })).rejects.toMatchObject({ code: 'bad_request' })
    const player = await makeUser('Maya')
    await expect(as(player)('provider.settings', {})).rejects.toMatchObject({ code: 'forbidden' })
    expect(await as(null)('provider.public', { slug: 'alex-rivera' })).toMatchObject({ displayName: 'Alex Rivera', headline: 'USPTA pro', acceptsPayments: false })
  })

  it('manages courts scoped to the owner', async () => {
    const coach = await makeProvider()
    const other = await makeProvider('Other')
    const court = await as(coach)('courts.save', { name: 'Mitchell Park', bookingUrl: 'https://example.com/book', bookingNote: 'Opens 7 days ahead at 8am' })
    await expect(as(other)('courts.save', { id: court.id, name: 'Hijack' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(as(coach)('courts.save', { name: 'Bad', bookingUrl: 'http://insecure.example.com' })).rejects.toMatchObject({ code: 'bad_request' })
    expect(await as(coach)('courts.list', {})).toEqual([expect.objectContaining({ name: 'Mitchell Park', bookingNote: 'Opens 7 days ahead at 8am' })])
    expect(await as(other)('courts.list', {})).toEqual([])
  })
})

describe('players and family', () => {
  it('lets adults edit their own profile with optional ratings', async () => {
    const maya = await makeUser('Maya')
    const updated = await as(maya)('players.update', { playerId: maya.playerId, ntrp: 3.5, gender: 'female' })
    expect(updated).toMatchObject({ ntrp: 3.5, utrSingles: null, gender: 'female' })
    await expect(as(maya)('players.update', { playerId: maya.playerId, ntrp: 3.7 })).rejects.toMatchObject({ code: 'bad_request' })
  })

  it('creates juniors only through a consenting adult guardian', async () => {
    const dave = await makeUser('Dave')
    const leo = await as(dave)('family.addJunior', {
      displayName: 'Leo', birthDate: yearsAgo(11), gender: 'male', signatureName: 'Dave Smith', consent: true,
    })
    expect(leo).toMatchObject({ guardianUserId: dave.userId, userId: null })
    await expect(as(dave)('family.addJunior', {
      displayName: 'Too old', birthDate: yearsAgo(19), signatureName: 'Dave', consent: true,
    })).rejects.toMatchObject({ code: 'bad_request' })
    expect((await as(dave)('family.list', {})).map((p) => p.displayName)).toEqual(['Dave', 'Leo'])

    const stranger = await makeUser('Stranger')
    await expect(as(stranger)('players.update', { playerId: leo.id, ntrp: 3 })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(as(dave)('players.update', { playerId: leo.id, birthDate: null })).rejects.toMatchObject({ code: 'bad_request' })
  })

  it('allows booking juniors only while guardian consent is active, and records card verification', async () => {
    const dave = await makeUser('Dave')
    const leo = await as(dave)('family.addJunior', { displayName: 'Leo', birthDate: yearsAgo(10), signatureName: 'Dave', consent: true })
    await expect(assertJuniorBookable(db, (await getPlayer(db, leo.id))!)).resolves.toBeUndefined()
    await markGuardianVerified(db, dave.userId, 'pay_test')
    expect((await getConsent(db, leo.id))?.verifiedAt).toBeInstanceOf(Date)
    await db.query(`UPDATE guardian_consents SET revoked_at = now() WHERE player_id = $1`, [leo.id])
    await expect(assertJuniorBookable(db, (await getPlayer(db, leo.id))!)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('removes a junior and their data', async () => {
    const dave = await makeUser('Dave')
    const leo = await as(dave)('family.addJunior', { displayName: 'Leo', birthDate: yearsAgo(9), signatureName: 'Dave', consent: true })
    await expect(as(dave)('family.removeJunior', { playerId: dave.playerId })).rejects.toMatchObject({ code: 'bad_request' })
    await as(dave)('family.removeJunior', { playerId: leo.id })
    expect(await getPlayer(db, leo.id)).toBeNull()
    expect(await db.query('SELECT 1 FROM guardian_consents')).toHaveLength(0)
  })
})
