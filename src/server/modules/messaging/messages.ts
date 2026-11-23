// Messaging between providers and the people they teach. Juniors never sign in, so a junior's
// guardian is always the member: there is no adult-to-minor private channel (SafeSport MAAPP).
import { maybeOne, tx, type Db } from '../../db'
import { fail } from '../../errors'
import { newId } from '../../ids'
import { enqueue } from '../notifications/outbox'
import type { Actor } from '../users/accounts'

export interface Thread {
  id: string
  kind: 'direct' | 'offering'
  title: string
  providerId: string
  lastMessageAt: Date | null
  lastMessage: string | null
  unread: number
}

export interface Message { id: string; senderUserId: string; senderName: string; body: string; createdAt: Date; mine: boolean }

/** Offering threads include the provider and everyone with a confirmed spot in the series (recent or upcoming). */
async function syncOfferingMembers(db: Db, conversationId: string): Promise<void> {
  const qualifying = `SELECT DISTINCT b.booked_by_user_id FROM conversations c
       JOIN bookings b ON b.offering_id = c.offering_id JOIN sessions s ON s.id = b.session_id
       WHERE c.id = $1 AND b.status IN ('confirmed','attended') AND s.starts_at > now() - interval '30 days'`
  await db.query(
    `DELETE FROM conversation_members m USING conversations c JOIN providers pr ON pr.id = c.provider_id
     WHERE m.conversation_id = $1 AND c.id = m.conversation_id AND m.user_id <> pr.user_id AND m.user_id NOT IN (${qualifying})`, [conversationId])
  await db.query(
    `INSERT INTO conversation_members (conversation_id, user_id)
     SELECT c.id, pr.user_id FROM conversations c JOIN providers pr ON pr.id = c.provider_id WHERE c.id = $1
     UNION
     SELECT DISTINCT c.id, b.booked_by_user_id FROM conversations c
       JOIN bookings b ON b.offering_id = c.offering_id JOIN sessions s ON s.id = b.session_id
       WHERE c.id = $1 AND b.status IN ('confirmed','attended') AND s.starts_at > now() - interval '30 days'
     ON CONFLICT DO NOTHING`, [conversationId])
}

async function requireMember(db: Db, actor: Actor, conversationId: string) {
  const convo = await maybeOne<{ id: string; kind: Thread['kind']; providerId: string; title: string; providerUserId: string }>(db,
    `SELECT c.id, c.kind, c.provider_id AS "providerId", c.title, pr.user_id AS "providerUserId"
     FROM conversations c JOIN providers pr ON pr.id = c.provider_id WHERE c.id = $1`, [conversationId])
  if (!convo) throw fail.notFound('Conversation')
  if (convo.kind === 'offering') await syncOfferingMembers(db, convo.id)
  const member = await maybeOne(db, `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [conversationId, actor.userId])
  if (!member) throw fail.notFound('Conversation')
  return convo
}

export async function listThreads(db: Db, actor: Actor): Promise<Thread[]> {
  // Make sure series threads include this person before listing.
  const offeringThreads = await db.query<{ id: string }>(
    `SELECT DISTINCT c.id FROM conversations c JOIN bookings b ON b.offering_id = c.offering_id
     WHERE c.kind = 'offering' AND b.booked_by_user_id = $1`, [actor.userId])
  for (const t of offeringThreads) await syncOfferingMembers(db, t.id)
  return db.query<Thread>(
    `SELECT c.id, c.kind, c.provider_id AS "providerId", c.last_message_at AS "lastMessageAt",
       CASE WHEN c.kind = 'direct' AND pr.user_id = $1 THEN du.display_name WHEN c.kind = 'direct' THEN pu.display_name ELSE c.title END AS title,
       (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS "lastMessage",
       (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_user_id <> $1
          AND m.created_at > COALESCE(cm.last_read_at, 'epoch'))::int AS unread
     FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
     JOIN providers pr ON pr.id = c.provider_id JOIN users pu ON pu.id = pr.user_id
     LEFT JOIN users du ON du.id = c.direct_user_id
     WHERE cm.user_id = $1 ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`, [actor.userId])
}

export async function readThread(db: Db, actor: Actor, conversationId: string): Promise<{ thread: { id: string; title: string; kind: Thread['kind'] }; messages: Message[] }> {
  const convo = await requireMember(db, actor, conversationId)
  const messages = await db.query<Message>(
    `SELECT * FROM (SELECT m.id, m.sender_user_id AS "senderUserId", u.display_name AS "senderName", m.body, m.created_at AS "createdAt",
       m.sender_user_id = $2 AS mine FROM messages m JOIN users u ON u.id = m.sender_user_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at DESC LIMIT 200) recent ORDER BY "createdAt"`, [conversationId, actor.userId])
  await db.query(`UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2`, [conversationId, actor.userId])
  let title = convo.title
  if (convo.kind === 'direct') {
    const other = await maybeOne<{ name: string }>(db,
      `SELECT u.display_name AS name FROM conversation_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = $1 AND cm.user_id <> $2 LIMIT 1`, [conversationId, actor.userId])
    title = other?.name ?? title
  }
  return { thread: { id: convo.id, title, kind: convo.kind }, messages }
}

export async function sendMessage(db: Db, actor: Actor, conversationId: string, body: string): Promise<Message> {
  const convo = await requireMember(db, actor, conversationId)
  const id = newId('msg')
  return tx(async (t) => {
    await t.query(`INSERT INTO messages (id, conversation_id, sender_user_id, body) VALUES ($1, $2, $3, $4)`, [id, conversationId, actor.userId, body])
    await t.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [conversationId])
    await t.query(`UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2`, [conversationId, actor.userId])
    const recipients = await t.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2`, [conversationId, actor.userId])
    const broadcast = convo.kind === 'offering' && actor.userId === convo.providerUserId
    const window = Math.floor(Date.now() / 600_000) // at most one alert per thread per 10 minutes
    for (const r of recipients) {
      await enqueue(t, {
        userId: r.userId, kind: broadcast ? 'message.broadcast' : 'message.new',
        title: convo.kind === 'offering' ? `${actor.displayName} in ${convo.title}` : `Message from ${actor.displayName}`,
        body: body.length > 160 ? `${body.slice(0, 157)}…` : body, link: `/messages/${conversationId}`,
        dedupeKey: broadcast ? `msg:${id}:${r.userId}` : `msg:${conversationId}:${r.userId}:${window}`,
      })
    }
    return { id, senderUserId: actor.userId, senderName: actor.displayName, body, createdAt: new Date(), mine: true }
  })
}

