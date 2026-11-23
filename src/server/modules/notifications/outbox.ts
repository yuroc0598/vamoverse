// Notification outbox: rows are written in the same transaction as the change they
// describe, then delivered (in-app, email, SMS) by the dispatcher with retries.
import type { Db } from '../../db'
import { newId } from '../../ids'

export interface NotificationInput {
  userId: string
  kind: string
  title: string
  body: string
  link?: string | null
  /** Same key = same notification; prevents duplicates from retries and reminders. */
  dedupeKey?: string | null
}

export async function enqueue(db: Db, n: NotificationInput): Promise<void> {
  await db.query(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (dedupe_key) DO NOTHING`,
    [newId('ntf'), n.userId, n.kind, n.title, n.body, n.link ?? null, n.dedupeKey ?? null])
}
