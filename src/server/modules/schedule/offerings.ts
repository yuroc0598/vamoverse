// Offerings: what a provider sells (clinic, private, semi-private, hitting) and its
// weekly pattern. Sessions are generated from the pattern a rolling horizon ahead.
import { z } from 'zod'
import { OFFERING_KINDS, type LevelSystem, type OfferingKind, type PaymentRule } from '@/lib/format'
import { addDays, todayIn } from '@/lib/time'
import { maybeOne, tx, updateRow, type Db } from '../../db'
import { forEachIsolated } from '../../isolate'
import { fail } from '../../errors'
import { newId } from '../../ids'
import { cents, isoDate, optionalText, wallTime } from '../../schemas'
import { getCourt } from '../providers/courts'
import { OPEN_SQL, SEAT_SQL } from '../bookings/status'
import { requireProvider, type ProviderSettings } from '../providers/profile'
import { expand, GENERATION_HORIZON_DAYS, type RecurrenceSpec } from './recurrence'


const LEVEL_RANGES: Record<LevelSystem, [number, number]> = { utr: [1, 16.5], ntrp: [1, 7], wtn: [1, 40] }

export interface Offering {
  id: string
  providerId: string
  kind: OfferingKind
  title: string
  description: string | null
  discipline: 'singles' | 'doubles' | 'mens_doubles' | 'womens_doubles' | 'mixed_doubles' | null
  audience: 'adults' | 'juniors' | 'all'
  capacity: number
  priceCents: number
  paymentRule: PaymentRule
  acceptsCredits: boolean
  levelSystem: LevelSystem | null
  levelMin: number | null
  levelMax: number | null
  visibility: 'public' | 'clients' | 'invite'
  courtId: string | null
  locationName: string | null
  locationNote: string | null
  timezone: string
  startDate: string
  startTime: string
  durationMinutes: number
  slotsPerDay: number
  repeatWeekdays: number[] | null
  repeatEveryWeeks: number
  endDate: string | null
  status: 'active' | 'archived'
}

const OFFERING_COLUMNS = `o.id, o.provider_id AS "providerId", o.kind, o.title, o.description, o.discipline, o.audience,
  o.capacity, o.price_cents AS "priceCents", o.payment_rule AS "paymentRule", o.accepts_credits AS "acceptsCredits",
  o.level_system AS "levelSystem", o.level_min AS "levelMin", o.level_max AS "levelMax", o.visibility,
  o.court_id AS "courtId", o.location_name AS "locationName", o.location_note AS "locationNote", o.timezone,
  o.start_date AS "startDate", to_char(o.start_time, 'HH24:MI') AS "startTime", o.duration_minutes AS "durationMinutes",
  o.slots_per_day AS "slotsPerDay", o.repeat_weekdays AS "repeatWeekdays", o.repeat_every_weeks AS "repeatEveryWeeks",
  o.end_date AS "endDate", o.status`

const scheduleFields = {
  startDate: isoDate,
  startTime: wallTime,
  durationMinutes: z.number().int().min(15).max(480),
  slotsPerDay: z.number().int().min(1).max(16).default(1),
  repeatWeekdays: z.array(z.number().int().min(0).max(6)).max(7).nullish().transform((v) => (v?.length ? [...new Set(v)].sort() : null)),
  repeatEveryWeeks: z.number().int().min(1).max(4).default(1),
  endDate: isoDate.nullish().transform((v) => v ?? null),
}

const detailFields = {
  title: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  discipline: z.enum(['singles', 'doubles', 'mens_doubles', 'womens_doubles', 'mixed_doubles']).nullish().transform((v) => v ?? null),
  audience: z.enum(['adults', 'juniors', 'all']).default('adults'),
  capacity: z.number().int().min(1).max(40),
  priceCents: cents,
  paymentRule: z.enum(['free', 'pay_now', 'pay_after', 'external']),
  acceptsCredits: z.boolean().default(false),
  levelSystem: z.enum(['utr', 'ntrp', 'wtn']).nullish().transform((v) => v ?? null),
  levelMin: z.number().nullish().transform((v) => v ?? null),
  levelMax: z.number().nullish().transform((v) => v ?? null),
  visibility: z.enum(['public', 'clients', 'invite']).default('public'),
  courtId: z.string().nullish().transform((v) => v ?? null),
  locationName: optionalText(120),
  locationNote: optionalText(500),
}

