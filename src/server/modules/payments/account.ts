// Provider-side money: payout onboarding, plan subscription, and the Money view.
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import type { Actor } from '../users/accounts'
import { getProcessor } from './processor'
import { applyAccountStatus } from './settlement'
import { customerFor, PAYMENT_COLUMNS, type Payment } from './core'

async function providerRow(db: Db, providerId: string) {
  const row = await maybeOne<{ accountId: string | null; email: string | null; userId: string }>(db,
    `SELECT pr.stripe_account_id AS "accountId", u.email, u.id AS "userId" FROM providers pr JOIN users u ON u.id = pr.user_id WHERE pr.id = $1`, [providerId])
  if (!row) throw fail.notFound('Coach')
  return row
}

/** Returns the processor-hosted onboarding link, creating the payout account on first use. */
export async function startPayoutOnboarding(db: Db, providerId: string): Promise<string> {
  const processor = await getProcessor()
  const row = await providerRow(db, providerId)
  let accountId = row.accountId
  if (!accountId) {
    accountId = await processor.createConnectedAccount({ id: providerId, email: row.email })
    await db.query(`UPDATE providers SET stripe_account_id = $2 WHERE id = $1 AND stripe_account_id IS NULL`, [providerId, accountId])
  }
  return processor.onboardingLink(accountId, providerId)
}

export async function refreshPayoutStatus(db: Db, providerId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }> {
  const row = await providerRow(db, providerId)
  if (!row.accountId) return { chargesEnabled: false, payoutsEnabled: false }
  const status = await (await getProcessor()).accountStatus(row.accountId)
  await applyAccountStatus(db, row.accountId, status.chargesEnabled, status.payoutsEnabled)
  return status
}

async function providerCustomer(db: Db, providerId: string): Promise<string> {
  return customerFor(db, (await providerRow(db, providerId)).userId)
}

export async function startProSubscription(db: Db, providerId: string): Promise<string> {
  return (await getProcessor()).subscriptionCheckout({ providerId, customerId: await providerCustomer(db, providerId) })
}

export async function billingPortal(db: Db, providerId: string): Promise<string> {
  return (await getProcessor()).billingPortal(await providerCustomer(db, providerId), providerId)
}

export interface MoneySummary {
  collectedCents: number
  refundedCents: number
  feesCents: number
  owedCents: number
  owed: { bookingId: string; playerName: string; sessionTitle: string; startsAt: Date; amountCents: number; paymentRule: string; paymentStatus: string }[]
  recent: (Payment & { payerName: string })[]
}

/** The provider's money at a glance for the last `days` days, plus everything still owed. */
export async function moneySummary(db: Db, providerId: string, days = 30): Promise<MoneySummary> {
  const totals = await maybeOne<{ collected: number; refunded: number; fees: number }>(db,
    `SELECT COALESCE(sum(amount_cents), 0)::int AS collected, COALESCE(sum(refunded_cents), 0)::int AS refunded,
       COALESCE(sum(platform_fee_cents), 0)::int AS fees
     FROM payments WHERE provider_id = $1 AND status IN ('succeeded','partially_refunded','refunded','disputed')
       AND created_at > now() - make_interval(days => $2)`, [providerId, days])
  const owed = await db.query<MoneySummary['owed'][number]>(
    `SELECT b.id AS "bookingId", p.display_name AS "playerName", o.title AS "sessionTitle", s.starts_at AS "startsAt",
       b.price_cents AS "amountCents", b.payment_rule AS "paymentRule", b.payment_status AS "paymentStatus"
     FROM bookings b JOIN players p ON p.id = b.player_id JOIN sessions s ON s.id = b.session_id JOIN offerings o ON o.id = b.offering_id
     WHERE b.provider_id = $1 AND b.payment_status IN ('due','failed') AND b.status IN ('confirmed','attended','late_cancelled','no_show')
       AND (b.payment_rule = 'external' OR b.payment_status = 'failed' OR s.starts_at < now())
     ORDER BY s.starts_at DESC LIMIT 100`, [providerId])
  const recent = await db.query<Payment & { payerName: string }>(
    `SELECT ${PAYMENT_COLUMNS}, u.display_name AS "payerName" FROM payments p JOIN users u ON u.id = p.payer_user_id
     WHERE p.provider_id = $1 AND p.status <> 'pending' AND p.purpose <> 'card_setup' ORDER BY p.created_at DESC LIMIT 50`, [providerId])
  return {
    collectedCents: totals!.collected, refundedCents: totals!.refunded, feesCents: totals!.fees,
    owedCents: owed.reduce((sum, o) => sum + o.amountCents, 0), owed, recent,
  }
}

export async function listMyPayments(db: Db, actor: Actor): Promise<(Payment & { providerName: string })[]> {
  return db.query<Payment & { providerName: string }>(
    `SELECT ${PAYMENT_COLUMNS}, u.display_name AS "providerName" FROM payments p
     JOIN providers pr ON pr.id = p.provider_id JOIN users u ON u.id = pr.user_id
     WHERE p.payer_user_id = $1 AND p.status <> 'pending' AND p.purpose <> 'card_setup' ORDER BY p.created_at DESC LIMIT 100`, [actor.userId])
}
