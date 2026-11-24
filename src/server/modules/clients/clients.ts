// A provider's roster ("crew"). People become clients only by their own action (joining or
// booking). Imported contacts are invites holding only what the coach typed: nothing is looked
// up, created, or sent on the coach's behalf.
import { z } from 'zod'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { personName, optionalText } from '../../schemas'
import { OPEN_SQL } from '../bookings/status'
import { newId } from '../../ids'
import { requirePublicProvider } from '../providers/profile'
import { normalizeEmail, normalizePhone, type Actor } from '../users/accounts'
import { requireManagedPlayer } from '../users/players'

export interface Client {
  playerId: string
  playerName: string
  junior: boolean
  contactUserId: string
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  status: 'active' | 'archived'
  source: string
  notes: string | null
  upcoming: number
  lastSessionAt: Date | null
  owedCents: number
}

export async function listClients(db: Db, providerId: string, opts: { search?: string; includeArchived?: boolean } = {}): Promise<Client[]> {
  return db.query<Client>(
    `SELECT p.id AS "playerId", p.display_name AS "playerName", p.guardian_user_id IS NOT NULL AS junior,
       u.id AS "contactUserId", u.display_name AS "contactName", u.email AS "contactEmail", u.phone AS "contactPhone",
       c.status, c.source, c.notes,
       (SELECT count(*) FROM bookings b JOIN sessions s ON s.id = b.session_id
         WHERE b.player_id = p.id AND b.provider_id = c.provider_id AND s.starts_at > now() AND b.status IN ${OPEN_SQL})::int AS upcoming,
       (SELECT max(s.starts_at) FROM bookings b JOIN sessions s ON s.id = b.session_id
         WHERE b.player_id = p.id AND b.provider_id = c.provider_id AND b.status = 'attended') AS "lastSessionAt",
       (SELECT COALESCE(sum(b.price_cents), 0) FROM bookings b
         WHERE b.player_id = p.id AND b.provider_id = c.provider_id AND b.payment_status IN ('due','failed')
           AND b.status IN ('attended','no_show','late_cancelled'))::int AS "owedCents"
     FROM clients c JOIN players p ON p.id = c.player_id JOIN users u ON u.id = COALESCE(p.user_id, p.guardian_user_id)
     WHERE c.provider_id = $1 AND ($2 OR c.status = 'active')
       AND ($3::text IS NULL OR p.display_name ILIKE '%' || $3 || '%' OR u.display_name ILIKE '%' || $3 || '%')
     ORDER BY p.display_name`, [providerId, Boolean(opts.includeArchived), opts.search?.trim() || null])
}

export const contactRow = z.object({
  name: personName,
  email: z.email().nullish().transform((v) => v || null),
  phone: z.string().trim().max(32).nullish().transform((v) => v || null),
})

export interface Invite { id: string; name: string; email: string | null; phone: string | null; createdAt: Date }
export interface ImportResult { added: number; duplicates: number; failed: { name: string; reason: string }[] }

const MAX_PENDING_INVITES = 2000

