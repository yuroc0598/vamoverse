import { PaymentClient, CreatePaymentParams, PaymentIntentResult } from './client'
import { PaymentStatus } from '../types/enums'
import { logger } from '../logger'

export class StripePaymentClient implements PaymentClient {
  async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
    if (!params.idempotencyKey) {
      throw new Error('idempotencyKey required - generate UUID at request start')
    }
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0 || params.amountCents > 1_000_000) {
      throw new Error('amountCents must be a positive integer between 1 and 1000000')
    }
    const idempotencyKey = params.idempotencyKey

    logger.warn('payments.stripe_not_implemented', { params })
    const id = `pay_${crypto.randomUUID()}`
    const fee = params.applicationFeeCents ?? Math.round(params.amountCents * 0.05)
    return {
      id,
      status: params.captureMethod === 'manual' ? 'requires_capture' : 'captured',
      amountCents: params.amountCents,
      applicationFeeCents: fee,
      netToCoachCents: params.amountCents - fee,
      autoCaptureAt: params.autoCaptureAt,
      idempotencyKey,
    } as PaymentIntentResult
  }

  async capturePayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    return { status: 'captured' }
  }

  async refundPayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    return { status: 'refunded' }
  }

  async listPaymentsForCoach(coachId: string): Promise<any[]> {
    return []
  }

  async listPaymentsForStudent(studentId: string): Promise<any[]> {
    return []
  }
}
