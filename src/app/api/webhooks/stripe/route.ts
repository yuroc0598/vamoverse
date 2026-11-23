// Stripe webhooks: verified signature, normalized, deduplicated, then applied by settlement.
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/lib/logger'
import { db } from '@/server/db'
import { getProcessor } from '@/server/modules/payments/processor'
import { applyProcessorEvent } from '@/server/modules/payments/settlement'

export async function POST(req: NextRequest) {
  const processor = await getProcessor()
  if (processor.name !== 'stripe') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  let parsed
  try {
    parsed = await processor.parseWebhook(await req.text(), req.headers.get('stripe-signature'))
  } catch (error) {
    logger.warn('stripe.webhook_rejected', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
  try {
    const result = await applyProcessorEvent(db, parsed.eventId, parsed.event, 'stripe')
    return NextResponse.json({ received: true, result })
  } catch (error) {
    logger.error('stripe.webhook_failed', { eventId: parsed.eventId, type: parsed.event.type, error })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 }) // Stripe retries
  }
}
