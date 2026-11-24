// The payment processor boundary. Stripe in production; a local simulator in development
// that emits the same normalized events, so every code path after the processor is shared.
import { paymentsMode } from '../../config'

export interface CheckoutRequest {
  paymentId: string
  mode: 'payment' | 'setup'
  customerId: string
  description: string
  amountCents: number
  platformFeeCents: number
  destinationAccountId: string
  successUrl: string
  cancelUrl: string
  expiresAt: Date
}

export interface OffSessionCharge {
  paymentId: string
  customerId: string
  paymentMethodId: string
  description: string
  amountCents: number
  platformFeeCents: number
  destinationAccountId: string
}

export type ChargeResult = { ok: true; paymentIntentId: string } | { ok: false; message: string; paymentIntentId?: string }

export interface CardDetails { id: string; brand: string | null; last4: string | null }

/** Processor events normalized for the shared handler (webhooks and dev simulator). */
export type ProcessorEvent =
  | { type: 'checkout.completed'; paymentId: string; paymentIntentId: string | null; card: CardDetails | null }
  | { type: 'checkout.expired'; paymentId: string }
  | { type: 'payment.succeeded'; paymentId: string; paymentIntentId: string }
  | { type: 'payment.refunded'; paymentIntentId: string; refundedCents: number }
  | { type: 'payment.disputed'; paymentIntentId: string }
  | { type: 'account.updated'; accountId: string; chargesEnabled: boolean; payoutsEnabled: boolean }
  | { type: 'subscription.updated'; providerId: string; subscriptionId: string; status: 'active' | 'past_due' | 'canceled'; periodEnd: Date | null }
  | { type: 'ignored' }

export interface Processor {
  readonly name: 'stripe' | 'dev'
  ensureCustomer(user: { id: string; email: string | null; phone: string | null; name: string; customerId: string | null }): Promise<string>
  createConnectedAccount(provider: { id: string; email: string | null }): Promise<string>
  onboardingLink(accountId: string, providerId: string): Promise<string>
  accountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }>
  createCheckout(req: CheckoutRequest): Promise<{ id: string; url: string }>
  chargeOffSession(req: OffSessionCharge): Promise<ChargeResult>
  refund(paymentIntentId: string, amountCents: number, idempotencyKey: string): Promise<void>
  subscriptionCheckout(req: { providerId: string; customerId: string }): Promise<string>
  billingPortal(customerId: string, providerId: string): Promise<string>
  parseWebhook(rawBody: string, signature: string | null): Promise<{ eventId: string; event: ProcessorEvent }>
}

let cached: { mode: string; processor: Processor } | null = null

export async function getProcessor(): Promise<Processor> {
  const mode = paymentsMode()
  if (cached?.mode !== mode) {
    const processor = mode === 'stripe' ? new (await import('./stripe')).StripeProcessor() : new (await import('./dev')).DevProcessor()
    cached = { mode, processor }
  }
  return cached.processor
}
