import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { MockPaymentClient } from '@/lib/payments/mock'
import { getPaymentClient } from '@/lib/payments/client'

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || undefined
  try {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    const allowDevUnauth = process.env.ALLOW_DEV_CRON_UNAUTH === 'true'

    if (!cronSecret) {
      if (!allowDevUnauth) {
        logger.error('cron.capture_misconfigured', { requestId, reason: 'CRON_SECRET unset' })
        return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
      }
      logger.warn('cron.capture_fail_open', { requestId, mode: 'dev', reason: 'CRON_SECRET unset — allowing unauthenticated run (dev only, ALLOW_DEV_CRON_UNAUTH=true)' })
    } else {
      if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn('cron.capture_unauthorized', { requestId, reason: 'invalid token' })
        return NextResponse.json({ error: 'Unauthorized cron - invalid token' }, { status: 401 })
      }
    }

    let captured = 0
    try {
      const pending = MockPaymentClient.getPendingCaptures()
      const client = getPaymentClient()
      for (const p of pending) {
        try {
          const result = await client.capturePayment(p.id)
          if (result.status === 'captured') captured++
        } catch (e) {
          logger.warn('cron.capture_payment_failed', { requestId, paymentId: p.id, err: e })
        }
      }
    } catch (e) {
      logger.warn('cron.capture_mock_failed', { requestId, err: e })
    }

    return NextResponse.json({
      status: 'ok',
      captured,
    })
  } catch (err: any) {
    logger.error('cron.capture_failed', { requestId, err })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
