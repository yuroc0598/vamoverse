import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { resetDb } from '../helpers/db'
import { makeProvider, makeSeries, makeUser, notificationsFor, verifySafety } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

describe('messaging', () => {
  it('runs a series group thread for the coach and everyone booked, and texts coach broadcasts', async () => {
    const coach = await makeProvider()
    const { offering, sessionIds: [sessionId] } = await makeSeries(coach, { capacity: 4 })
    const [maya, sam, outsider] = await Promise.all([makeUser('Maya'), makeUser('Sam'), makeUser('Out')])
    await as(maya)('bookings.create', { sessionId })
    await as(sam)('bookings.create', { sessionId })
    const { threadId } = await as(coach)('messages.start', { offeringId: offering.id })
    await as(coach)('messages.send', { threadId, body: 'Court 4 tonight — bring water' })
    expect(await notificationsFor(maya.userId)).toContain('message.broadcast')
    expect((await as(sam)('messages.threads', {}))[0]).toMatchObject({ title: 'Clinic', unread: 1, lastMessage: 'Court 4 tonight — bring water' })
    await as(sam)('messages.send', { threadId, body: 'See you there' })
    const read = await as(maya)('messages.read', { threadId })
    expect(read.messages.map((m) => [m.senderName, m.body])).toEqual([['Coach Alex', 'Court 4 tonight — bring water'], ['Sam', 'See you there']])
    expect((await as(maya)('messages.threads', {}))[0].unread).toBe(0)
    await expect(as(outsider)('messages.read', { threadId })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('connects a coach and a junior’s parent directly — never the junior', async () => {
    const coach = await makeProvider()
    await verifySafety(coach)
    const { sessionIds: [sessionId] } = await makeSeries(coach, { audience: 'juniors' })
    const dave = await makeUser('Dave')
    const leo = await as(dave)('family.addJunior', { displayName: 'Leo', birthDate: '2015-02-02', signatureName: 'Dave', consent: true })
    await as(dave)('bookings.create', { sessionId, playerId: leo.id })
    const { threadId } = await as(coach)('messages.start', { playerId: leo.id })
    expect((await db.query<{ user_id: string }>(`SELECT user_id FROM conversation_members WHERE conversation_id = $1 ORDER BY user_id`, [threadId])).map((r) => r.user_id).sort())
      .toEqual([coach.userId, dave.userId].sort())
    await as(coach)('messages.send', { threadId, body: 'Leo did great today' })
    expect((await as(dave)('messages.read', { threadId })).thread.title).toBe('Coach Alex')
    // Starting again reuses the same thread, from either side.
    expect((await as(dave)('messages.start', { providerId: coach.providerId })).threadId).toBe(threadId)
  })

  it('lets players message only coaches they train with', async () => {
    const coach = await makeProvider()
    const stranger = await makeUser('Stranger')
    await expect(as(stranger)('messages.start', { providerId: coach.providerId })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(as(stranger)('messages.start', { playerId: stranger.playerId })).rejects.toMatchObject({ code: 'forbidden' })
  })
})
