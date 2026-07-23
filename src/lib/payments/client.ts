import { PaymentType, PaymentStatus } from '../types/enums'
import { getAutoCaptureDelayMs as getDelayMs } from './constants'

export const AUTO_CAPTURE_DELAY_MINUTES_DEFAULT = 120

export interface CreatePaymentParams {
  coachId: string
  studentId: string
  amountCents: number
  type: PaymentType
  eventId?: string
  occurrenceId?: string
  description: string
  captureMethod?: 'automatic' | 'manual'
  autoCaptureAt?: Date
  idempotencyKey: string
  applicationFeeCents?: number
  stripeCustomerId?: string
}

export interface PaymentIntentResult {
  id: string
  status: PaymentStatus
  stripePaymentIntentId?: string
  clientSecret?: string
  amountCents: number
  applicationFeeCents?: number
  netToCoachCents?: number
  autoCaptureAt?: Date
  idempotencyKey: string
}

export interface PaymentClient {
  createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult>
  capturePayment(paymentId: string): Promise<{ status: PaymentStatus }>
  refundPayment(paymentId: string): Promise<{ status: PaymentStatus }>
  listPaymentsForCoach(coachId: string): Promise<any[]>
  listPaymentsForStudent(studentId: string): Promise<any[]>
}

// Singleton is per serverless instance - in prod idempotency handled via DB UNIQUE on idempotency_key and FOR UPDATE SKIP LOCKED
let clientInstance: PaymentClient | null = null

import { MockPaymentClient as MockClient, clearMockPayments } from './mock'
import { StripePaymentClient as StripeClient } from './stripe'

export function getPaymentClient(): PaymentClient {
  if (clientInstance) return clientInstance
  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY
  if (hasStripeKey) {
    clientInstance = new StripeClient()
  } else {
    clientInstance = new MockClient()
  }
  return clientInstance
}

export function _resetPaymentClientForTests() {
  clientInstance = null
  try {
    clearMockPayments()
  } catch {}
}

export function _resetPaymentClientInstanceForTests() {
  clientInstance = null
}

export function getAutoCaptureDelayMs(): number {
  return getDelayMs()
}

export { getDelayMs as _getDelayMsInternal }
