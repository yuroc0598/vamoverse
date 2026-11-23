// Applies payment outcomes to the domain. Webhooks (Stripe) and the dev simulator both
// arrive here as normalized ProcessorEvents, so production and development share one path.
import { logger } from '@/lib/logger'
import { formatMoney } from '@/lib/format'
import { tx, type Db } from '../../db'
import { onBookingPaid, onChargeResult, type Effects } from '../bookings/engine'
import { enqueue } from '../notifications/outbox'
import { activatePurchase } from '../packages/packages'
import { markGuardianVerified } from '../users/guardians'
import { chargePendingOffSession, executeRefunds, getPayment, saveCard } from './core'
import type { CardDetails, ProcessorEvent } from './processor'

/** Executes processor work recorded by a committed transaction. Failures are retried by cron. */
export async function runEffects(db: Db, effects: Effects): Promise<void> {
  try {
    if (effects.refunds.length) await executeRefunds(db, effects.refunds)
    if (effects.charges.length) await processCharges(db, effects.charges)
  } catch (error) {
    logger.error('payments.effects_failed', { error, effects })
  }
}

async function processCharges(db: Db, paymentIds?: string[]): Promise<number> {
  const outcomes = await chargePendingOffSession(db, paymentIds)
  for (const { payment, result } of outcomes) {
    await tx(async (t) => {
      await onChargeResult(t, payment, result.ok, result.ok ? null : result.message)
      if (result.ok) await markGuardianVerified(t, payment.payerUserId, payment.id)
    })
  }
  return outcomes.length
}

/** Cron: retry refunds and off-session charges that didn't finish. */
export async function runPaymentJobs(db: Db): Promise<{ refunds: number; charges: number }> {
  return { refunds: await executeRefunds(db), charges: await processCharges(db) }
}

/** Applies a completed checkout inside the caller's transaction; returns processor work to run after commit. */
async function settleCheckout(t: Db, paymentId: string, paymentIntentId: string | null, card: CardDetails | null): Promise<Effects | null> {
  const payment = await getPayment(t, paymentId, { forUpdate: true })
  // 'canceled' still settles: the money moved, so the booking logic decides between seat and refund.
  if (!payment || (payment.status !== 'pending' && payment.status !== 'canceled')) return null
  await t.query(`UPDATE payments SET status = 'succeeded', payment_intent_id = COALESCE($2, payment_intent_id), updated_at = now() WHERE id = $1`, [paymentId, paymentIntentId])
  if (card) await saveCard(t, payment.payerUserId, card)
  if (payment.amountCents > 0) await markGuardianVerified(t, payment.payerUserId, payment.id)
  switch (payment.purpose) {
    case 'booking': return onBookingPaid(t, payment, 'paid')
    case 'card_setup': return onBookingPaid(t, payment, 'card_saved')
    case 'package':
      if (payment.packagePurchaseId) await activatePurchase(t, payment.packagePurchaseId)
      await enqueue(t, { userId: payment.payerUserId, kind: 'package.purchased', title: 'Package ready', body: `Your ${formatMoney(payment.amountCents)} package is active; credits apply automatically when you book.`, link: '/today' })
      return null
    default:
      return null
  }
}

async function expireCheckout(db: Db, paymentId: string): Promise<void> {
  await db.query(`UPDATE payments SET status = 'canceled', updated_at = now() WHERE id = $1 AND status = 'pending'`, [paymentId])
}

async function applyRefunded(db: Db, paymentIntentId: string, refundedCents: number): Promise<void> {
  await db.query(
    `UPDATE payments SET refunded_cents = GREATEST(refunded_cents, $2), refund_requested_cents = GREATEST(refund_requested_cents, $2),
       status = CASE WHEN GREATEST(refunded_cents, $2) >= amount_cents THEN 'refunded' ELSE 'partially_refunded' END, updated_at = now()
     WHERE payment_intent_id = $1`, [paymentIntentId, refundedCents])
}

async function applyDisputed(db: Db, paymentIntentId: string): Promise<void> {
  const rows = await db.query<{ providerUserId: string; amount: number }>(
    `UPDATE payments p SET status = 'disputed', updated_at = now() FROM providers pr
     WHERE p.payment_intent_id = $1 AND pr.id = p.provider_id RETURNING pr.user_id AS "providerUserId", p.amount_cents AS amount`, [paymentIntentId])
  for (const r of rows) {
    await enqueue(db, { userId: r.providerUserId, kind: 'payment.disputed', title: 'A payment was disputed', body: `A player disputed a ${formatMoney(r.amount)} charge with their bank. Check Money for details.`, link: '/money' })
  }
}

export async function applyAccountStatus(db: Db, accountId: string, chargesEnabled: boolean, payoutsEnabled: boolean): Promise<void> {
  await db.query(`UPDATE providers SET charges_enabled = $2, payouts_enabled = $3, updated_at = now() WHERE stripe_account_id = $1`, [accountId, chargesEnabled, payoutsEnabled])
}

async function applySubscription(db: Db, e: Extract<ProcessorEvent, { type: 'subscription.updated' }>): Promise<void> {
  await db.query(
    `UPDATE providers SET plan = CASE WHEN $3 = 'canceled' THEN 'free' ELSE 'pro' END, plan_status = $3,
       stripe_subscription_id = $2, plan_period_end = $4, updated_at = now() WHERE id = $1`,
    [e.providerId, e.subscriptionId, e.status, e.periodEnd])
}

/**
 * Applies one processor event exactly once. The event id is recorded in the same transaction
 * as its effect, so a crash part-way lets the processor's retry do the work again.
 */
export async function applyProcessorEvent(db: Db, eventId: string, event: ProcessorEvent, source: 'stripe' | 'dev'): Promise<'processed' | 'duplicate'> {
  const outcome = await tx(async (t) => {
    const fresh = await t.query(`INSERT INTO processed_events (id, source) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id`, [eventId, source])
    if (!fresh.length) return { result: 'duplicate' as const, effects: null }
    let effects: Effects | null = null
    switch (event.type) {
      case 'checkout.completed': effects = await settleCheckout(t, event.paymentId, event.paymentIntentId, event.card); break
      case 'checkout.expired': await expireCheckout(t, event.paymentId); break
      case 'payment.refunded': await applyRefunded(t, event.paymentIntentId, event.refundedCents); break
      case 'payment.disputed': await applyDisputed(t, event.paymentIntentId); break
      case 'account.updated': await applyAccountStatus(t, event.accountId, event.chargesEnabled, event.payoutsEnabled); break
      case 'subscription.updated': await applySubscription(t, event); break
      case 'ignored': break
    }
    return { result: 'processed' as const, effects }
  })
  if (outcome.effects) await runEffects(db, outcome.effects)
  return outcome.result
}
