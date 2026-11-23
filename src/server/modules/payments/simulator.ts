// Development-only: completes simulated checkouts, onboarding, and subscriptions by emitting
// the same events Stripe would send, through the same settlement code.
import { randomUUID } from 'crypto'
import { appUrl, devPaymentsEnabled } from '../../config'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { bookingUrl } from '../bookings/links'
import { getPayment } from './core'
import { applyProcessorEvent } from './settlement'

export type SimulatedAction = 'checkout' | 'connect' | 'subscribe' | 'cancel_subscription'

/** Applies the simulated outcome and returns where the processor would redirect the user. */
export async function simulate(db: Db, action: SimulatedAction, id: string): Promise<string> {
  if (!devPaymentsEnabled()) throw fail.notFound('Page')
  const emit = (event: Parameters<typeof applyProcessorEvent>[2]) => applyProcessorEvent(db, `dev_${randomUUID()}`, event, 'dev')
  switch (action) {
    case 'checkout': {
      const payment = await getPayment(db, id)
      if (!payment) throw fail.notFound('Payment')
      await emit({
        type: 'checkout.completed', paymentId: id, paymentIntentId: payment.amountCents > 0 ? `pi_dev_${id}` : null,
        card: { id: `pm_dev_${payment.payerUserId.slice(-8)}4242`, brand: 'visa', last4: '4242' },
      })
      return payment.bookingId ? `${bookingUrl(payment.bookingId)}&paid=1` : `${appUrl()}/today?package=1`
    }
    case 'connect': {
      const row = await maybeOne<{ accountId: string | null }>(db, `SELECT stripe_account_id AS "accountId" FROM providers WHERE id = $1`, [id])
      if (!row?.accountId) throw fail.notFound('Payout account')
      await emit({ type: 'account.updated', accountId: row.accountId, chargesEnabled: true, payoutsEnabled: true })
      return `${appUrl()}/settings/payouts?returned=1`
    }
    case 'subscribe':
    case 'cancel_subscription':
      await emit({
        type: 'subscription.updated', providerId: id, subscriptionId: `sub_dev_${id.slice(-12)}`,
        status: action === 'subscribe' ? 'active' : 'canceled', periodEnd: new Date(Date.now() + 30 * 86_400_000),
      })
      return `${appUrl()}/settings/payouts?${action === 'subscribe' ? 'subscribed=1' : 'canceled=1'}`
  }
}
