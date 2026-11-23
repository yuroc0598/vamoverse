// Find coaches, hitting partners, and open sessions. Sorted by soonest availability,
// because "who can I play with this week" is the question players actually ask.
import { z } from 'zod'
import type { Db } from '../../db'
import { SEAT_SQL } from '../bookings/status'
import { SESSION_SELECT, type SessionView } from '../schedule/sessions'

export const findInput = z.object({
  type: z.enum(['coaching', 'hitting', 'any']).default('any'),
  area: z.string().trim().max(80).optional(),
  query: z.string().trim().max(80).optional(),
})

export interface FoundProvider {
  id: string
  slug: string
  name: string
  headline: string | null
  homeArea: string | null
  offersCoaching: boolean
  offersHitting: boolean
  ratePrivateCents: number | null
  rateHittingCents: number | null
  safetyVerified: boolean
  ownNtrp: number | null
  ownUtr: number | null
  nextOpening: Date | null
  openSessions: number
}

const OPEN_SESSION = `s.status = 'scheduled' AND s.starts_at > now() AND s.starts_at < now() + interval '14 days'
  AND o.status = 'active' AND o.visibility = 'public'
  AND (SELECT count(*) FROM bookings b WHERE b.session_id = s.id AND b.status IN ${SEAT_SQL}) < s.capacity`

export async function findProviders(db: Db, input: z.output<typeof findInput>): Promise<FoundProvider[]> {
  return db.query<FoundProvider>(
    `SELECT pr.id, pr.slug, u.display_name AS name, pr.headline, pr.home_area AS "homeArea",
       pr.offers_coaching AS "offersCoaching", pr.offers_hitting AS "offersHitting",
       pr.rate_private_cents AS "ratePrivateCents", pr.rate_hitting_cents AS "rateHittingCents",
       pr.safety_status = 'verified' AS "safetyVerified", pl.ntrp AS "ownNtrp", COALESCE(pl.utr_singles, pl.utr_doubles) AS "ownUtr",
       (SELECT min(s.starts_at) FROM sessions s JOIN offerings o ON o.id = s.offering_id
         WHERE s.provider_id = pr.id AND ${OPEN_SESSION} AND ($1 = 'any' OR (o.kind = 'hitting') = ($1 = 'hitting'))) AS "nextOpening",
       (SELECT count(*) FROM sessions s JOIN offerings o ON o.id = s.offering_id
         WHERE s.provider_id = pr.id AND ${OPEN_SESSION} AND ($1 = 'any' OR (o.kind = 'hitting') = ($1 = 'hitting')))::int AS "openSessions"
     FROM providers pr JOIN users u ON u.id = pr.user_id JOIN players pl ON pl.user_id = pr.user_id
     WHERE pr.listed AND ($1 = 'any' OR ($1 = 'hitting' AND pr.offers_hitting) OR ($1 = 'coaching' AND pr.offers_coaching))
       AND ($2::text IS NULL OR pr.home_area ILIKE '%' || $2 || '%'
            OR EXISTS (SELECT 1 FROM courts c WHERE c.provider_id = pr.id AND (c.name ILIKE '%' || $2 || '%' OR c.address ILIKE '%' || $2 || '%')))
       AND ($3::text IS NULL OR u.display_name ILIKE '%' || $3 || '%' OR pr.headline ILIKE '%' || $3 || '%' OR pr.bio ILIKE '%' || $3 || '%')
     ORDER BY "nextOpening" NULLS LAST, name LIMIT 50`,
    [input.type, input.area || null, input.query || null])
}

export async function findSessions(db: Db, input: z.output<typeof findInput>): Promise<SessionView[]> {
  return db.query<SessionView>(
    `${SESSION_SELECT}
     WHERE pr.listed AND ${OPEN_SESSION} AND s.capacity > 1
       AND ($1 = 'any' OR (o.kind = 'hitting') = ($1 = 'hitting'))
       AND ($2::text IS NULL OR pr.home_area ILIKE '%' || $2 || '%' OR c.name ILIKE '%' || $2 || '%' OR c.address ILIKE '%' || $2 || '%' OR o.location_name ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR o.title ILIKE '%' || $3 || '%' OR u.display_name ILIKE '%' || $3 || '%')
     ORDER BY s.starts_at LIMIT 30`,
    [input.type, input.area || null, input.query || null])
}
