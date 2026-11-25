// Delivers outbox notifications by email (all), SMS (time-sensitive kinds only), and push (to
// the user's app installs), honoring each person's channel choices in Settings, with retries and backoff. Each channel keeps
// its own status, so retrying one never repeats another. Safe to run concurrently.
import { logger } from '@/lib/logger'
import { appUrl } from '../../config'
import { maybeOne, tx, type Db } from '../../db'
import { devicesFor, forgetDevice } from '../devices/devices'
import { sendEmail, sendPush, sendSms } from './channels'

/** Texts cost money and attention: only for things that change someone's plans. */
const SMS_KINDS = new Set([
  'session.cancelled', 'session.moved', 'waitlist.offered', 'waitlist.confirmed', 'booking.invited',
  'reminder.2h', 'payment.failed', 'payment.card_needed', 'booking.requested', 'message.broadcast',
])

const MAX_ATTEMPTS = 5

interface Due {
  id: string
  userId: string
  kind: string
  title: string
  body: string
  link: string | null
  emailStatus: string
  smsStatus: string
  pushStatus: string
  attempts: number
  email: string | null
  phone: string | null
  notifyEmail: boolean
  notifySms: boolean
  notifyPush: boolean
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function renderEmail(n: Pick<Due, 'title' | 'body' | 'link'>) {
  const url = n.link ? `${appUrl()}${n.link}` : appUrl()
  const text = `${n.body}\n\n${url}\n\nVamoverse · Manage notifications in Settings.`
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#FAF9F6;padding:24px">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #eee">
    <h1 style="font-size:18px;margin:0 0 8px">${escapeHtml(n.title)}</h1>
    <p style="font-size:15px;line-height:1.5;color:#333">${escapeHtml(n.body)}</p>
    <p><a href="${url}" style="display:inline-block;background:#D95D39;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Open</a></p>
    <p style="font-size:12px;color:#888">Vamoverse · Manage notifications in Settings.</p>
  </div></body></html>`
  return { subject: n.title, text, html }
}

export function renderSms(n: Pick<Due, 'title' | 'body' | 'link'>): string {
  const url = n.link ? ` ${appUrl()}${n.link}` : ''
  const message = `${n.title}. ${n.body}`
  return (message.length > 280 ? `${message.slice(0, 277)}…` : message) + url
}

/** Claims and delivers due notifications. Returns how many were processed. */
export async function deliverPending(db: Db, limit = 50): Promise<number> {
  const due = await tx((t) => t.query<Due>(
    `UPDATE notifications n SET attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes'
     FROM users u
     WHERE n.id IN (SELECT id FROM notifications WHERE (email_status = 'pending' OR sms_status = 'pending' OR push_status = 'pending')
                      AND next_attempt_at <= now()
                    ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
       AND u.id = n.user_id
     RETURNING n.id, n.user_id AS "userId", n.kind, n.title, n.body, n.link, n.email_status AS "emailStatus", n.sms_status AS "smsStatus",
       n.push_status AS "pushStatus", n.attempts,
       u.email, u.phone, u.notify_email AS "notifyEmail", u.notify_sms AS "notifySms",
       u.notify_push AS "notifyPush"`, [limit]))

  for (const n of due) {
    let email = n.emailStatus
    let sms = n.smsStatus
    let push = n.pushStatus
    const errors: string[] = []
    if (email === 'pending') {
      if (!n.email || !n.notifyEmail) email = 'skipped'
      else {
        try { await sendEmail({ to: n.email, ...renderEmail(n) }); email = 'sent' } catch (e) { errors.push(String(e)) }
      }
    }
    if (sms === 'pending') {
      if (!n.phone || !n.notifySms || !SMS_KINDS.has(n.kind)) sms = 'skipped'
      else {
        try { sms = (await sendSms(n.phone, renderSms(n))) ? 'sent' : 'skipped' } catch (e) { errors.push(String(e)) }
      }
    }
    if (push === 'pending') {
      try { push = await deliverPush(db, n) } catch (e) { errors.push(String(e)) }
    }
    const giveUp = n.attempts >= MAX_ATTEMPTS
    if (giveUp) {
      if (email === 'pending') email = 'failed'
      if (sms === 'pending') sms = 'failed'
      if (push === 'pending') push = 'failed'
    }
    if (errors.length) logger.warn('notify.delivery_error', { notificationId: n.id, attempts: n.attempts, errors })
    await db.query(
      `UPDATE notifications SET email_status = $2, sms_status = $3, push_status = $4, last_error = $5,
         next_attempt_at = now() + make_interval(mins => $6) WHERE id = $1`,
      [n.id, email, sms, push, errors.join(' | ').slice(0, 500) || null, 2 ** Math.min(n.attempts, 6)])
  }
  return due.length
}

/**
 * Pushes to every device the user has the app on, with the unread count as the badge.
 * Sent if any device got it (a failing extra device isn't retried, so others aren't pushed twice);
 * throws (retry) only when none did and one failed. Devices APNs reports gone are forgotten.
 */
async function deliverPush(db: Db, n: Due): Promise<'sent' | 'skipped'> {
  if (!n.notifyPush) return 'skipped' // turned off in Settings
  const devices = await devicesFor(db, n.userId)
  if (!devices.length) return 'skipped'
  const unread = (await maybeOne<{ n: number }>(db, `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [n.userId]))?.n ?? 0
  let sent = false
  let failure: unknown = null
  for (const device of devices) {
    try {
      const result = await sendPush({ token: device.token, environment: device.environment, title: n.title, body: n.body, link: n.link, badge: unread })
      if (result === 'skipped') return 'skipped'
      if (result === 'gone') await forgetDevice(db, device.token)
      else sent = true
    } catch (error) {
      failure = error
    }
  }
  if (sent || !failure) return sent ? 'sent' : 'skipped'
  throw failure
}
