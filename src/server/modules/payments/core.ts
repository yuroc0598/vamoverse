// Payment records and processor calls. No booking/package knowledge here; settlement.ts
// applies outcomes to the domain. Writes that must be atomic with a booking change take
// the caller's transaction handle; processor calls always happen after commit.
import { paymentsMode } from '../../config'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { newId } from '../../ids'
import { logger } from '@/lib/logger'
import { effectivePlan, platformFeeCents, type PlanId } from './plans'
import { getProcessor, type ChargeResult } from './processor'

export type PaymentPurpose = 'booking' | 'package' | 'late_cancel_fee' | 'no_show_fee' | 'card_setup'

export interface Payment {
  id: string
  providerId: string
  payerUserId: string
  purpose: PaymentPurpose
  bookingId: string | null
  packagePurchaseId: string | null
  amountCents: number
  platformFeeCents: number
  refundRequestedCents: number
  refundedCents: number
  mode: 'checkout' | 'off_session'
  paymentMethodId: string | null
  attempts: number
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded' | 'partially_refunded' | 'disputed'
  checkoutUrl: string | null
  paymentIntentId: string | null
  failureMessage: string | null
  createdAt: Date
}

export const PAYMENT_COLUMNS = `p.id, p.provider_id AS "providerId", p.payer_user_id AS "payerUserId", p.purpose,
  p.booking_id AS "bookingId", p.package_purchase_id AS "packagePurchaseId", p.amount_cents AS "amountCents",
  p.platform_fee_cents AS "platformFeeCents", p.refund_requested_cents AS "refundRequestedCents",
  p.refunded_cents AS "refundedCents", p.mode, p.payment_method_id AS "paymentMethodId", p.attempts, p.status,
  p.checkout_url AS "checkoutUrl", p.payment_intent_id AS "paymentIntentId", p.failure_message AS "failureMessage",
  p.created_at AS "createdAt"`

