import { PaymentClient, CreatePaymentParams, PaymentIntentResult } from './client'
import { PaymentStatus } from '../types/enums'
import { logger } from '../logger'
import Stripe from 'stripe'

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key)
}

function mapStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
  switch (status) {
    case 'succeeded': return 'captured'
    case 'requires_capture': return 'requires_capture'
    case 'requires_action': return 'requires_action'
    case 'canceled': return 'cancelled'
    case 'requires_payment_method': return 'failed'
    default: return 'pending'
  }
}

export class StripePaymentClient implements PaymentClient {
  async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
    if (!params.idempotencyKey) {
      throw new Error('idempotencyKey required - generate UUID at request start')
    }
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0 || params.amountCents > 1_000_000) {
      throw new Error('amountCents must be a positive integer between 1 and 1000000')
    }
    const idempotencyKey = params.idempotencyKey

    const fee = params.applicationFeeCents ?? Math.round(params.amountCents * 0.05)
    const stripe = client()
    const intent = await stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: 'usd',
      capture_method: params.captureMethod === 'manual' ? 'manual' : 'automatic_async',
      automatic_payment_methods: { enabled: true },
      customer: params.stripeCustomerId,
      description: params.description,
      metadata: {
        coach_id: params.coachId,
        student_id: params.studentId,
        event_id: params.eventId || '',
        occurrence_id: params.occurrenceId || '',
        payment_type: params.type,
      },
    }, { idempotencyKey })
    logger.info('payments.stripe_intent_created', { intentId: intent.id, status: intent.status })
    return {
      id: intent.id,
      stripePaymentIntentId: intent.id,
      clientSecret: intent.client_secret || undefined,
      status: mapStatus(intent.status),
      amountCents: params.amountCents,
      applicationFeeCents: fee,
      netToCoachCents: params.amountCents - fee,
      autoCaptureAt: params.autoCaptureAt,
      idempotencyKey,
    }
  }

  async capturePayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    const intent = await client().paymentIntents.capture(paymentId)
    return { status: mapStatus(intent.status) }
  }

  async refundPayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    await client().refunds.create({ payment_intent: paymentId })
    return { status: 'refunded' }
  }

  async listPaymentsForCoach(coachId: string): Promise<any[]> {
    throw new Error(`Payment listing must use the database repository (coach ${coachId})`)
  }

  async listPaymentsForStudent(studentId: string): Promise<any[]> {
    throw new Error(`Payment listing must use the database repository (student ${studentId})`)
  }
}
