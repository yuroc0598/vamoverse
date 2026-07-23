import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getKv } from '@/lib/cache/kv'

// Dedup TTL: keep processed event ids long enough to cover Stripe's retry window.
const EVENT_DEDUP_TTL_SECONDS = 60 * 60 * 24

// Returns true the FIRST time an event id is seen, false on replays. Backed by
// Redis when configured so dedup holds across instances; in-memory otherwise.
async function markEventFresh(eventId: string): Promise<boolean> {
  try {
    return await getKv().setNx(`stripe_evt:${eventId}`, EVENT_DEDUP_TTL_SECONDS)
  } catch {
    return true
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || undefined
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  if (!secret) {
    if (isProd) {
      logger.error('payments.webhook_missing_secret', { requestId })
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }
    const body = await req.text()
    logger.warn('payments.webhook_mock_mode', { requestId, mode: 'dev', bodyBytes: body.length })
    try {
      const parsed = JSON.parse(body)
      if (parsed?.id) {
        const fresh = await markEventFresh(parsed.id)
        if (!fresh) {
          return NextResponse.json({ received: true, deduped: true })
        }
      }
      if (parsed?.type && typeof parsed.type !== 'string') {
        return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
      }
      if (!parsed?.type) {
        logger.info('payments.webhook_received', { requestId, mode: 'mock', bodyBytes: body.length })
      }
    } catch {}
    return NextResponse.json({ received: true, mock: true })
  }

  try {
    const rawBody = await req.text()
    let event: any

    if (!signature) {
      // Secret is configured -> a signature is mandatory. Fail closed.
      logger.warn('payments.webhook_missing_signature', { requestId })
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    let mod: any = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mod = await (Function('return import(/* webpackIgnore: true */ "stripe")')() as Promise<any>)
        .then((m: any) => m.default || m)
        .catch(() => null)
    } catch {
      mod = null
    }

    if (!mod) {
      // A webhook secret is configured but we cannot verify the signature
      // (stripe SDK unavailable). Never process an unverified event -> fail closed.
      logger.error('payments.webhook_cannot_verify_lib_missing', { requestId })
      return NextResponse.json({ error: 'Webhook verification unavailable' }, { status: 500 })
    }

    try {
      const stripe = new mod(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
    } catch (constructErr: any) {
      // Any failure to construct/verify the event is rejected. No unverified fallback.
      logger.warn('payments.webhook_signature_invalid', { requestId, err: constructErr })
      return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
    }

    if (!event?.id || !event?.type || typeof event.type !== 'string') {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    const fresh = await markEventFresh(event.id)
    if (!fresh) {
      return NextResponse.json({ received: true, deduped: true })
    }

    logger.info('payments.webhook_processed', { requestId, eventId: event.id, eventType: event.type })

    return NextResponse.json({ received: true })
  } catch (err: any) {
    logger.warn('payments.webhook_signature_invalid', { requestId, err })
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
