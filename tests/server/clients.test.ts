import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { resetDb } from '../helpers/db'
import { makeProvider, makeSeries, makeUser } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)

describe('crew', () => {
  it('saves imported contacts as invites only: no accounts, no messages, no lookups', async () => {
    const coach = await makeProvider('Alex Rivera')
    const existing = await makeUser('Maya')
    const usersBefore = (await db.query(`SELECT 1 FROM users`)).length
    const result = await as(coach)('clients.import', {
      contacts: [
        { name: 'Maya', email: existing.email },
        { name: 'Sam Lee', phone: '(415) 555-0199' },
        { name: 'No Contact' },
        { name: 'Bad Phone', phone: '123' },
      ],
    })
    expect(result).toMatchObject({ added: 2, duplicates: 0 })
    expect(result.failed.map((f) => f.name)).toEqual(['No Contact', 'Bad Phone'])
    expect((await as(coach)('clients.import', { contacts: [{ name: 'Sam', phone: '+14155550199' }] })).duplicates).toBe(1)
    // Nothing about the existing account is revealed, created, or sent.
    expect(await as(coach)('clients.list', {})).toEqual([])
    expect((await db.query(`SELECT 1 FROM users`)).length).toBe(usersBefore)
    expect(await db.query(`SELECT 1 FROM notifications`)).toHaveLength(0)
    expect((await as(coach)('clients.invites', {})).map((i) => [i.name, i.email, i.phone]))
      .toEqual([['Maya', existing.email, null], ['Sam Lee', null, '+14155550199']])
  })

  it('turns an invite into a client when the person joins or books themselves', async () => {
    const coach = await makeProvider('Alex Rivera')
    const [maya, sam] = await Promise.all([makeUser('Maya'), makeUser('Sam')])
    await as(coach)('clients.import', { contacts: [{ name: 'Maya C', email: maya.email }, { name: 'Sam L', email: sam.email }] })
    await as(maya)('clients.join', { slug: 'alex-rivera' })
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    await as(sam)('bookings.create', { sessionId })
    expect(await as(coach)('clients.invites', {})).toEqual([])
    expect((await as(coach)('clients.list', {})).map((c) => c.playerName)).toEqual(['Maya', 'Sam'])
  })

  it('needs the student’s yes for any coach-added booking, even free ones; notes stay private', async () => {
    const coach = await makeProvider()
    const maya = await makeUser('Maya')
    const { sessionIds: [intro] } = await makeSeries(coach, { startTime: '07:00' })
    await as(maya)('bookings.create', { sessionId: intro })
    const { sessionIds: [sessionId] } = await makeSeries(coach, { paymentRule: 'external', priceCents: 3000 })
    await as(coach)('bookings.addPlayer', { sessionId, playerId: maya.playerId })
    const [invite] = await db.query<{ id: string; status: string; payment_status: string }>(`SELECT id, status, payment_status FROM bookings WHERE session_id = $1`, [sessionId])
    expect(invite).toMatchObject({ status: 'invited', payment_status: 'due' })
    expect((await as(coach)('money.summary', {})).owedCents).toBe(0) // nothing owed before the yes
    expect(await as(maya)('bookings.acceptInvite', { bookingId: invite.id })).toMatchObject({ confirmed: 1, checkoutUrl: null })

    await as(coach)('clients.update', { playerId: maya.playerId, notes: 'Working on second serve' })
    expect((await as(coach)('clients.list', {}))[0].notes).toBe('Working on second serve')
    const other = await makeProvider('Other')
    await expect(as(other)('clients.update', { playerId: maya.playerId, notes: 'x' })).rejects.toMatchObject({ code: 'not_found' })
    await as(coach)('clients.update', { playerId: maya.playerId, status: 'archived' })
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

describe('crew import from pasted text (native app and assistant)', () => {
  it('parses lines on the server exactly like the web paste preview', async () => {
    const coach = await makeProvider('Alex Rivera')
    const result = await as(coach)('clients.import', {
      text: 'Name, Email, Phone\nMaya Chen, maya@example.com\nSam Lee\t(415) 555-0100\n\nJust A Name\nBad Email, nope@x\nBad Phone, 555-555-55555555',
    })
    expect(result).toMatchObject({ added: 2, duplicates: 0, skipped: ['Just A Name', 'Bad Email, nope@x'] })
    expect(result.failed.map((f) => f.name)).toEqual(['Bad Phone'])
    expect((await as(coach)('clients.invites', {})).map((i) => [i.name, i.email, i.phone]))
      .toEqual([['Maya Chen', 'maya@example.com', null], ['Sam Lee', null, '+14155550100']])
    expect((await as(coach)('clients.import', { text: 'Maya C, MAYA@example.com' })).duplicates).toBe(1)
  })

  it('previews pasted text without saving anything (same parse as saving)', async () => {
    const coach = await makeProvider('Alex Rivera')
    const text = 'Name, Email\nMaya Chen, maya@example.com\nSam Lee\t(415) 555-0100\nJust A Name'
    expect(await as(coach)('clients.preview', { text })).toEqual({
      rows: [{ name: 'Maya Chen', email: 'maya@example.com', phone: null }, { name: 'Sam Lee', email: null, phone: '(415) 555-0100' }],
      skipped: ['Just A Name'],
    })
    expect(await as(coach)('clients.invites', {})).toEqual([])
    expect(await as(coach)('clients.preview', { text: '' })).toEqual({ rows: [], skipped: [] })
    const player = await makeUser('Maya')
    await expect(as(player)('clients.preview', { text })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('rejects text with nothing importable, and requests with both or neither input', async () => {
    const coach = await makeProvider('Alex Rivera')
    await expect(as(coach)('clients.import', { text: 'no contact here' })).rejects.toMatchObject({ code: 'bad_request', message: 'Each line needs a name and an email or phone number.' })
    await expect(as(coach)('clients.import', { text: '  \n' })).rejects.toMatchObject({ code: 'bad_request', message: 'Paste at least one contact.' })
    await expect(as(coach)('clients.import', { text: 'Maya, m@example.com', contacts: [{ name: 'Sam', email: 's@example.com' }] })).rejects.toMatchObject({ code: 'bad_request' })
    await expect(as(coach)('clients.import', {})).rejects.toMatchObject({ code: 'bad_request' })
  })

  it('returns the invite text the coach sends from their own phone or email', async () => {
    const coach = await makeProvider('Alex Rivera')
    await as(coach)('clients.import', { contacts: [{ name: 'Maya Chen', email: 'maya@example.com' }] })
    const [invite] = await as(coach)('clients.invites', {})
    expect(invite.subject).toBe('Book with Alex Rivera')
    expect(invite.message).toBe('Hi Maya, it’s Alex Rivera. I’m using Vamoverse for lessons and clinics now. Book and pay here: http://localhost:3000/p/alex-rivera')
  })
})
