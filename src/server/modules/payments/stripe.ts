// Stripe Connect (Express) + Billing. Charges are destination charges settled on the
// provider's account (`on_behalf_of`), with the platform fee taken as an application fee.
import Stripe from 'stripe'
import { appUrl } from '../../config'
import type { CardDetails, CheckoutRequest, ChargeResult, OffSessionCharge, Processor, ProcessorEvent } from './processor'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

const SUBSCRIPTION_STATUS: Record<string, 'active' | 'past_due' | 'canceled'> = {
  active: 'active', trialing: 'active', past_due: 'past_due', unpaid: 'past_due',
  canceled: 'canceled', incomplete_expired: 'canceled', incomplete: 'past_due', paused: 'past_due',
}

export class StripeProcessor implements Processor {
  readonly name = 'stripe' as const
  private readonly stripe = new Stripe(required('STRIPE_SECRET_KEY'))

  async ensureCustomer(user: { id: string; email: string | null; phone: string | null; name: string; customerId: string | null }) {
    if (user.customerId) return user.customerId
    const customer = await this.stripe.customers.create(
      { email: user.email ?? undefined, phone: user.phone ?? undefined, name: user.name, metadata: { user_id: user.id } },
      { idempotencyKey: `customer:${user.id}` })
    return customer.id
  }

