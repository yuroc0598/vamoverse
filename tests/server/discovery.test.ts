import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../helpers/db'
import { inDays, makeProvider, makeSeries, makeUser } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

describe('find', () => {
  it('lists hitters by soonest opening with their own level, and filters by area and type', async () => {
    const soon = await makeProvider('Sam Soon', { coaching: false, hitting: true })
    const later = await makeProvider('Lee Later', { coaching: false, hitting: true })
    const coach = await makeProvider('Cora Coach')
    const hidden = await makeProvider('Hidden Hitter', { coaching: false, hitting: true })
    await as(soon)('provider.update', { homeArea: 'Fremont', rateHittingCents: 6000 })
    await as(soon)('players.update', { playerId: soon.playerId, utrSingles: 9.5 })
    await as(later)('provider.update', { homeArea: 'San Jose' })
    await as(hidden)('provider.update', { listed: false })
    await makeSeries(soon, { kind: 'hitting', capacity: 1, startDate: inDays(1) })
    await makeSeries(later, { kind: 'hitting', capacity: 1, startDate: inDays(5) })
    await makeSeries(coach, { startDate: inDays(2), title: 'Fremont 3.5 Clinic', capacity: 6 })

    const hitters = await as(null)('find.providers', { type: 'hitting' })
    expect(hitters.map((h) => h.name)).toEqual(['Sam Soon', 'Lee Later'])
    expect(hitters[0]).toMatchObject({ ownUtr: 9.5, rateHittingCents: 6000, openSessions: 1 })
    expect((await as(null)('find.providers', { type: 'hitting', area: 'san jose' })).map((h) => h.name)).toEqual(['Lee Later'])
    expect((await as(null)('find.providers', { type: 'coaching' })).map((h) => h.name)).toEqual(['Cora Coach'])
    expect((await as(null)('find.sessions', { query: 'clinic' })).map((s) => s.title)).toEqual(['Fremont 3.5 Clinic'])
  })

  it('stops showing sessions once they are full', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach, { capacity: 2, title: 'Small clinic' })
    await as(await makeUser('A'))('bookings.create', { sessionId })
    expect(await as(null)('find.sessions', {})).toHaveLength(1)
    await as(await makeUser('B'))('bookings.create', { sessionId })
    expect(await as(null)('find.sessions', {})).toHaveLength(0)
  })
})