/** Direct thread between a provider and one client contact (the guardian, for a junior). */
async function directThread(db: Db, providerId: string, providerUserId: string, otherUserId: string, title: string): Promise<string> {
  const existing = await maybeOne<{ id: string }>(db, `SELECT id FROM conversations WHERE provider_id = $1 AND direct_user_id = $2`, [providerId, otherUserId])
  if (existing) return existing.id
  return tx(async (t) => {
    // ON CONFLICT: two people starting the same thread at once end up in one thread.
    await t.query(`INSERT INTO conversations (id, provider_id, kind, direct_user_id, title) VALUES ($1, $2, 'direct', $3, $4) ON CONFLICT DO NOTHING`,
      [newId('cnv'), providerId, otherUserId, title])
    const id = (await maybeOne<{ id: string }>(t, `SELECT id FROM conversations WHERE provider_id = $1 AND direct_user_id = $2`, [providerId, otherUserId]))!.id
    await t.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`, [id, providerUserId, otherUserId])
    return id
  })
}

/** A provider messages a student (or a junior's guardian). */
export async function startWithClient(db: Db, actor: Actor & { providerId: string }, playerId: string): Promise<string> {
  const contact = await maybeOne<{ userId: string; name: string }>(db,
    `SELECT COALESCE(p.user_id, p.guardian_user_id) AS "userId", u.display_name AS name
     FROM clients c JOIN players p ON p.id = c.player_id JOIN users u ON u.id = COALESCE(p.user_id, p.guardian_user_id)
     WHERE c.provider_id = $1 AND c.player_id = $2`, [actor.providerId, playerId])
  if (!contact) throw fail.notFound('Student')
  return directThread(db, actor.providerId, actor.userId, contact.userId, contact.name)
}

/** A player (or guardian) messages one of their coaches. */
export async function startWithProvider(db: Db, actor: Actor, providerId: string): Promise<string> {
  const provider = await maybeOne<{ userId: string; name: string }>(db,
    `SELECT pr.user_id AS "userId", u.display_name AS name FROM providers pr JOIN users u ON u.id = pr.user_id
     WHERE pr.id = $1 AND EXISTS (SELECT 1 FROM clients c JOIN players p ON p.id = c.player_id
       WHERE c.provider_id = pr.id AND (p.user_id = $2 OR p.guardian_user_id = $2))`, [providerId, actor.userId])
  if (!provider) throw fail.forbidden('Book a session or join this coach’s crew to message them.')
  return directThread(db, providerId, provider.userId, actor.userId, actor.displayName)
}

/** The group thread for a series (created on first use). */
export async function offeringThread(db: Db, providerId: string, offeringId: string): Promise<string> {
  const offering = await maybeOne<{ title: string }>(db, `SELECT title FROM offerings WHERE id = $1 AND provider_id = $2`, [offeringId, providerId])
  if (!offering) throw fail.notFound('Session series')
  await db.query(
    `INSERT INTO conversations (id, provider_id, kind, offering_id, title) VALUES ($1, $2, 'offering', $3, $4) ON CONFLICT (offering_id) DO NOTHING`,
    [newId('cnv'), providerId, offeringId, offering.title])
  const id = (await maybeOne<{ id: string }>(db, `SELECT id FROM conversations WHERE offering_id = $1`, [offeringId]))!.id
  await syncOfferingMembers(db, id)
  return id
}