  async createConnectedAccount(provider: { id: string; email: string | null }) {
    const account = await this.stripe.accounts.create({
      type: 'express', country: 'US', email: provider.email ?? undefined, business_type: 'individual',
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: '7997', product_description: 'Tennis lessons and hitting sessions' },
      metadata: { provider_id: provider.id },
    }, { idempotencyKey: `account:${provider.id}` })
    return account.id
  }

  async onboardingLink(accountId: string) {
    const link = await this.stripe.accountLinks.create({
      account: accountId, type: 'account_onboarding',
      refresh_url: `${appUrl()}/settings/payouts?refresh=1`, return_url: `${appUrl()}/settings/payouts?returned=1`,
    })
    return link.url
  }

  async accountStatus(accountId: string) {
    const account = await this.stripe.accounts.retrieve(accountId)
    return { chargesEnabled: Boolean(account.charges_enabled), payoutsEnabled: Boolean(account.payouts_enabled) }
  }

  async createCheckout(req: CheckoutRequest) {
    const common = {
      customer: req.customerId, success_url: req.successUrl, cancel_url: req.cancelUrl,
      expires_at: Math.floor(req.expiresAt.getTime() / 1000), metadata: { payment_id: req.paymentId },
    }
    const session = req.mode === 'setup'
      ? await this.stripe.checkout.sessions.create({
        ...common, mode: 'setup', currency: 'usd',
        setup_intent_data: { description: req.description, metadata: { payment_id: req.paymentId } },
      }, { idempotencyKey: `checkout:${req.paymentId}` })
      : await this.stripe.checkout.sessions.create({
        ...common, mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: req.amountCents, product_data: { name: req.description } } }],
        payment_intent_data: {
          application_fee_amount: req.platformFeeCents || undefined,
          on_behalf_of: req.destinationAccountId,
          transfer_data: { destination: req.destinationAccountId },
          setup_future_usage: 'off_session',
          metadata: { payment_id: req.paymentId },
        },
      }, { idempotencyKey: `checkout:${req.paymentId}` })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    return { id: session.id, url: session.url }
  }

  async chargeOffSession(req: OffSessionCharge): Promise<ChargeResult> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: req.amountCents, currency: 'usd', customer: req.customerId, payment_method: req.paymentMethodId,
        off_session: true, confirm: true, description: req.description,
        application_fee_amount: req.platformFeeCents || undefined,
        on_behalf_of: req.destinationAccountId, transfer_data: { destination: req.destinationAccountId },
        metadata: { payment_id: req.paymentId },
      }, { idempotencyKey: `charge:${req.paymentId}` })
      return intent.status === 'succeeded'
        ? { ok: true, paymentIntentId: intent.id }
        : { ok: false, message: 'The card needs attention.', paymentIntentId: intent.id }
    } catch (error) {
      if (error instanceof Stripe.errors.StripeCardError) {
        return { ok: false, message: error.message, paymentIntentId: error.payment_intent?.id }
      }
      throw error
    }
  }

  async refund(paymentIntentId: string, amountCents: number, idempotencyKey: string) {
    await this.stripe.refunds.create(
      { payment_intent: paymentIntentId, amount: amountCents, reverse_transfer: true, refund_application_fee: true },
      { idempotencyKey })
  }

  async subscriptionCheckout(req: { providerId: string; customerId: string }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription', customer: req.customerId,
      line_items: [{ price: required('STRIPE_PRO_PRICE_ID'), quantity: 1 }],
      subscription_data: { metadata: { provider_id: req.providerId } },
      success_url: `${appUrl()}/settings/payouts?subscribed=1`, cancel_url: `${appUrl()}/settings/payouts`,
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    return session.url
  }

  async billingPortal(customerId: string) {
    const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${appUrl()}/settings/payouts` })
    return session.url
  }

  private async card(paymentMethod: string | Stripe.PaymentMethod | null | undefined): Promise<CardDetails | null> {
    if (!paymentMethod) return null
    const pm = typeof paymentMethod === 'string' ? await this.stripe.paymentMethods.retrieve(paymentMethod) : paymentMethod
    return { id: pm.id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null }
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<{ eventId: string; event: ProcessorEvent }> {
    const e = this.stripe.webhooks.constructEvent(rawBody, signature ?? '', required('STRIPE_WEBHOOK_SECRET'))
    return { eventId: e.id, event: await this.normalize(e) }
  }

  private async normalize(e: Stripe.Event): Promise<ProcessorEvent> {
    switch (e.type) {
      case 'checkout.session.completed': {
        const s = e.data.object
        const paymentId = s.metadata?.payment_id
        if (!paymentId) return { type: 'ignored' }
        if (s.mode === 'setup') {
          const setupIntent = typeof s.setup_intent === 'string' ? await this.stripe.setupIntents.retrieve(s.setup_intent) : s.setup_intent
          return { type: 'checkout.completed', paymentId, paymentIntentId: null, card: await this.card(setupIntent?.payment_method) }
        }
        const intentId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null
        const intent = intentId ? await this.stripe.paymentIntents.retrieve(intentId) : null
        return { type: 'checkout.completed', paymentId, paymentIntentId: intentId, card: await this.card(intent?.payment_method) }
      }
      case 'checkout.session.expired': {
        const paymentId = e.data.object.metadata?.payment_id
        return paymentId ? { type: 'checkout.expired', paymentId } : { type: 'ignored' }
      }
      case 'charge.refunded': {
        const charge = e.data.object
        const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
        return intentId ? { type: 'payment.refunded', paymentIntentId: intentId, refundedCents: charge.amount_refunded } : { type: 'ignored' }
      }
      case 'charge.dispute.created': {
        const dispute = e.data.object
        const intentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
        return intentId ? { type: 'payment.disputed', paymentIntentId: intentId } : { type: 'ignored' }
      }
      case 'account.updated': {
        const a = e.data.object
        return { type: 'account.updated', accountId: a.id, chargesEnabled: Boolean(a.charges_enabled), payoutsEnabled: Boolean(a.payouts_enabled) }
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = e.data.object
        const providerId = sub.metadata?.provider_id
        if (!providerId) return { type: 'ignored' }
        const periodEnd = sub.items.data[0]?.current_period_end
        return {
          type: 'subscription.updated', providerId, subscriptionId: sub.id,
          status: e.type === 'customer.subscription.deleted' ? 'canceled' : SUBSCRIPTION_STATUS[sub.status] ?? 'past_due',
          periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        }
      }
      default:
        return { type: 'ignored' }
    }
  }
}
