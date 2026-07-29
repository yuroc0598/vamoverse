import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { hasDatabase, query, withTransaction } from '@/lib/db/pg'
import { getPaymentClient } from '@/lib/payments/client'
import { isDemoMode } from '@/lib/runtime/config'

function validBearer(value: string | null, secret: string): boolean {
  if (!value?.startsWith('Bearer ')) return false
  const supplied = value.slice(7)
  if (supplied.length !== secret.length) return false
  let mismatch = 0
  for (let index = 0; index < secret.length; index++) mismatch |= supplied.charCodeAt(index) ^ secret.charCodeAt(index)
  return mismatch === 0
}

interface ClaimedPayment {
  id: string
  stripe_payment_intent_id: string
  capture_attempts: number
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || undefined
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  if (!validBearer(req.headers.get('authorization'), cronSecret)) {
    logger.warn('cron.capture_unauthorized', { requestId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasDatabase()) {
    if (isDemoMode()) return NextResponse.json({ status: 'demo', captured: 0, processed: false })
    return NextResponse.json({ error: 'Payment database is not configured' }, { status: 503 })
  }
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })

  try {
    const claimed = await withTransaction(async (db) => {
      const rows = await db.query<ClaimedPayment>(
        `SELECT id, stripe_payment_intent_id, capture_attempts
         FROM payments
         WHERE status='requires_capture'
           AND stripe_payment_intent_id IS NOT NULL
           AND auto_capture_at <= now()
           AND (next_capture_attempt_at IS NULL OR next_capture_attempt_at <= now())
           AND (capture_claimed_at IS NULL OR capture_claimed_at < now() - interval '10 minutes')
         ORDER BY auto_capture_at
         FOR UPDATE SKIP LOCKED
         LIMIT 100`
      )
      if (rows.rows.length) {
        await db.query(
          `UPDATE payments SET capture_claimed_at=now(), capture_attempts=capture_attempts+1, updated_at=now()
           WHERE id = ANY($1::text[])`,
          [rows.rows.map((row) => row.id)]
        )
      }
      return rows.rows
    })

    const client = getPaymentClient()
    let captured = 0
    let failed = 0
    for (const payment of claimed) {
      try {
        const result = await client.capturePayment(payment.stripe_payment_intent_id)
        await query(
          `UPDATE payments SET status=$2, capture_claimed_at=NULL, last_capture_error=NULL, next_capture_attempt_at=NULL,
             captured_at=CASE WHEN $2='captured' THEN now() ELSE captured_at END, updated_at=now()
           WHERE id=$1`,
          [payment.id, result.status]
        )
        if (result.status === 'captured') captured++
      } catch (error) {
        failed++
        const retryMinutes = Math.min(60, 2 ** Math.min(payment.capture_attempts + 1, 6))
        await query(
          `UPDATE payments SET capture_claimed_at=NULL, last_capture_error=$2,
             next_capture_attempt_at=now() + ($3::text || ' minutes')::interval, updated_at=now()
           WHERE id=$1`,
          [payment.id, error instanceof Error ? error.message.slice(0, 500) : 'capture failed', retryMinutes]
        )
      }
    }
    logger.info('cron.capture_completed', { requestId, claimed: claimed.length, captured, failed })
    return NextResponse.json({ status: 'ok', claimed: claimed.length, captured, failed })
  } catch (error) {
    logger.error('cron.capture_failed', { requestId, error })
    return NextResponse.json({ error: 'Capture job failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
