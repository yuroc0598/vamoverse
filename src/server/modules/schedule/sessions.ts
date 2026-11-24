// Session read models (one query shape reused everywhere) and single-session edits.
import { z } from 'zod'
import { zonedParts, zonedToUtc } from '@/lib/time'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { cents, isoDate, optionalText, wallTime } from '../../schemas'
import { SEAT_SQL } from '../bookings/status'
import type { LevelSystem, OfferingKind, PaymentRule } from '@/lib/format'

export interface SessionView {
  id: string
  offeringId: string
  providerId: string
  providerUserId: string
  providerSlug: string
  providerName: string
  kind: OfferingKind
  title: string
  description: string | null
  discipline: string | null
  audience: 'adults' | 'juniors' | 'all'
  visibility: 'public' | 'clients' | 'invite'
  startsAt: Date
  endsAt: Date
  timezone: string
  capacity: number
  priceCents: number
  paymentRule: PaymentRule
  acceptsCredits: boolean
  levelSystem: LevelSystem | null
  levelMin: number | null
  levelMax: number | null
  status: 'scheduled' | 'cancelled' | 'completed'
  /** The series is archived when the provider stops it (or leaves); its sessions can't be booked. */
  offeringStatus: 'active' | 'archived'
  started: boolean
  cancelReason: string | null
  courtStatus: 'unknown' | 'walk_up' | 'booked' | 'needs_booking'
  courtConfirmation: string | null
  locationName: string | null
  locationAddress: string | null
  locationNote: string | null
  courtBookingUrl: string | null
  courtBookingNote: string | null
  note: string | null
  seatsTaken: number
  waitlistCount: number
  requestedCount: number
  cancelWindowHours: number
  lateCancelFeePct: number
  noShowFeePct: number
}

export const SESSION_SELECT = `
  SELECT s.id, s.offering_id AS "offeringId", s.provider_id AS "providerId", pr.user_id AS "providerUserId", pr.slug AS "providerSlug",
    u.display_name AS "providerName", o.kind, o.title, o.description, o.discipline, o.audience, o.visibility,
    s.starts_at AS "startsAt", s.ends_at AS "endsAt", o.timezone, s.capacity, s.price_cents AS "priceCents",
    o.payment_rule AS "paymentRule", o.accepts_credits AS "acceptsCredits", o.level_system AS "levelSystem",
    o.level_min AS "levelMin", o.level_max AS "levelMax", s.status, o.status AS "offeringStatus", s.starts_at <= now() AS started, s.cancel_reason AS "cancelReason",
    s.court_status AS "courtStatus", s.court_confirmation AS "courtConfirmation",
    COALESCE(c.name, o.location_name) AS "locationName", c.address AS "locationAddress",
    concat_ws(' · ', c.notes, o.location_note) AS "locationNote", c.booking_url AS "courtBookingUrl",
    c.booking_note AS "courtBookingNote", s.note,
    (SELECT count(*) FROM bookings b WHERE b.session_id = s.id AND b.status IN ${SEAT_SQL})::int AS "seatsTaken",
    (SELECT count(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'waitlisted')::int AS "waitlistCount",
    (SELECT count(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'requested')::int AS "requestedCount",
    pr.cancel_window_hours AS "cancelWindowHours", pr.late_cancel_fee_pct AS "lateCancelFeePct", pr.no_show_fee_pct AS "noShowFeePct"
  FROM sessions s
  JOIN offerings o ON o.id = s.offering_id
  JOIN providers pr ON pr.id = s.provider_id
  JOIN users u ON u.id = pr.user_id
  LEFT JOIN courts c ON c.id = o.court_id`

export async function getSession(db: Db, sessionId: string): Promise<SessionView | null> {
  return maybeOne<SessionView>(db, `${SESSION_SELECT} WHERE s.id = $1`, [sessionId])
}

export async function requireSession(db: Db, sessionId: string): Promise<SessionView> {
  const session = await getSession(db, sessionId)
  if (!session) throw fail.notFound('Session')
  return session
}

