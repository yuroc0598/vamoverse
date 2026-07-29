import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth/actor'
import { hasDatabase, query } from '@/lib/db/pg'
import { getPaymentClient } from '@/lib/payments/client'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (actor.role !== 'coach') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (isMockMode) return NextResponse.json({ error: 'Demo mode never moves money; no capture was attempted' }, { status: 409 })
  if (!hasDatabase() || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Live payments are not configured' }, { status: 503 })

  const { id } = await context.params
  const claimed = await query<{ id: string; stripe_payment_intent_id: string }>(
    `UPDATE payments
     SET capture_claimed_at=now(), capture_attempts=capture_attempts+1, updated_at=now()
     WHERE id=$1 AND coach_id=$2 AND status='requires_capture'
       AND stripe_payment_intent_id IS NOT NULL
       AND (capture_claimed_at IS NULL OR capture_claimed_at < now() - interval '10 minutes')
     RETURNING id, stripe_payment_intent_id`,
    [id, actor.id]
  )
  const payment = claimed[0]
  if (!payment) {
    const rows = await query<{ status: string; capture_claimed_at: Date | null }>(
      `SELECT status, capture_claimed_at FROM payments WHERE id=$1 AND coach_id=$2`, [id, actor.id]
    )
    if (!rows[0]) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (rows[0].status === 'captured') return NextResponse.json({ status: 'captured', idempotent: true })
    if (rows[0].status === 'requires_capture' && rows[0].capture_claimed_at) {
      return NextResponse.json({ error: 'Payment capture is already in progress' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Payment is not capturable' }, { status: 409 })
  }

  try {
    const result = await getPaymentClient().capturePayment(payment.stripe_payment_intent_id)
    await query(
      `UPDATE payments SET status=$2, capture_claimed_at=NULL, last_capture_error=NULL,
         next_capture_attempt_at=NULL, captured_at=CASE WHEN $2='captured' THEN now() ELSE captured_at END,
         updated_at=now()
       WHERE id=$1 AND status='requires_capture'`,
      [id, result.status]
    )
    return NextResponse.json({ status: result.status })
  } catch (error) {
    await query(
      `UPDATE payments SET capture_claimed_at=NULL, last_capture_error=$2, updated_at=now()
       WHERE id=$1 AND status='requires_capture'`,
      [id, error instanceof Error ? error.message.slice(0, 500) : 'capture failed']
    )
    logger.error('payments.manual_capture_failed', { paymentId: id, actorId: actor.id, error })
    return NextResponse.json({ error: 'Capture failed' }, { status: 502 })
  }
}
