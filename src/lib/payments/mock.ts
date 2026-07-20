import { PaymentClient, CreatePaymentParams, PaymentIntentResult } from './client'
import { PaymentStatus } from '../types/enums'

// In-memory store for MVP - in real app this would be DB
const mockPayments: any[] = []

export class MockPaymentClient implements PaymentClient {
  async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
    // FIX C2: Idempotency key - generate if not provided, check existing to prevent double-charge
    const idempotencyKey = params.idempotencyKey || `idem_${params.coachId}_${params.studentId}_${params.amountCents}_${params.type}_${Date.now()}`
    
    // Check if payment with same idempotency key already exists (idempotent)
    const existingByIdem = mockPayments.find(p => p.idempotency_key === idempotencyKey)
    if (existingByIdem) {
      return {
        id: existingByIdem.id,
        status: existingByIdem.status as PaymentStatus,
        stripePaymentIntentId: existingByIdem.stripe_payment_intent_id,
        amountCents: existingByIdem.amount_cents,
        applicationFeeCents: existingByIdem.application_fee_cents,
        netToCoachCents: existingByIdem.amount_cents - (existingByIdem.application_fee_cents || 0),
        autoCaptureAt: existingByIdem.auto_capture_at ? new Date(existingByIdem.auto_capture_at) : undefined,
        idempotencyKey
      }
    }

    if (typeof window !== 'undefined') {
      const stored = JSON.parse(localStorage.getItem('vamoverse_mock_payments') || '[]')
      const existingStored = stored.find((p: any) => p.idempotency_key === idempotencyKey)
      if (existingStored) {
        return {
          id: existingStored.id,
          status: existingStored.status,
          stripePaymentIntentId: existingStored.stripe_payment_intent_id,
          amountCents: existingStored.amount_cents,
          applicationFeeCents: existingStored.application_fee_cents,
          netToCoachCents: existingStored.amount_cents - (existingStored.application_fee_cents || 0),
          autoCaptureAt: existingStored.auto_capture_at ? new Date(existingStored.auto_capture_at) : undefined,
          idempotencyKey
        }
      }
    }

    const id = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const stripeId = `pi_mock_${Math.random().toString(36).substring(2, 11)}`
    
    const now = new Date()
    let status: PaymentStatus = 'captured'
    let autoCaptureAt: Date | undefined = undefined

    if (params.captureMethod === 'manual') {
      status = 'requires_capture'
      const delayMs = params.autoCaptureAt ? params.autoCaptureAt.getTime() - now.getTime() : 2 * 60 * 1000
      autoCaptureAt = new Date(now.getTime() + delayMs)
      if (params.autoCaptureAt) {
        autoCaptureAt = params.autoCaptureAt
      } else {
        const minutes = parseInt(process.env.AUTO_CAPTURE_DELAY_MINUTES || '2', 10)
        autoCaptureAt = new Date(now.getTime() + minutes * 60 * 1000)
      }
    }

    // FIX H9: Fee model - application fee 5% or 2.5% based on plan, here mock 5%
    const applicationFeeCents = params.applicationFeeCents ?? Math.round(params.amountCents * 0.05)
    const netToCoachCents = params.amountCents - applicationFeeCents

    // FIX H10: Rounding handled at higher level - first payer absorbs remainder

    const payment = {
      id,
      coach_id: params.coachId,
      student_id: params.studentId,
      event_id: params.eventId,
      occurrence_id: params.occurrenceId, // FIX C6
      amount_cents: params.amountCents,
      application_fee_cents: applicationFeeCents,
      net_to_coach_cents: netToCoachCents,
      type: params.type,
      status,
      description: params.description,
      stripe_payment_intent_id: stripeId,
      stripe_customer_id: params.stripeCustomerId, // FIX H8
      idempotency_key: idempotencyKey, // FIX C2
      internal_review_status: status === 'requires_capture' ? 'hold' : null, // FIX C3 separate internal vs Stripe
      auto_capture_at: autoCaptureAt?.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }

    mockPayments.push(payment)

    if (typeof window !== 'undefined') {
      const stored = JSON.parse(localStorage.getItem('vamoverse_mock_payments') || '[]')
      stored.push(payment)
      localStorage.setItem('vamoverse_mock_payments', JSON.stringify(stored))
    }

    return {
      id,
      status,
      stripePaymentIntentId: stripeId,
      amountCents: params.amountCents,
      applicationFeeCents,
      netToCoachCents,
      autoCaptureAt,
      idempotencyKey
    }
  }

  // FIX C2: Capture must be idempotent and server-side with row locking in prod
  // This mock simulates FOR UPDATE SKIP LOCKED via status check WHERE status='requires_capture'
  async capturePayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    // In prod: UPDATE payments SET status='captured' WHERE id=$1 AND status='requires_capture' RETURNING *
    // If no rows affected, already captured - idempotent success
    const payment = mockPayments.find(p => p.id === paymentId)
    if (payment) {
      if (payment.status !== 'requires_capture') {
        // Already captured or other status - idempotent return
        return { status: payment.status as PaymentStatus }
      }
      payment.status = 'captured'
      payment.internal_review_status = 'approved'
      payment.captured_at = new Date().toISOString()
      payment.updated_at = new Date().toISOString()
    }

    if (typeof window !== 'undefined') {
      const stored = JSON.parse(localStorage.getItem('vamoverse_mock_payments') || '[]')
      const idx = stored.findIndex((p: any) => p.id === paymentId)
      if (idx !== -1) {
        if (stored[idx].status !== 'requires_capture') {
          return { status: stored[idx].status }
        }
        stored[idx].status = 'captured'
        stored[idx].internal_review_status = 'approved'
        stored[idx].captured_at = new Date().toISOString()
        localStorage.setItem('vamoverse_mock_payments', JSON.stringify(stored))
      }
    }

    return { status: 'captured' }
  }

  async refundPayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    const payment = mockPayments.find(p => p.id === paymentId)
    if (payment) {
      payment.status = 'refunded'
    }
    return { status: 'refunded' }
  }

  async listPaymentsForCoach(coachId: string): Promise<any[]> {
    if (typeof window !== 'undefined') {
      const stored = JSON.parse(localStorage.getItem('vamoverse_mock_payments') || '[]')
      return stored.filter((p: any) => p.coach_id === coachId)
    }
    return mockPayments.filter(p => p.coach_id === coachId)
  }

  async listPaymentsForStudent(studentId: string): Promise<any[]> {
    if (typeof window !== 'undefined') {
      const stored = JSON.parse(localStorage.getItem('vamoverse_mock_payments') || '[]')
      return stored.filter((p: any) => p.student_id === studentId)
    }
    return mockPayments.filter(p => p.student_id === studentId)
  }

  // For server-side auto-capture job
  static getPendingCaptures(): any[] {
    // Check localStorage or memory
    if (typeof window !== 'undefined') {
      return JSON.parse(localStorage.getItem('vamoverse_mock_payments') || '[]').filter((p: any) => 
        p.status === 'requires_capture' && p.auto_capture_at && new Date(p.auto_capture_at) <= new Date()
      )
    }
    return mockPayments.filter(p => 
      p.status === 'requires_capture' && p.auto_capture_at && new Date(p.auto_capture_at) <= new Date()
    )
  }
}
