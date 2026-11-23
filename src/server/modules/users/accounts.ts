// User accounts: creation on first sign-in, lookup by contact, and the Actor view
// (user + own player profile + provider profile) that every command runs as.
import { authMode } from '../../config'
import { maybeOne, tx, type Db } from '../../db'
import { fail, isUniqueViolation } from '../../errors'
import { newId } from '../../ids'
import { OPEN_SQL, SEAT_SQL } from '../bookings/status'

export interface Identity {
  id: string
  email?: string | null
  phone?: string | null
  name?: string | null
}

export interface Actor {
  userId: string
  email: string | null
  phone: string | null
  displayName: string
  isAdmin: boolean
  adultConfirmed: boolean
  onboarded: boolean
  playerId: string
  providerId: string | null
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

/** US-first E.164 normalization: "(415) 555-0100" → "+14155550100". */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null
  const digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  throw fail.badRequest('Enter a valid phone number.')
}

function fallbackName(identity: Identity): string {
  return identity.name?.trim() || identity.email?.split('@')[0] || 'Player'
}

const ACTOR_SQL = `
  SELECT u.id AS "userId", u.email, u.phone, u.display_name AS "displayName", u.is_admin AS "isAdmin",
         u.adult_confirmed_at IS NOT NULL AS "adultConfirmed", u.onboarded_at IS NOT NULL AS "onboarded",
         p.id AS "playerId", pr.id AS "providerId"
  FROM users u
  JOIN players p ON p.user_id = u.id
  LEFT JOIN providers pr ON pr.user_id = u.id
  WHERE u.id = $1`

/** A person's name lives on their account and their own player profile; change both together. */
export async function setDisplayName(db: Db, userId: string, name: string): Promise<void> {
  await db.query(`UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`, [userId, name])
  await db.query(`UPDATE players SET display_name = $2, updated_at = now() WHERE user_id = $1`, [userId, name])
}

export async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  return maybeOne<Actor>(db, ACTOR_SQL, [userId])
}

/** Inserts the user and their own player profile. */
async function insertUser(db: Db, identity: Identity): Promise<void> {
  const name = fallbackName(identity).slice(0, 80)
  try {
    await db.query(
      `INSERT INTO users (id, email, phone, display_name) VALUES ($1, $2, $3, $4)`,
      [identity.id, normalizeEmail(identity.email), normalizePhone(identity.phone), name],
    )
  } catch (error) {
    if (isUniqueViolation(error)) throw fail.conflict('An account with that email or phone already exists. Sign in instead.')
    throw error
  }
  await db.query(`INSERT INTO players (id, user_id, display_name) VALUES ($1, $2, $3)`, [newId('ply'), identity.id, name])
}

/** Resolves the actor for a signed-in identity, creating the account on first sight. */
export async function ensureActor(db: Db, identity: Identity): Promise<Actor> {
  const existing = await loadActor(db, identity.id)
  if (existing) return existing
  await insertUser(db, identity)
  const created = await loadActor(db, identity.id)
  if (!created) throw new Error('Account creation failed')
  return created
}

export interface AccountDetails {
  displayName: string
  email: string | null
  phone: string | null
  notifyEmail: boolean
  notifySms: boolean
}

export async function getAccount(db: Db, userId: string): Promise<AccountDetails> {
  const row = await maybeOne<AccountDetails>(db,
    `SELECT display_name AS "displayName", email, phone, notify_email AS "notifyEmail", notify_sms AS "notifySms"
     FROM users WHERE id = $1`, [userId])
  if (!row) throw fail.notFound('Account')
  return row
}

/**
 * Deletes an account. Juniors and personal data are removed; payment records stay for
 * accounting with the person anonymized. Open bookings and booked sessions must be cancelled first.
 */
