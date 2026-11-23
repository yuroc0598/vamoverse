import { beforeEach, describe, expect, it } from 'vitest'
import { db, tx } from '@/server/db'
import { AppError } from '@/server/errors'
import { consume } from '@/server/ratelimit'
import { ensureActor, findOrCreateAccount, normalizePhone } from '@/server/modules/users/accounts'
import { addDays, formatSessionRange, weekdayOf, zonedParts, zonedToUtc } from '@/lib/time'
import { resetDb } from '../helpers/db'
import { as } from '../helpers/run'

beforeEach(resetDb)

describe('accounts', () => {
  it('creates the user and their own player profile on first sight, once', async () => {
    const first = await ensureActor(db, { id: 'usr_a', email: 'Maya@Example.com', name: 'Maya' })
    const again = await ensureActor(db, { id: 'usr_a', email: 'maya@example.com' })
    expect(first).toMatchObject({ userId: 'usr_a', email: 'maya@example.com', displayName: 'Maya', providerId: null, onboarded: false })
    expect(again.playerId).toBe(first.playerId)
    expect(await db.query('SELECT 1 FROM players')).toHaveLength(1)
  })

  it('finds an existing account by email or phone before creating one', async () => {
    const created = await findOrCreateAccount(db, { phone: '(415) 555-0100', name: 'Sam' })
    const found = await findOrCreateAccount(db, { phone: '+1 415 555 0100', name: 'Someone else' })
    expect(found.userId).toBe(created.userId)
    expect(created.phone).toBe('+14155550100')
  })

  it('rejects malformed phone numbers', () => {
    expect(() => normalizePhone('12345')).toThrow(AppError)
  })
})

describe('command runner', () => {
  it('rejects unknown commands and unauthenticated access', async () => {
    await expect(as(null)('nope' as never, {} as never)).rejects.toMatchObject({ code: 'not_found' })
    expect(await as(null)('account.me', {})).toBeNull()
  })
})

describe('transactions', () => {
  it('roll back every statement when the callback throws', async () => {
    await expect(tx(async (t) => {
      await t.query(`INSERT INTO users (id, email, display_name) VALUES ('usr_x', 'x@example.com', 'X')`)
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(await db.query(`SELECT 1 FROM users WHERE id = 'usr_x'`)).toHaveLength(0)
  })
})

describe('rate limits', () => {
  it('allows up to the limit within a window', async () => {
    const results = []
    for (let i = 0; i < 4; i++) results.push(await consume(db, 'k', 3, 60))
    expect(results).toEqual([true, true, true, false])
  })
})

describe('time', () => {
  it('converts wall time across daylight-saving changes', () => {
    // 6pm Los Angeles is 01:00Z in winter (PST) and 01:00Z+... in summer (PDT).
    expect(zonedToUtc('2026-12-01', '18:00', 'America/Los_Angeles').toISOString()).toBe('2026-12-02T02:00:00.000Z')
    expect(zonedToUtc('2026-07-01', '18:00', 'America/Los_Angeles').toISOString()).toBe('2026-07-02T01:00:00.000Z')
    expect(zonedParts(new Date('2026-07-02T01:00:00Z'), 'America/Los_Angeles')).toMatchObject({ date: '2026-07-01', time: '18:00', weekday: 3 })
  })

  it('does calendar math on date strings', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(weekdayOf('2026-11-23')).toBe(1)
    expect(formatSessionRange('2026-12-02T02:00:00Z', '2026-12-02T03:30:00Z', 'America/Los_Angeles')).toBe('Tue, Dec 1 · 6:00 PM – 7:30 PM')
  })
})
