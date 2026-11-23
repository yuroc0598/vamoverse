import { z } from 'zod'
import { command } from '../../commands/define'
import { maybeOne } from '../../db'

export const notificationCommands = {
  'notifications.list': command({
    summary: 'Your recent notifications (newest first) and how many are unread.',
    access: 'user',
    mutates: false,
    input: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
    run: async ({ actor, db }, { limit }) => {
      const items = await db.query<{ id: string; kind: string; title: string; body: string; link: string | null; readAt: Date | null; createdAt: Date }>(
        `SELECT id, kind, title, body, link, read_at AS "readAt", created_at AS "createdAt" FROM notifications
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [actor.userId, limit])
      const unread = await maybeOne<{ n: number }>(db, `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [actor.userId])
      return { items, unread: unread?.n ?? 0 }
    },
  }),

  'notifications.markRead': command({
    summary: 'Mark all your notifications as read.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({}),
    run: async ({ actor, db }) => {
      await db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [actor.userId])
      return { ok: true }
    },
  }),
}
