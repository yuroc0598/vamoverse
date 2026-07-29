import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { logger } from '@/lib/logger'
import { hasDatabase, withTransaction } from '@/lib/db/pg'
import { isDemoMode } from '@/lib/runtime/config'

function paymentIntentId(value: string | Stripe.PaymentIntent | null): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || undefined
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const stripeKey = process.env.STRIPE_SECRET_KEY

  if (!secret || !stripeKey) {
    if (!isDemoMode()) {
      logger.error('payments.webhook_missing_config', { requestId })
      return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 })
    }
    await req.text()
    return NextResponse.json({ received: true, demo: true, processed: false })
  }
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  if (!hasDatabase()) return NextResponse.json({ error: 'Payment database is not configured' }, { status: 503 })

  let event: Stripe.Event
  try {
    const stripe = new Stripe(stripeKey)
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret)
  } catch (error) {
    logger.warn('payments.webhook_signature_invalid', { requestId, error })
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  try {
    const result = await withTransaction(async (db) => {
      const inserted = await db.query(
        `INSERT INTO stripe_events(event_id, type) VALUES ($1,$2)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [event.id, event.type]
      )
      if (!inserted.rowCount) return 'deduped' as const

      if (event.type === 'payment_intent.succeeded') {
        const intent = event.data.object
        if (intent.currency !== 'usd') throw new Error('Unexpected payment currency')
        const updated = await db.query(
          `UPDATE payments SET status='captured', captured_at=now(), capture_claimed_at=NULL,
             last_capture_error=NULL, next_capture_attempt_at=NULL, updated_at=now()
           WHERE stripe_payment_intent_id=$1 AND amount_cents=$2 RETURNING id`,
          [intent.id, intent.amount]
        )
        if (!updated.rowCount) throw new Error('PaymentIntent did not match a payment row')
      } else if (event.type === 'payment_intent.amount_capturable_updated') {
        await db.query(`UPDATE payments SET status='requires_capture', updated_at=now() WHERE stripe_payment_intent_id=$1`, [event.data.object.id])
      } else if (event.type === 'payment_intent.payment_failed') {
        await db.query(`UPDATE payments SET status='failed', capture_claimed_at=NULL, updated_at=now() WHERE stripe_payment_intent_id=$1`, [event.data.object.id])
      } else if (event.type === 'payment_intent.canceled') {
        await db.query(`UPDATE payments SET status='cancelled', capture_claimed_at=NULL, updated_at=now() WHERE stripe_payment_intent_id=$1`, [event.data.object.id])
      } else if (event.type === 'charge.refunded') {
        const id = paymentIntentId(event.data.object.payment_intent)
        if (id) await db.query(`UPDATE payments SET status='refunded', updated_at=now() WHERE stripe_payment_intent_id=$1`, [id])
      } else if (event.type === 'charge.dispute.created') {
        const id = paymentIntentId(event.data.object.payment_intent)
        if (id) await db.query(`UPDATE payments SET status='chargeback_open', updated_at=now() WHERE stripe_payment_intent_id=$1`, [id])
      }
      return 'processed' as const
    })

    logger.info('payments.webhook_processed', { requestId, eventId: event.id, eventType: event.type, result })
    return NextResponse.json({ received: true, [result]: true })
  } catch (error) {
    logger.error('payments.webhook_processing_failed', { requestId, eventId: event.id, eventType: event.type, error })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