export const offeringInput = z.object({ kind: z.enum(OFFERING_KINDS), ...detailFields, ...scheduleFields })
export const offeringUpdateInput = z.object({ offeringId: z.string(), ...detailFields, ...scheduleFields }).partial({
  title: true, description: true, discipline: true, audience: true, capacity: true, priceCents: true, paymentRule: true,
  acceptsCredits: true, levelSystem: true, levelMin: true, levelMax: true, visibility: true, courtId: true,
  locationName: true, locationNote: true, startDate: true, startTime: true, durationMinutes: true, slotsPerDay: true,
  repeatWeekdays: true, repeatEveryWeeks: true, endDate: true,
})

type OfferingFields = Omit<Offering, 'id' | 'providerId' | 'timezone' | 'status'>

/** Business rules shared by create and update. */
async function validate(db: Db, provider: ProviderSettings, o: OfferingFields): Promise<void> {
  if (o.kind === 'hitting' ? !provider.offersHitting : !provider.offersCoaching) {
    throw fail.forbidden(o.kind === 'hitting' ? 'Turn on paid hitting in your settings first.' : 'Turn on coaching in your settings first.')
  }
  if (o.paymentRule === 'free' && o.priceCents !== 0) throw fail.badRequest('Free sessions have no price.')
  if (o.paymentRule !== 'free' && o.priceCents < 100) throw fail.badRequest('Set a price of at least $1, or make it free.')
  if ((o.paymentRule === 'pay_now' || o.paymentRule === 'pay_after') && !provider.chargesEnabled) {
    throw fail.paymentRequired('Connect payouts first (Settings → Payouts) to take card payments. You can still use “pay outside the app”.')
  }
  if (o.acceptsCredits && o.paymentRule === 'free') throw fail.badRequest('Free sessions don’t use package credits.')
  if (o.kind === 'private' && o.capacity !== 1) throw fail.badRequest('Private lessons are for one player.')
  if (o.kind === 'semi_private' && (o.capacity < 2 || o.capacity > 4)) throw fail.badRequest('Semi-private is 2–4 players.')
  if (o.slotsPerDay > 1 && o.capacity !== 1) throw fail.badRequest('Open slots are one player each.')
  if (o.discipline && ['mens_doubles', 'womens_doubles', 'mixed_doubles'].includes(o.discipline) && o.kind !== 'group' && o.kind !== 'semi_private') {
    throw fail.badRequest('Men’s, women’s, and mixed formats are for groups.')
  }
  if (o.levelSystem) {
    const [lo, hi] = LEVEL_RANGES[o.levelSystem]
    for (const v of [o.levelMin, o.levelMax]) if (v !== null && (v < lo || v > hi)) throw fail.badRequest(`${o.levelSystem.toUpperCase()} levels run ${lo}–${hi}.`)
    if (o.levelMin !== null && o.levelMax !== null && o.levelMin > o.levelMax) throw fail.badRequest('Minimum level is above the maximum.')
  } else if (o.levelMin !== null || o.levelMax !== null) {
    throw fail.badRequest('Choose a rating system for the level range.')
  }
  if (o.audience !== 'adults' && provider.safetyStatus !== 'verified') {
    throw fail.forbidden('Sessions for juniors need a completed safety check (Settings → Coaching & hitting).')
  }
  if (o.courtId && !(await getCourt(db, provider.id, o.courtId))) throw fail.notFound('Court')
  if (o.endDate && o.endDate < o.startDate) throw fail.badRequest('End date is before the start date.')
}

function toSpec(o: Pick<Offering, 'timezone' | 'startDate' | 'startTime' | 'durationMinutes' | 'slotsPerDay' | 'repeatWeekdays' | 'repeatEveryWeeks' | 'endDate'>): RecurrenceSpec {
  return { ...o }
}