export async function deleteAccount(db: Db, actor: Actor): Promise<void> {
  const blocking = await maybeOne<{ reason: string }>(db,
    `SELECT 'booking' AS reason FROM bookings b JOIN players p ON p.id = b.player_id JOIN sessions s ON s.id = b.session_id
       WHERE (p.user_id = $1 OR p.guardian_user_id = $1 OR b.booked_by_user_id = $1) AND s.starts_at > now()
         AND b.status IN ${OPEN_SQL}
     UNION ALL
     SELECT 'teaching' FROM bookings b JOIN sessions s ON s.id = b.session_id JOIN providers pr ON pr.id = b.provider_id
       WHERE pr.user_id = $1 AND s.starts_at > now() AND b.status IN ${SEAT_SQL}
     LIMIT 1`, [actor.userId])
  if (blocking) {
    throw fail.conflict(blocking.reason === 'teaching'
      ? 'Cancel your upcoming booked sessions first so your players are told and refunded.'
      : 'Cancel your upcoming bookings first.')
  }
  await tx(async (t) => {
    await t.query(`DELETE FROM players WHERE guardian_user_id = $1`, [actor.userId])
    await t.query(`DELETE FROM conversation_members WHERE user_id = $1`, [actor.userId])
    for (const table of ['assistant_messages', 'assistant_pending_actions', 'notifications', 'payment_methods']) {
      await t.query(`DELETE FROM ${table} WHERE user_id = $1`, [actor.userId])
    }
    await t.query(`UPDATE providers SET listed = false, bio = NULL, headline = NULL, slug = 'deleted-' || substr(md5(id), 1, 12) WHERE user_id = $1`, [actor.userId])
    await t.query(`UPDATE players SET display_name = 'Deleted player', birth_date = NULL, gender = NULL, utr_singles = NULL, utr_doubles = NULL,
                     ntrp = NULL, wtn = NULL, utr_profile_id = NULL WHERE user_id = $1`, [actor.userId])
    await t.query(`UPDATE users SET display_name = 'Deleted user', email = 'deleted+' || id || '@invalid', phone = NULL, avatar_url = NULL,
                     notify_email = false, notify_sms = false, stripe_customer_id = NULL WHERE id = $1`, [actor.userId])
  })
  if (authMode() === 'supabase') {
    const { supabaseAdminClient } = await import('../../auth/supabase')
    await supabaseAdminClient().auth.admin.deleteUser(actor.userId)
  }
}

export async function findUserIdByContact(db: Db, contact: { email?: string | null; phone?: string | null }): Promise<string | null> {
  const email = normalizeEmail(contact.email)
  const phone = normalizePhone(contact.phone)
  if (!email && !phone) return null
  const row = await maybeOne<{ id: string }>(db,
    `SELECT id FROM users WHERE ($1::text IS NOT NULL AND lower(email) = $1) OR ($2::text IS NOT NULL AND phone = $2) LIMIT 1`,
    [email, phone])
  return row?.id ?? null
}

/** Creates an auth identity for someone who hasn't signed up yet (guest checkout, invites). */
async function createAuthIdentity(email: string | null, phone: string | null): Promise<string> {
  if (authMode() === 'dev') return newId('usr')
  const { supabaseAdminClient } = await import('../../auth/supabase')
  const { data, error } = await supabaseAdminClient().auth.admin.createUser({
    email: email ?? undefined, phone: phone ?? undefined, email_confirm: false, phone_confirm: false,
  })
  if (error || !data.user) throw fail.conflict('That email or phone already has an account. Sign in to continue.')
  return data.user.id
}

/** Finds the account for a contact, or creates one (the person claims it by signing in later). */
export async function findOrCreateAccount(db: Db, contact: { email?: string | null; phone?: string | null; name: string }): Promise<Actor> {
  const existingId = await findUserIdByContact(db, contact)
  if (existingId) {
    const actor = await loadActor(db, existingId)
    if (actor) return actor
  }
  const email = normalizeEmail(contact.email)
  const phone = normalizePhone(contact.phone)
  if (!email && !phone) throw fail.badRequest('Enter an email or phone number.')
  const id = await createAuthIdentity(email, phone)
  return ensureActor(db, { id, email, phone, name: contact.name })
}
