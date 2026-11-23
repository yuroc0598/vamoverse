// Session reminders: the day before and two hours before, once each (deduplicated).
import { formatTime } from '@/lib/time'
import type { Db } from '../../db'
import { bookingPath } from '../bookings/links'
import { enqueue } from './outbox'

interface Upcoming {
  bookingId: string
  userId: string
  title: string
  startsAt: Date
  timezone: string
  location: string | null
  playerName: string
  hoursAway: number
}

export async function enqueueReminders(db: Db): Promise<number> {
  const rows = await db.query<Upcoming>(
    `SELECT b.id AS "bookingId", b.booked_by_user_id AS "userId", o.title, s.starts_at AS "startsAt", o.timezone,
       COALESCE(c.name, o.location_name) AS location, p.display_name AS "playerName",
       EXTRACT(EPOCH FROM (s.starts_at - now())) / 3600 AS "hoursAway"
     FROM bookings b JOIN sessions s ON s.id = b.session_id JOIN offerings o ON o.id = b.offering_id
     JOIN players p ON p.id = b.player_id LEFT JOIN courts c ON c.id = o.court_id
     WHERE b.status = 'confirmed' AND s.status = 'scheduled' AND s.starts_at > now() AND s.starts_at <= now() + interval '24 hours'`)
  for (const r of rows) {
    const twoHour = r.hoursAway <= 2
    const at = `${formatTime(r.startsAt, r.timezone)}${r.location ? ` at ${r.location}` : ''}`
    await enqueue(db, {
      userId: r.userId,
      kind: twoHour ? 'reminder.2h' : 'reminder.24h',
      title: twoHour ? `Soon: ${r.title}` : `Tomorrow: ${r.title}`,
      body: `${r.playerName} · ${twoHour ? 'today' : ''} ${at}.`.replace(/\s+/g, ' '),
      link: bookingPath(r.bookingId),
      dedupeKey: `${twoHour ? 'reminder2h' : 'reminder24h'}:${r.bookingId}`,
    })
  }
  return rows.length
}
