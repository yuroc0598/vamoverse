// Development payment simulator. Checkout and onboarding links point at local /dev pages
// that emit the same ProcessorEvents Stripe webhooks would. Never used in production.
import { appUrl } from '../../config'
import type { CheckoutRequest, ChargeResult, OffSessionCharge, Processor, ProcessorEvent } from './processor'

export class DevProcessor implements Processor {
  readonly name = 'dev' as const

  async ensureCustomer(user: { id: string; customerId: string | null }) {
    return user.customerId ?? `cus_dev_${user.id.slice(-12)}`
  }

  async createConnectedAccount(provider: { id: string }) {
    return `acct_dev_${provider.id.slice(-12)}`
  }

  async onboardingLink(_accountId: string, providerId: string) {
    return `${appUrl()}/dev/simulate?action=connect&id=${providerId}`
  }

  async accountStatus() {
    return { chargesEnabled: true, payoutsEnabled: true }
  }

  async createCheckout(req: CheckoutRequest) {
    return { id: `cs_dev_${req.paymentId}`, url: `${appUrl()}/dev/simulate?action=checkout&id=${req.paymentId}` }
  }

  async chargeOffSession(req: OffSessionCharge): Promise<ChargeResult> {
    // A saved card ending in "0002" simulates a decline.
    if (req.paymentMethodId.endsWith('0002')) return { ok: false, message: 'Your card was declined.' }
    return { ok: true, paymentIntentId: `pi_dev_${req.paymentId}` }
  }

  async refund() {}

  async subscriptionCheckout(req: { providerId: string }) {
    return `${appUrl()}/dev/simulate?action=subscribe&id=${req.providerId}`
  }

  async billingPortal(_customerId: string, providerId: string) {
    return `${appUrl()}/dev/simulate?action=cancel_subscription&id=${providerId}`
  }

  async parseWebhook(): Promise<{ eventId: string; event: ProcessorEvent }> {
    throw new Error('The dev processor has no webhooks; use /dev/simulate')
  }
}