export async function requireOwnSession(db: Db, providerId: string, sessionId: string): Promise<SessionView> {
  const session = await getSession(db, sessionId)
  if (!session || session.providerId !== providerId) throw fail.notFound('Session')
  return session
}

export async function listProviderSessions(db: Db, providerId: string, from: Date, to: Date): Promise<SessionView[]> {
  return db.query<SessionView>(
    `${SESSION_SELECT} WHERE s.provider_id = $1 AND s.starts_at >= $2 AND s.starts_at < $3 ORDER BY s.starts_at`,
    [providerId, from, to])
}

/**
 * Upcoming bookable sessions on a provider's public page. Open slots that are taken,
 * or that overlap another session the provider is already teaching, are hidden.
 */
export async function listPublicSessions(db: Db, providerId: string, days = 28): Promise<SessionView[]> {
  return db.query<SessionView>(
    `${SESSION_SELECT}
     WHERE s.provider_id = $1 AND s.status = 'scheduled' AND o.status = 'active' AND o.visibility = 'public'
       AND s.starts_at > now() AND s.starts_at < now() + make_interval(days => $2)
       AND NOT (s.capacity = 1 AND EXISTS (
         SELECT 1 FROM sessions s2 JOIN bookings b2 ON b2.session_id = s2.id AND b2.status IN ${SEAT_SQL}
         WHERE s2.provider_id = s.provider_id AND s2.status = 'scheduled'
           AND s2.starts_at < s.ends_at AND s2.ends_at > s.starts_at))
     ORDER BY s.starts_at`,
    [providerId, days])
}

export const sessionUpdateInput = z.object({
  sessionId: z.string(),
  date: isoDate.optional(),
  startTime: wallTime.optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  capacity: z.number().int().min(1).max(40).optional(),
  priceCents: cents.optional(),
  note: optionalText(500).optional(),
  courtStatus: z.enum(['unknown', 'walk_up', 'booked', 'needs_booking']).optional(),
  courtConfirmation: optionalText(120).optional(),
})

/** Edits one session; it stops following later series edits. Returns whether the time moved. */
export async function updateSession(db: Db, providerId: string, input: z.output<typeof sessionUpdateInput>): Promise<{ session: SessionView; moved: boolean }> {
  const current = await requireOwnSession(db, providerId, input.sessionId)
  if (current.status !== 'scheduled') throw fail.conflict('This session is no longer scheduled.')
  const local = zonedParts(new Date(current.startsAt), current.timezone)
  const startsAt = zonedToUtc(input.date ?? local.date, input.startTime ?? local.time, current.timezone)
  const duration = input.durationMinutes ?? Math.round((new Date(current.endsAt).getTime() - new Date(current.startsAt).getTime()) / 60_000)
  const endsAt = new Date(startsAt.getTime() + duration * 60_000)
  const moved = startsAt.getTime() !== new Date(current.startsAt).getTime() || endsAt.getTime() !== new Date(current.endsAt).getTime()
  if (moved && startsAt.getTime() <= Date.now()) throw fail.badRequest('Pick a time in the future.')
  if (input.capacity !== undefined && input.capacity < current.seatsTaken) {
    throw fail.conflict(`${current.seatsTaken} players are already booked; capacity can’t go below that.`)
  }
  await db.query(
    `UPDATE sessions SET starts_at = $2, ends_at = $3, capacity = COALESCE($4, capacity), price_cents = COALESCE($5, price_cents),
       note = CASE WHEN $6::boolean THEN $7 ELSE note END, court_status = COALESCE($8, court_status),
       court_confirmation = CASE WHEN $9::boolean THEN $10 ELSE court_confirmation END, detached = true, updated_at = now()
     WHERE id = $1`,
    [current.id, startsAt, endsAt, input.capacity ?? null, input.priceCents ?? null, input.note !== undefined, input.note ?? null,
      input.courtStatus ?? null, input.courtConfirmation !== undefined, input.courtConfirmation ?? null])
  return { session: (await getSession(db, current.id))!, moved }
}
