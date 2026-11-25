// User accounts: creation on first sign-in, lookup by contact, and the Actor view
// (user + own player profile + provider profile) that every command runs as.
import { authMode } from '../../config'
import { maybeOne, tx, type Db } from '../../db'
import { fail, isUniqueViolation } from '../../errors'
import { newId } from '../../ids'
import { UNSETTLED_NOTE, UNSETTLED_SQL } from '../bookings/status'
import { forgetPlayersInBookings } from './players'

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

export function normalizeEmail(email: string | null | undefined): string | null {
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

export async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  return maybeOne<Actor>(db, ACTOR_SQL, [userId])
}

/**
 * Inserts the user and their own player profile. Idempotent: concurrent first requests both
 * succeed, and a half-created account (user without player) is completed on the next call.
 */
async function insertUser(db: Db, identity: Identity): Promise<void> {
  const name = fallbackName(identity).slice(0, 80)
  try {
    await db.query(
      `INSERT INTO users (id, email, phone, display_name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [identity.id, normalizeEmail(identity.email), normalizePhone(identity.phone), name],
    )
  } catch (error) {
    // A *different* account already uses this email or phone.
    if (isUniqueViolation(error)) throw fail.conflict('An account with that email or phone already exists. Sign in instead.')
    throw error
  }
  await db.query(`INSERT INTO players (id, user_id, display_name) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`, [newId('ply'), identity.id, name])
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
  /** Push notifications to the iPhone app (on phones where it's installed and allowed). */
  notifyPush: boolean
}

export async function getAccount(db: Db, userId: string): Promise<AccountDetails> {
  const row = await maybeOne<AccountDetails>(db,
    `SELECT display_name AS "displayName", email, phone, notify_email AS "notifyEmail", notify_sms AS "notifySms",
       notify_push AS "notifyPush"
     FROM users WHERE id = $1`, [userId])
  if (!row) throw fail.notFound('Account')
  return row
}

const DELETION_BLOCKERS = {
  booking: `Cancel your upcoming bookings first. ${UNSETTLED_NOTE}`,
  teaching: `Cancel your upcoming booked sessions first so your players are told and refunded. ${UNSETTLED_NOTE}`,
  owing: 'Settle what you owe first: pay from the booking, or ask your coach to mark it paid or waive it.',
}

/** Why an account can't be deleted yet: open bookings, booked sessions it teaches, or money it owes. */
async function deletionBlocker(t: Db, userId: string): Promise<string | null> {
  const row = await maybeOne<{ reason: keyof typeof DELETION_BLOCKERS }>(t,
    `SELECT 'booking' AS reason FROM bookings b LEFT JOIN players p ON p.id = b.player_id JOIN sessions s ON s.id = b.session_id
       WHERE (p.user_id = $1 OR p.guardian_user_id = $1 OR b.booked_by_user_id = $1) AND ${UNSETTLED_SQL}
     UNION ALL
     SELECT 'teaching' FROM bookings b JOIN sessions s ON s.id = b.session_id JOIN providers pr ON pr.id = b.provider_id
       WHERE pr.user_id = $1 AND ${UNSETTLED_SQL}
     UNION ALL
     SELECT 'owing' FROM bookings b WHERE b.booked_by_user_id = $1 AND b.payment_status IN ('due','failed')
     LIMIT 1`, [userId])
  return row ? DELETION_BLOCKERS[row.reason] : null
}

/**
 * Deletes an account. Juniors and personal data are removed; payment records stay for
 * accounting with the person anonymized. Open bookings, booked sessions, and money owed must
 * be settled first; money owed *to* a deleted coach is written off.
 */
export async function deleteAccount(db: Db, actor: Actor): Promise<void> {
  await tx(async (t) => {
    // Booking takes the session's lock, so holding these keeps a new booking from landing
    // between the check and the cancellation below.
    await t.query(`SELECT 1 FROM sessions s JOIN providers pr ON pr.id = s.provider_id WHERE pr.user_id = $1 AND s.status = 'scheduled' FOR UPDATE OF s`, [actor.userId])
    const blocker = await deletionBlocker(t, actor.userId)
    if (blocker) throw fail.conflict(blocker)
    const players = await t.query<{ id: string }>(`SELECT id FROM players WHERE guardian_user_id = $1 OR user_id = $1`, [actor.userId])
    await forgetPlayersInBookings(t, players.map((p) => p.id))
    await t.query(`DELETE FROM players WHERE guardian_user_id = $1`, [actor.userId])
    await t.query(`DELETE FROM conversation_members WHERE user_id = $1`, [actor.userId])
    // devices: a deleted account must never get another push on a phone it was signed in on.
    for (const table of ['assistant_messages', 'assistant_pending_actions', 'notifications', 'payment_methods', 'devices']) {
      await t.query(`DELETE FROM ${table} WHERE user_id = $1`, [actor.userId])
    }
    // A deleted coach's business stops: no series, no future sessions, no way to take money.
    await t.query(`UPDATE offerings o SET status = 'archived' FROM providers pr WHERE pr.user_id = $1 AND o.provider_id = pr.id`, [actor.userId])
    await t.query(`UPDATE sessions s SET status = 'cancelled', cancel_reason = 'No longer offered' FROM providers pr
                   WHERE pr.user_id = $1 AND s.provider_id = pr.id AND s.status = 'scheduled' AND s.starts_at > now()`, [actor.userId])
    // Money still owed to the coach (charges waiting for payouts, failed cards) won't be collected any more.
    await t.query(`UPDATE payments p SET status = 'canceled', updated_at = now() FROM providers pr
                   WHERE pr.user_id = $1 AND p.provider_id = pr.id AND p.status IN ('pending','failed')`, [actor.userId])
    await t.query(`UPDATE bookings b SET payment_status = 'waived', updated_at = now() FROM providers pr
                   WHERE pr.user_id = $1 AND b.provider_id = pr.id AND b.payment_status IN ('due','failed')`, [actor.userId])
    await t.query(`UPDATE providers SET listed = false, charges_enabled = false, payouts_enabled = false, bio = NULL, headline = NULL,
                     slug = 'deleted-' || substr(md5(id), 1, 12) WHERE user_id = $1`, [actor.userId])
    await t.query(`UPDATE players SET display_name = 'Deleted player', birth_date = NULL, gender = NULL, utr_singles = NULL, utr_doubles = NULL,
                     ntrp = NULL, wtn = NULL, utr_profile_id = NULL WHERE user_id = $1`, [actor.userId])
    await t.query(`UPDATE users SET display_name = 'Deleted user', email = 'deleted+' || id || '@invalid', phone = NULL, avatar_url = NULL,
                     notify_email = false, notify_sms = false, notify_push = false, stripe_customer_id = NULL WHERE id = $1`, [actor.userId])
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

/** Creates an auth identity for someone who hasn't signed up yet (guest checkout). */
async function createAuthIdentity(email: string | null, phone: string | null): Promise<string> {
  if (authMode() === 'dev') return newId('usr')
  const { supabaseAdminClient } = await import('../../auth/supabase')
  const { data, error } = await supabaseAdminClient().auth.admin.createUser({
    email: email ?? undefined, phone: phone ?? undefined, email_confirm: false, phone_confirm: false,
  })
  if (error || !data.user) throw fail.unauthorized('You already have an account with that email or phone. Sign in to continue.')
  return data.user.id
}

async function deleteAuthIdentity(id: string): Promise<void> {
  if (authMode() === 'dev') return
  const { supabaseAdminClient } = await import('../../auth/supabase')
  await supabaseAdminClient().auth.admin.deleteUser(id)
}

/**
 * Creates an account for someone new and runs `fn` in the same transaction. If `fn` fails,
 * nothing remains: the rows roll back and the auth identity is deleted. Existing accounts must
 * sign in (a guest can never act as someone else).
 */
export async function withNewAccount<T>(db: Db, contact: { email?: string | null; phone?: string | null; name: string }, fn: (t: Db, actor: Actor) => Promise<T>): Promise<T> {
  const email = normalizeEmail(contact.email)
  const phone = normalizePhone(contact.phone)
  if (!email && !phone) throw fail.badRequest('Enter an email or phone number.')
  if (await findUserIdByContact(db, { email, phone })) throw fail.unauthorized('You already have an account with that email or phone. Sign in to continue.')
  const id = await createAuthIdentity(email, phone)
  try {
    return await tx(async (t) => fn(t, await ensureActor(t, { id, email, phone, name: contact.name })))
  } catch (error) {
    await deleteAuthIdentity(id).catch(() => undefined)
    throw error
  }
}