/** Saves contacts as pending invites. The coach sends them from their own phone or email. */
export async function importInvites(db: Db, providerId: string, rows: z.output<typeof contactRow>[]): Promise<ImportResult> {
  const pending = (await maybeOne<{ n: number }>(db, `SELECT count(*)::int AS n FROM client_invites WHERE provider_id = $1 AND status = 'pending'`, [providerId]))!.n
  if (pending + rows.length > MAX_PENDING_INVITES) throw fail.conflict(`You can have up to ${MAX_PENDING_INVITES} pending invites. Remove some first.`)
  const result: ImportResult = { added: 0, duplicates: 0, failed: [] }
  for (const row of rows) {
    try {
      if (!row.email && !row.phone) throw fail.badRequest('Needs an email or phone number')
      const inserted = await db.query(
        `INSERT INTO client_invites (id, provider_id, name, email, phone) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
        [newId('inv'), providerId, row.name, normalizeEmail(row.email), normalizePhone(row.phone)])
      if (inserted.length) result.added++
      else result.duplicates++
    } catch (error) {
      result.failed.push({ name: row.name, reason: error instanceof Error ? error.message : 'Could not add' })
    }
  }
  return result
}

export async function listInvites(db: Db, providerId: string): Promise<Invite[]> {
  return db.query<Invite>(
    `SELECT id, name, email, phone, created_at AS "createdAt" FROM client_invites
     WHERE provider_id = $1 AND status = 'pending' ORDER BY name`, [providerId])
}

export async function removeInvite(db: Db, providerId: string, inviteId: string): Promise<void> {
  await db.query(`DELETE FROM client_invites WHERE id = $1 AND provider_id = $2 AND status = 'pending'`, [inviteId, providerId])
}

/**
 * Makes a player a client because of their own action (booking, or joining from the coach's
 * link), and marks any pending invite for their contact as joined.
 */
export async function addClient(db: Db, providerId: string, playerId: string, source: 'booking' | 'join'): Promise<void> {
  await db.query(
    `INSERT INTO clients (provider_id, player_id, source) VALUES ($1, $2, $3)
     ON CONFLICT (provider_id, player_id) DO UPDATE SET status = 'active'`, [providerId, playerId, source])
  await db.query(
    `UPDATE client_invites i SET status = 'joined', joined_player_id = $2, joined_at = now()
     FROM players p JOIN users u ON u.id = COALESCE(p.user_id, p.guardian_user_id)
     WHERE p.id = $2 AND i.provider_id = $1 AND i.status = 'pending'
       AND ((i.email IS NOT NULL AND lower(i.email) = lower(u.email)) OR (i.phone IS NOT NULL AND i.phone = u.phone))`,
    [providerId, playerId])
}

export const clientUpdateInput = z.object({ playerId: z.string(), notes: optionalText(2000).optional(), status: z.enum(['active', 'archived']).optional() })

export async function updateClient(db: Db, providerId: string, input: z.output<typeof clientUpdateInput>): Promise<void> {
  const rows = await db.query(
    `UPDATE clients SET notes = CASE WHEN $3::boolean THEN $4 ELSE notes END, status = COALESCE($5, status)
     WHERE provider_id = $1 AND player_id = $2 RETURNING player_id`,
    [providerId, input.playerId, input.notes !== undefined, input.notes ?? null, input.status ?? null])
  if (!rows.length) throw fail.notFound('Student')
}

/** A player (or guardian, for a junior) joins a coach's crew from their share link. */
export async function joinCrew(db: Db, actor: Actor, slug: string, playerId?: string): Promise<{ providerName: string }> {
  const provider = await requirePublicProvider(db, slug)
  const player = await requireManagedPlayer(db, actor, playerId ?? actor.playerId)
  await addClient(db, provider.id, player.id, 'join')
  return { providerName: provider.displayName }
}

/** A player (or guardian) leaves a provider's crew: no more messages or invites from them. */
export async function leaveCrew(db: Db, actor: Actor, providerId: string): Promise<void> {
  await db.query(
    `DELETE FROM clients c USING players p WHERE c.provider_id = $1 AND p.id = c.player_id AND (p.user_id = $2 OR p.guardian_user_id = $2)`,
    [providerId, actor.userId])
  await db.query(
    `DELETE FROM conversation_members m USING conversations c
     WHERE m.conversation_id = c.id AND c.provider_id = $1 AND m.user_id = $2`, [providerId, actor.userId])
}

export interface MyCoach { providerId: string; slug: string; name: string; headline: string | null; offersCoaching: boolean; offersHitting: boolean }

export async function listMyCoaches(db: Db, actor: Actor): Promise<MyCoach[]> {
  return db.query<MyCoach>(
    `SELECT DISTINCT pr.id AS "providerId", pr.slug, u.display_name AS name, pr.headline,
       pr.offers_coaching AS "offersCoaching", pr.offers_hitting AS "offersHitting"
     FROM clients c JOIN players p ON p.id = c.player_id JOIN providers pr ON pr.id = c.provider_id JOIN users u ON u.id = pr.user_id
     WHERE c.status = 'active' AND (p.user_id = $1 OR p.guardian_user_id = $1) ORDER BY name`, [actor.userId])
}

export async function isClientOf(db: Db, providerId: string, playerId: string): Promise<boolean> {
  return Boolean(await maybeOne(db, `SELECT 1 FROM clients WHERE provider_id = $1 AND player_id = $2`, [providerId, playerId]))
}

/** Whether the user (or a junior they manage) is an active client of the provider. */
export async function isClientUser(db: Db, providerId: string, userId: string): Promise<boolean> {
  return Boolean(await maybeOne(db,
    `SELECT 1 FROM clients c JOIN players p ON p.id = c.player_id
     WHERE c.provider_id = $1 AND c.status = 'active' AND (p.user_id = $2 OR p.guardian_user_id = $2)`, [providerId, userId]))
}
