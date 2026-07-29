import { PaymentClient, CreatePaymentParams, PaymentIntentResult } from './client'
import { PaymentStatus } from '../types/enums'
import { getAutoCaptureDelayMinutes } from './constants'

// Singleton per serverless instance - in prod idempotency is enforced via Supabase UNIQUE constraint on idempotency_key
// For mock, in-memory array is per-instance; reset clears both memory and localStorage for test isolation
const STORAGE_KEY = 'vamoverse_mock_payments'
const mockPayments: any[] = []

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function loadFromStorage(): void {
  if (!isBrowser()) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const stored: any[] = JSON.parse(raw)
    if (!Array.isArray(stored)) return
    for (const p of stored) {
      if (!mockPayments.some((m) => m.id === p.id || m.idempotency_key === p.idempotency_key)) {
        mockPayments.push(p)
      }
    }
  } catch {}
}

function saveToStorage(): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockPayments))
  } catch {}
}

export function clearMockPayments(): void {
  mockPayments.length = 0
  if (isBrowser()) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }
}

export function _getMockPaymentsForTests(): any[] {
  return mockPayments
}

export class MockPaymentClient implements PaymentClient {
  async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
    if (!params.idempotencyKey) {
      throw new Error('idempotencyKey required - generate UUID at request start')
    }
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0 || params.amountCents > 1_000_000) {
      throw new Error('amountCents must be a positive integer between 1 and 1000000')
    }
    const idempotencyKey = params.idempotencyKey

    loadFromStorage()

    const existingByIdem = mockPayments.find((p) => p.idempotency_key === idempotencyKey)
    if (existingByIdem) {
      return {
        id: existingByIdem.id,
        status: existingByIdem.status as PaymentStatus,
        stripePaymentIntentId: existingByIdem.stripe_payment_intent_id,
        amountCents: existingByIdem.amount_cents,
        applicationFeeCents: existingByIdem.application_fee_cents,
        netToCoachCents: existingByIdem.amount_cents - (existingByIdem.application_fee_cents || 0),
        autoCaptureAt: existingByIdem.auto_capture_at ? new Date(existingByIdem.auto_capture_at) : undefined,
        idempotencyKey,
      }
    }

    const id = `pay_${crypto.randomUUID()}`
    const stripeId = `pi_mock_${crypto.randomUUID().slice(0, 12)}`

    const now = new Date()
    let status: PaymentStatus = 'captured'
    let autoCaptureAt: Date | undefined = undefined

    if (params.captureMethod === 'manual') {
      status = 'requires_capture'
      if (params.autoCaptureAt) {
        autoCaptureAt = params.autoCaptureAt
      } else {
        const minutes = getAutoCaptureDelayMinutes()
        autoCaptureAt = new Date(now.getTime() + minutes * 60 * 1000)
      }
    }

    const applicationFeeCents = params.applicationFeeCents ?? Math.round(params.amountCents * 0.05)
    const netToCoachCents = params.amountCents - applicationFeeCents

    const payment = {
      id,
      coach_id: params.coachId,
      student_id: params.studentId,
      event_id: params.eventId,
      occurrence_id: params.occurrenceId,
      amount_cents: params.amountCents,
      application_fee_cents: applicationFeeCents,
      net_to_coach_cents: netToCoachCents,
      type: params.type,
      status,
      description: params.description,
      stripe_payment_intent_id: stripeId,
      stripe_customer_id: params.stripeCustomerId,
      idempotency_key: idempotencyKey,
      internal_review_status: status === 'requires_capture' ? 'hold' : null,
      auto_capture_at: autoCaptureAt?.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    mockPayments.push(payment)
    saveToStorage()

    return {
      id,
      status,
      stripePaymentIntentId: stripeId,
      amountCents: params.amountCents,
      applicationFeeCents,
      netToCoachCents,
      autoCaptureAt,
      idempotencyKey,
    }
  }

  async capturePayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    loadFromStorage()
    const payment = mockPayments.find((p) => p.id === paymentId)
    if (payment) {
      if (payment.status !== 'requires_capture') {
        saveToStorage()
        return { status: payment.status as PaymentStatus }
      }
      payment.status = 'captured'
      payment.internal_review_status = 'approved'
      payment.captured_at = new Date().toISOString()
      payment.updated_at = new Date().toISOString()
      saveToStorage()
      return { status: 'captured' }
    }
    return { status: 'captured' }
  }

  async refundPayment(paymentId: string): Promise<{ status: PaymentStatus }> {
    loadFromStorage()
    const payment = mockPayments.find((p) => p.id === paymentId)
    if (payment) {
      payment.status = 'refunded'
      payment.updated_at = new Date().toISOString()
      saveToStorage()
    }
    return { status: 'refunded' }
  }

  async listPaymentsForCoach(coachId: string): Promise<any[]> {
    loadFromStorage()
    return mockPayments.filter((p) => p.coach_id === coachId)
  }

  async listPaymentsForStudent(studentId: string): Promise<any[]> {
    loadFromStorage()
    return mockPayments.filter((p) => p.student_id === studentId)
  }

  static getPendingCaptures(): any[] {
    loadFromStorage()
    const now = new Date()
    return mockPayments.filter((p) => {
      if (p.status !== 'requires_capture' || !p.auto_capture_at) return false
      const at = new Date(p.auto_capture_at)
      if (isNaN(at.getTime())) return false
      return at <= now
    })
  }
}
