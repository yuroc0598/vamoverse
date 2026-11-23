import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { ensureActor } from '@/server/modules/users/accounts'
import { resetDb } from '../helpers/db'
import { makeProvider, makeSeries, makeUser, notificationsFor } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

describe('crew', () => {
  it('imports contacts as claimable accounts, skips duplicates, and reports bad rows', async () => {
    const coach = await makeProvider('Alex Rivera')
    const existing = await makeUser('Maya')
    const result = await as(coach)('clients.import', {
      contacts: [
        { name: 'Maya', email: existing.email },
        { name: 'Sam Lee', phone: '(415) 555-0199' },
        { name: 'No Contact' },
        { name: 'Bad Phone', phone: '123' },
      ],
    })
    expect(result).toMatchObject({ added: 2, alreadyClients: 0 })
    expect(result.failed.map((f) => f.name)).toEqual(['No Contact', 'Bad Phone'])
    expect((await as(coach)('clients.import', { contacts: [{ name: 'Sam', phone: '+14155550199' }] })).alreadyClients).toBe(1)
    expect((await as(coach)('clients.list', {})).map((c) => c.playerName)).toEqual(['Maya', 'Sam Lee'])
    expect(await notificationsFor(existing.userId)).toContain('client.added')

    // Sam signs in later with the same phone and finds his account (and coach) waiting.
    const samId = (await db.query<{ id: string }>(`SELECT id FROM users WHERE phone = '+14155550199'`))[0].id
    const sam = await ensureActor(db, { id: samId, phone: '+14155550199' })
    expect((await as(sam)('coaches.mine', {})).map((c) => c.slug)).toEqual(['alex-rivera'])
  })

  it('lets coaches book imported students straight away and keeps notes private to them', async () => {
    const coach = await makeProvider()
    await as(coach)('clients.import', { contacts: [{ name: 'Leo Parent', email: 'parent@example.com' }] })
    const [client] = await as(coach)('clients.list', {})
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    await as(coach)('bookings.addPlayer', { sessionId, playerId: client.playerId })
    expect((await as(coach)('sessions.roster', { sessionId }))[0]).toMatchObject({ playerName: 'Leo Parent', status: 'confirmed' })
    await as(coach)('clients.update', { playerId: client.playerId, notes: 'Working on second serve' })
    expect((await as(coach)('clients.list', {}))[0].notes).toBe('Working on second serve')
    const other = await makeProvider('Other')
    await expect(as(other)('clients.update', { playerId: client.playerId, notes: 'x' })).rejects.toMatchObject({ code: 'not_found' })
    await as(coach)('clients.update', { playerId: client.playerId, status: 'archived' })
    expect(await as(coach)('clients.list', {})).toEqual([])
    expect(await as(coach)('clients.list', { includeArchived: true })).toHaveLength(1)
  })

  it('joins a crew from the coach link, for yourself or a junior', async () => {
    const coach = await makeProvider('Alex Rivera')
    const dave = await makeUser('Dave')
    const leo = await as(dave)('family.addJunior', { displayName: 'Leo', birthDate: '2015-01-01', signatureName: 'Dave', consent: true })
    expect(await as(dave)('clients.join', { slug: 'alex-rivera', playerId: leo.id })).toEqual({ providerName: 'Alex Rivera' })
    expect((await as(coach)('clients.list', {}))[0]).toMatchObject({ playerName: 'Leo', junior: true, contactName: 'Dave' })
    const stranger = await makeUser('Stranger')
    await expect(as(stranger)('clients.join', { slug: 'alex-rivera', playerId: leo.id })).rejects.toMatchObject({ code: 'forbidden' })
  })
})
