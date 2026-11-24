import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db'
import * as channels from '@/server/modules/notifications/channels'
import { deliverPending, renderSms } from '@/server/modules/notifications/dispatcher'
import { sessionInvite } from '@/server/modules/notifications/ics'
import { enqueue } from '@/server/modules/notifications/outbox'
import { enqueueReminders } from '@/server/modules/notifications/reminders'
import { getSession } from '@/server/modules/schedule/sessions'
import { ensureActor } from '@/server/modules/users/accounts'
import { resetDb } from '../helpers/db'
import { makeProvider, makeSeries, makeUser, moveSessionSoon } from '../helpers/factories'
import { as } from '../helpers/run'

beforeEach(resetDb)
afterEach(() => vi.restoreAllMocks())

const statuses = async (userId: string) =>
  db.query<{ kind: string; email_status: string; sms_status: string }>(`SELECT kind, email_status, sms_status FROM notifications WHERE user_id = $1 ORDER BY kind`, [userId]) // test DB clock ties within a millisecond

describe('delivery', () => {
  it('emails everything, texts only time-sensitive kinds, and honors preferences', async () => {
    const email = vi.spyOn(channels, 'sendEmail').mockResolvedValue()
    const sms = vi.spyOn(channels, 'sendSms').mockResolvedValue(true)
    const maya = await ensureActor(db, { id: 'usr_maya', email: 'maya@example.com', phone: '+14155550100', name: 'Maya' })
    await enqueue(db, { userId: maya.userId, kind: 'booking.confirmed', title: 'Booked', body: 'Tue 6pm' })
    await enqueue(db, { userId: maya.userId, kind: 'session.cancelled', title: 'Cancelled', body: 'Rain', link: '/b/x' })
    expect(await deliverPending(db)).toBe(2)
    expect(await statuses(maya.userId)).toEqual([
      { kind: 'booking.confirmed', email_status: 'sent', sms_status: 'skipped' },
      { kind: 'session.cancelled', email_status: 'sent', sms_status: 'sent' },
    ])
    expect(email).toHaveBeenCalledTimes(2)
    expect(sms).toHaveBeenCalledWith('+14155550100', 'Cancelled. Rain http://localhost:3000/b/x')

    await as(maya)('account.update', { notifyEmail: false, notifySms: false })
    await enqueue(db, { userId: maya.userId, kind: 'session.moved', title: 'Moved', body: 'Now 7pm' })
    await deliverPending(db)
    expect((await statuses(maya.userId)).find((n) => n.kind === 'session.moved')).toEqual({ kind: 'session.moved', email_status: 'skipped', sms_status: 'skipped' })
    expect(await deliverPending(db)).toBe(0)
  })

  it('retries failures with backoff and gives up after five attempts', async () => {
    vi.spyOn(channels, 'sendEmail').mockRejectedValue(new Error('provider down'))
    const maya = await makeUser('Maya')
    await enqueue(db, { userId: maya.userId, kind: 'booking.confirmed', title: 'Booked', body: 'x' })
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.query(`UPDATE notifications SET next_attempt_at = now()`)
      await deliverPending(db)
    }
    expect(await db.query(`SELECT email_status, attempts FROM notifications`)).toEqual([{ email_status: 'failed', attempts: 5 }])
  })

  it('deduplicates by key and keeps SMS short', async () => {
    const maya = await makeUser('Maya')
    await enqueue(db, { userId: maya.userId, kind: 'k', title: 't', body: 'b', dedupeKey: 'same' })
    await enqueue(db, { userId: maya.userId, kind: 'k', title: 't', body: 'b', dedupeKey: 'same' })
    expect(await db.query(`SELECT 1 FROM notifications`)).toHaveLength(1)
    expect(renderSms({ title: 'T', body: 'x'.repeat(500), link: null }).length).toBe(278) // 277 chars + ellipsis
  })
})

describe('reminders and calendar', () => {
  it('reminds the day before and two hours before, once each', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    const maya = await makeUser('Maya')
    await as(maya)('bookings.create', { sessionId })
    await moveSessionSoon(sessionId, 20)
    await enqueueReminders(db)
    await enqueueReminders(db)
    await moveSessionSoon(sessionId, 1)
    await enqueueReminders(db)
    const kinds = (await db.query<{ kind: string }>(`SELECT kind FROM notifications WHERE user_id = $1 AND kind LIKE 'reminder%' ORDER BY kind`, [maya.userId])).map((r) => r.kind)
    expect(kinds).toEqual(['reminder.24h', 'reminder.2h']) // exactly one of each
  })

  it('builds a valid calendar invite', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach, { title: 'Clinic, 3.5; doubles' })
    const ics = sessionInvite((await getSession(db, sessionId))!, { uid: 'bkg_1', url: 'https://vamoverse.app/b/bkg_1' })
    expect(ics).toContain('BEGIN:VEVENT\r\n')
    expect(ics).toContain('SUMMARY:Clinic\\, 3.5\\; doubles · Coach Alex')
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(ics.split('\r\n').every((line) => line.length <= 75)).toBe(true)
  })
})