/** Inserts sessions for the offering between `from` and `through`, skipping ones that exist. */
async function generateSessions(db: Db, offering: Offering, from: string, through: string): Promise<number> {
  const now = Date.now()
  const occurrences = expand(toSpec(offering), from, through).filter((o) => o.startsAt.getTime() > now)
  for (const o of occurrences) {
    await db.query(
      `INSERT INTO sessions (id, offering_id, provider_id, starts_at, ends_at, capacity, price_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (offering_id, starts_at) DO NOTHING`,
      [newId('ses'), offering.id, offering.providerId, o.startsAt, o.endsAt, offering.capacity, offering.priceCents])
  }
  await db.query(`UPDATE offerings SET generated_through = $2 WHERE id = $1`, [offering.id, through])
  return occurrences.length
}

async function getOffering(db: Db, offeringId: string): Promise<Offering | null> {
  return maybeOne<Offering>(db, `SELECT ${OFFERING_COLUMNS} FROM offerings o WHERE o.id = $1`, [offeringId])
}

export async function requireOwnOffering(db: Db, providerId: string, offeringId: string): Promise<Offering> {
  const offering = await getOffering(db, offeringId)
  if (!offering || offering.providerId !== providerId) throw fail.notFound('Session series')
  return offering
}

export async function listOfferings(db: Db, providerId: string): Promise<Offering[]> {
  return db.query<Offering>(`SELECT ${OFFERING_COLUMNS} FROM offerings o WHERE o.provider_id = $1 AND o.status = 'active' ORDER BY o.created_at DESC`, [providerId])
}

