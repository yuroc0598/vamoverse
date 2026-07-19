// Stripe implementation - skeleton for when Stripe keys are available
import { PaymentClient, CreatePaymentParams, PaymentIntentResult } from './client'
import { PaymentStatus } from '../types/enums'

export class StripePaymentClient implements PaymentClient {
  async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
    // TODO: Implement real Stripe API call
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    // const pi = await stripe.paymentIntents.create({...})
    console.log('Stripe client called but not fully implemented, falling back to mock logic', params)
    
    const id = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    return {
      id,
      status: params.captureMethod === 'manual' ? 'requires_capture' : 'captured',
      amountCents: params.amountCents,
      autoCaptureAt: params.autoCaptureAt
    }
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
