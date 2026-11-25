// Email (Resend), SMS (Twilio), and push (APNs) senders. In development all three are
// written to the log instead, so flows can be followed without real providers.
import { logger } from '@/lib/logger'
import { emailMode, pushMode, smsMode } from '../../config'
import { sendToApns, type ApnsPush } from './apns'

export interface Email { to: string; subject: string; text: string; html: string }

export async function sendEmail(email: Email): Promise<void> {
  if (emailMode() === 'log') {
    logger.info('notify.email_dev', { recipientDomain: email.to.split('@')[1], subject: email.subject })
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  })
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`)
}

/** Returns false when SMS is not configured (the message is skipped, not failed). */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const mode = smsMode()
  if (mode === 'off') return false
  if (mode === 'log') {
    logger.info('notify.sms_dev', { length: body.length })
    return true
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
  })
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return true
}

/** `skipped`: push isn't configured. `gone`: forget this device (app removed or token invalid). */
export async function sendPush(push: ApnsPush): Promise<'sent' | 'gone' | 'skipped'> {
  const mode = pushMode()
  if (mode === 'off') return 'skipped'
  if (mode === 'log') {
    logger.info('notify.push_dev', { environment: push.environment, link: push.link, badge: push.badge, titleLength: push.title.length })
    return 'sent'
  }
  return sendToApns(push)
}
