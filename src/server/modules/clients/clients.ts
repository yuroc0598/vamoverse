// A provider's roster ("crew"): who they teach, how to reach them, and import from contacts.
import { z } from 'zod'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { personName, optionalText } from '../../schemas'
import { OPEN_SQL } from '../bookings/status'
import { enqueue } from '../notifications/outbox'
import { requirePublicProvider } from '../providers/profile'
import { findOrCreateAccount, findUserIdByContact, normalizePhone, type Actor } from '../users/accounts'
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

export interface ImportResult { added: number; alreadyClients: number; failed: { name: string; reason: string }[] }

/**
 * Adds contacts to the roster. Each becomes an account they claim by signing in with the
 * same email/phone, so the coach can book them right away. Juniors are added by parents.
 */
export async function importClients(db: Db, provider: { id: string; name: string; slug: string }, rows: z.output<typeof contactRow>[]): Promise<ImportResult> {
  const result: ImportResult = { added: 0, alreadyClients: 0, failed: [] }
  for (const row of rows) {
    try {
      if (!row.email && !row.phone) throw fail.badRequest('Needs an email or phone number')
      if (row.phone) normalizePhone(row.phone)
      const existed = Boolean(await findUserIdByContact(db, row))
      const account = await findOrCreateAccount(db, row)
      const inserted = await db.query(
        `INSERT INTO clients (provider_id, player_id, source) VALUES ($1, $2, 'import') ON CONFLICT DO NOTHING RETURNING player_id`,
        [provider.id, account.playerId])
      if (!inserted.length) { result.alreadyClients++; continue }
      result.added++
      await enqueue(db, {
        userId: account.userId, kind: 'client.added', title: `${provider.name} added you on Vamoverse`,
        body: existed
          ? `You can now see ${provider.name}’s sessions and messages. Not your coach? Leave their crew from their page.`
          : `See ${provider.name}’s sessions and book in one tap. No app needed.`,
        link: `/p/${provider.slug}`,
        dedupeKey: `client.added:${provider.id}:${account.playerId}`,
      })
    } catch (error) {
      result.failed.push({ name: row.name, reason: error instanceof Error ? error.message : 'Could not add' })
    }
  }
  return result
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
  await db.query(
    `INSERT INTO clients (provider_id, player_id, source) VALUES ($1, $2, 'join')
     ON CONFLICT (provider_id, player_id) DO UPDATE SET status = 'active'`, [provider.id, player.id])
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