export async function createOffering(db: Db, providerId: string, input: z.output<typeof offeringInput>): Promise<{ offering: Offering; sessionsCreated: number }> {
  const provider = await requireProvider(db, providerId)
  await validate(db, provider, input)
  const id = newId('off')
  return tx(async (t) => {
    await t.query(
      `INSERT INTO offerings (id, provider_id, kind, title, description, discipline, audience, capacity, price_cents,
         payment_rule, accepts_credits, level_system, level_min, level_max, visibility, court_id, location_name,
         location_note, timezone, start_date, start_time, duration_minutes, slots_per_day, repeat_weekdays,
         repeat_every_weeks, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [id, providerId, input.kind, input.title, input.description, input.discipline, input.audience, input.capacity,
        input.priceCents, input.paymentRule, input.acceptsCredits, input.levelSystem, input.levelMin, input.levelMax,
        input.visibility, input.courtId, input.locationName, input.locationNote, provider.timezone, input.startDate,
        input.startTime, input.durationMinutes, input.slotsPerDay, input.repeatWeekdays, input.repeatEveryWeeks, input.endDate])
    const offering = (await getOffering(t, id))!
    const today = todayIn(provider.timezone)
    const sessionsCreated = await generateSessions(t, offering, today, addDays(today, GENERATION_HORIZON_DAYS))
    if (sessionsCreated === 0) throw fail.badRequest('That schedule has no upcoming dates. Check the start date, days, and end date.')
    return { offering, sessionsCreated }
  })
}

const SCHEDULE_KEYS = ['startDate', 'startTime', 'durationMinutes', 'slotsPerDay', 'repeatWeekdays', 'repeatEveryWeeks', 'endDate'] as const

/**
 * Updates the series. Detail changes apply to all future sessions that weren't edited
 * individually. Schedule changes regenerate future sessions; sessions that already have
 * bookings are kept (and reported) so nobody's spot silently moves.
 */
export async function updateOffering(db: Db, providerId: string, input: z.output<typeof offeringUpdateInput>): Promise<{ offering: Offering; keptWithBookings: number }> {
  const current = await requireOwnOffering(db, providerId, input.offeringId)
  const provider = await requireProvider(db, providerId)
  const { offeringId, ...changes } = input
  const next = { ...current, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) } as Offering
  await validate(db, provider, next)
  const scheduleChanged = SCHEDULE_KEYS.some((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]))

  return tx(async (t) => {
    await updateRow(t, 'offerings', offeringId, {
      title: next.title, description: next.description, discipline: next.discipline, audience: next.audience,
      capacity: next.capacity, price_cents: next.priceCents, payment_rule: next.paymentRule, accepts_credits: next.acceptsCredits,
      level_system: next.levelSystem, level_min: next.levelMin, level_max: next.levelMax, visibility: next.visibility,
      court_id: next.courtId, location_name: next.locationName, location_note: next.locationNote, start_date: next.startDate,
      start_time: next.startTime, duration_minutes: next.durationMinutes, slots_per_day: next.slotsPerDay,
      repeat_weekdays: next.repeatWeekdays, repeat_every_weeks: next.repeatEveryWeeks, end_date: next.endDate,
    })
    // Lock future sessions first so the seat counts below include any booking committing right now.
    await t.query(`SELECT id FROM sessions WHERE offering_id = $1 AND starts_at > now() AND status = 'scheduled' FOR UPDATE`, [offeringId])
    await t.query(
      `UPDATE sessions SET capacity = GREATEST($2, (SELECT count(*) FROM bookings b WHERE b.session_id = sessions.id
         AND b.status IN ${SEAT_SQL})), price_cents = $3, updated_at = now()
       WHERE offering_id = $1 AND starts_at > now() AND status = 'scheduled' AND NOT detached`,
      [offeringId, next.capacity, next.priceCents])
    let keptWithBookings = 0
    if (scheduleChanged) {
      const kept = await t.query<{ id: string }>(
        `UPDATE sessions SET detached = true WHERE offering_id = $1 AND starts_at > now() AND status = 'scheduled'
           AND EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = sessions.id AND b.status IN ${OPEN_SQL})
         RETURNING id`, [offeringId])
      keptWithBookings = kept.length
      await t.query(
        `DELETE FROM sessions WHERE offering_id = $1 AND starts_at > now() AND status = 'scheduled' AND NOT detached
           AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = sessions.id)`, [offeringId])
      const today = todayIn(current.timezone)
      await generateSessions(t, (await getOffering(t, offeringId))!, today, addDays(today, GENERATION_HORIZON_DAYS))
    }
    return { offering: (await getOffering(t, offeringId))!, keptWithBookings }
  })
}

/** Stops the series. Future sessions without bookings disappear; booked ones stay until cancelled. */
export async function archiveOffering(db: Db, providerId: string, offeringId: string): Promise<{ keptWithBookings: number }> {
  await requireOwnOffering(db, providerId, offeringId)
  return tx(async (t) => {
    await t.query(`UPDATE offerings SET status = 'archived', updated_at = now() WHERE id = $1`, [offeringId])
    await t.query(
      `DELETE FROM sessions WHERE offering_id = $1 AND starts_at > now() AND status = 'scheduled'
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = sessions.id)`, [offeringId])
    const kept = await t.query(`SELECT 1 FROM sessions WHERE offering_id = $1 AND starts_at > now() AND status = 'scheduled'`, [offeringId])
    return { keptWithBookings: kept.length }
  })
}

/** Cron: keep every repeating series generated a full horizon ahead. */
export async function extendAllSessions(db: Db): Promise<number> {
  const offerings = await db.query<Offering & { generatedThrough: string | null }>(
    `SELECT ${OFFERING_COLUMNS}, o.generated_through AS "generatedThrough" FROM offerings o
     WHERE o.status = 'active' AND o.repeat_weekdays IS NOT NULL AND (o.end_date IS NULL OR o.end_date >= CURRENT_DATE)`)
  let created = 0
  await forEachIsolated(offerings, 'offerings.extend_failed', (o) => o.id, async (offering) => {
    const today = todayIn(offering.timezone)
    const through = addDays(today, GENERATION_HORIZON_DAYS)
    if (offering.generatedThrough && offering.generatedThrough >= through) return
    created += await tx((t) => generateSessions(t, offering, offering.generatedThrough ? addDays(offering.generatedThrough, 1) : today, through))
  })
  return created
}