export async function getPayment(db: Db, paymentId: string, opts: { forUpdate?: boolean } = {}): Promise<Payment | null> {
  return maybeOne<Payment>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = $1${opts.forUpdate ? ' FOR UPDATE' : ''}`, [paymentId])
}

async function providerPlan(db: Db, providerId: string): Promise<{ plan: PlanId; accountId: string | null; chargesEnabled: boolean }> {
  const row = await maybeOne<{ plan: PlanId; planStatus: string | null; accountId: string | null; chargesEnabled: boolean }>(db,
    `SELECT plan, plan_status AS "planStatus", stripe_account_id AS "accountId", charges_enabled AS "chargesEnabled" FROM providers WHERE id = $1`, [providerId])
  if (!row) throw fail.notFound('Coach')
  return { plan: effectivePlan(row), accountId: row.accountId, chargesEnabled: row.chargesEnabled }
}

interface NewPayment {
  providerId: string
  payerUserId: string
  purpose: PaymentPurpose
  amountCents: number
  bookingId?: string | null
  packagePurchaseId?: string | null
}

async function insertPayment(db: Db, p: NewPayment, mode: 'checkout' | 'off_session', paymentMethodId: string | null): Promise<string> {
  const provider = await providerPlan(db, p.providerId)
  if (!provider.chargesEnabled || !provider.accountId) throw fail.paymentRequired('This coach isn’t set up to take card payments yet.')
  const id = newId('pay')
  await db.query(
    `INSERT INTO payments (id, provider_id, payer_user_id, purpose, booking_id, package_purchase_id, amount_cents,
       platform_fee_cents, mode, payment_method_id, status, processor, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$1)`,
    [id, p.providerId, p.payerUserId, p.purpose, p.bookingId ?? null, p.packagePurchaseId ?? null, p.amountCents,
      platformFeeCents(provider.plan, p.amountCents), mode, paymentMethodId, paymentsMode()])
  return id
}

/** Records a pending checkout (call inside the domain transaction); open it with `openCheckout` after commit. */
export function createCheckoutPayment(db: Db, p: NewPayment): Promise<string> {
  return insertPayment(db, p, 'checkout', null)
}

export async function defaultPaymentMethod(db: Db, userId: string): Promise<{ id: string; brand: string | null; last4: string | null } | null> {
  return maybeOne(db, `SELECT id, brand, last4 FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1`, [userId])
}

/** Records a pending off-session charge on the payer's saved card, or returns null if they have none. */
export async function createOffSessionPayment(db: Db, p: NewPayment): Promise<string | null> {
  const card = await defaultPaymentMethod(db, p.payerUserId)
  return card ? insertPayment(db, p, 'off_session', card.id) : null
}

export async function saveCard(db: Db, userId: string, card: { id: string; brand: string | null; last4: string | null }): Promise<void> {
  await db.query(`UPDATE payment_methods SET is_default = false WHERE user_id = $1`, [userId])
  await db.query(
    `INSERT INTO payment_methods (id, user_id, processor, brand, last4, is_default) VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (id) DO UPDATE SET is_default = true`,
    [card.id, userId, paymentsMode(), card.brand, card.last4])
}

/** The processor customer for a user, created on first use. */
export async function customerFor(db: Db, userId: string): Promise<string> {
  const user = await maybeOne<{ id: string; email: string | null; phone: string | null; name: string; customerId: string | null }>(db,
    `SELECT id, email, phone, display_name AS name, stripe_customer_id AS "customerId" FROM users WHERE id = $1`, [userId])
  if (!user) throw fail.notFound('Account')
  const customerId = await (await getProcessor()).ensureCustomer(user)
  if (customerId !== user.customerId) await db.query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [userId, customerId])
  return customerId
}

/** Creates the processor checkout for a pending payment and returns its URL (idempotent). */
export async function openCheckout(db: Db, paymentId: string, opts: { description: string; successUrl: string; cancelUrl: string; expiresAt: Date }): Promise<string> {
  const payment = await getPayment(db, paymentId)
  if (!payment || payment.mode !== 'checkout') throw fail.notFound('Payment')
  if (payment.checkoutUrl) return payment.checkoutUrl
  const provider = await providerPlan(db, payment.providerId)
  const session = await (await getProcessor()).createCheckout({
    paymentId, mode: payment.purpose === 'card_setup' ? 'setup' : 'payment', customerId: await customerFor(db, payment.payerUserId),
    description: opts.description, amountCents: payment.amountCents, platformFeeCents: payment.platformFeeCents,
    destinationAccountId: provider.accountId!, successUrl: opts.successUrl, cancelUrl: opts.cancelUrl, expiresAt: opts.expiresAt,
  })
  await db.query(`UPDATE payments SET checkout_session_id = $2, checkout_url = $3, updated_at = now() WHERE id = $1`, [paymentId, session.id, session.url])
  return session.url
}

/** Asks for (part of) a payment back. Executed by `executeRefunds` after commit. */
export async function requestRefund(db: Db, paymentId: string, amountCents: number): Promise<void> {
  if (amountCents <= 0) return
  await db.query(
    `UPDATE payments SET refund_requested_cents = LEAST(amount_cents, refund_requested_cents + $2), updated_at = now() WHERE id = $1`,
    [paymentId, amountCents])
}

/** The latest succeeded booking payment (what a cancellation refunds). */
export async function bookingPayment(db: Db, bookingId: string): Promise<Payment | null> {
  return maybeOne<Payment>(db,
    `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.booking_id = $1 AND p.purpose = 'booking'
       AND p.status IN ('succeeded','partially_refunded') ORDER BY p.created_at DESC LIMIT 1`, [bookingId])
}

/** Sends requested refunds to the processor. Safe to call repeatedly (idempotency keys). */
export async function executeRefunds(db: Db, paymentIds?: string[]): Promise<number> {
  const due = await db.query<{ id: string; intent: string | null; requested: number; refunded: number; amount: number }>(
    `SELECT id, payment_intent_id AS intent, refund_requested_cents AS requested, refunded_cents AS refunded, amount_cents AS amount
     FROM payments WHERE refund_requested_cents > refunded_cents AND status IN ('succeeded','partially_refunded')
       ${paymentIds ? 'AND id = ANY($1)' : ''} LIMIT 100`, paymentIds ? [paymentIds] : [])
  let done = 0
  for (const p of due) {
    try {
      if (p.intent) await (await getProcessor()).refund(p.intent, p.requested - p.refunded, `refund:${p.id}:${p.requested}`)
      await db.query(
        `UPDATE payments SET refunded_cents = $2, status = CASE WHEN $2 >= amount_cents THEN 'refunded' ELSE 'partially_refunded' END,
           updated_at = now() WHERE id = $1 AND refunded_cents < $2`, [p.id, p.requested])
      done++
    } catch (error) {
      logger.error('payments.refund_failed', { paymentId: p.id, error })
    }
  }
  return done
}

/** Charges pending off-session payments; returns each outcome so settlement can update the domain. */
export async function chargePendingOffSession(db: Db, paymentIds?: string[]): Promise<{ payment: Payment; result: ChargeResult }[]> {
  const pending = await db.query<Payment & { accountId: string }>(
    `SELECT ${PAYMENT_COLUMNS}, pr.stripe_account_id AS "accountId" FROM payments p JOIN providers pr ON pr.id = p.provider_id
     WHERE p.mode = 'off_session' AND p.status = 'pending' AND p.attempts < 3 ${paymentIds ? 'AND p.id = ANY($1)' : ''}
     ORDER BY p.created_at LIMIT 100`, paymentIds ? [paymentIds] : [])
  const outcomes: { payment: Payment; result: ChargeResult }[] = []
  for (const payment of pending) {
    const claimed = await db.query(`UPDATE payments SET attempts = attempts + 1 WHERE id = $1 AND status = 'pending' AND attempts = $2 RETURNING id`, [payment.id, payment.attempts])
    if (!claimed.length) continue // another worker took it
    let result: ChargeResult
    try {
      result = await (await getProcessor()).chargeOffSession({
        paymentId: payment.id, customerId: await customerFor(db, payment.payerUserId), paymentMethodId: payment.paymentMethodId!,
        description: payment.purpose.replace(/_/g, ' '), amountCents: payment.amountCents,
        platformFeeCents: payment.platformFeeCents, destinationAccountId: payment.accountId,
      })
    } catch (error) {
      logger.error('payments.charge_error', { paymentId: payment.id, error })
      continue // network/processor error: retried by cron until attempts run out
    }
    const applied = await db.query(
      `UPDATE payments SET status = $2, payment_intent_id = COALESCE($3, payment_intent_id), failure_message = $4, updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [payment.id, result.ok ? 'succeeded' : 'failed', result.paymentIntentId ?? null, result.ok ? null : result.message])
    if (!applied.length) {
      // Cancelled (e.g. fee waived) while the charge was in flight: give the money back.
      if (result.ok) {
        await db.query(`UPDATE payments SET status = 'succeeded', payment_intent_id = $2, refund_requested_cents = amount_cents, updated_at = now() WHERE id = $1`,
          [payment.id, result.paymentIntentId])
        await executeRefunds(db, [payment.id])
      }
      continue
    }
    outcomes.push({ payment, result })
  }
  return outcomes
}
