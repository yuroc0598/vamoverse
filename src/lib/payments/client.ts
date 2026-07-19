import { PaymentType, PaymentStatus } from '../types/enums'

export interface CreatePaymentParams {
  coachId: string
  studentId: string
  amountCents: number
  type: PaymentType
  eventId?: string
  occurrenceId?: string // FIX C6: attach to occurrence
  description: string
  captureMethod?: 'automatic' | 'manual'
  autoCaptureAt?: Date
  // FIX C2: Idempotency key per review
  idempotencyKey?: string
  // FIX H9: Fee model
  applicationFeeCents?: number
  // FIX H8: Customer
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

// Factory - chooses mock or stripe based on env
let clientInstance: PaymentClient | null = null

export function getPaymentClient(): PaymentClient {
  if (clientInstance) return clientInstance

  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY

  if (hasStripeKey) {
    // Dynamic import to avoid bundling stripe when not needed
    const { StripePaymentClient } = require('./stripe')
    clientInstance = new StripePaymentClient()
  } else {
    const { MockPaymentClient } = require('./mock')
    clientInstance = new MockPaymentClient()
  }

  return clientInstance
}

// Helper for auto-capture delay
export function getAutoCaptureDelayMs(): number {
  const minutes = parseInt(process.env.AUTO_CAPTURE_DELAY_MINUTES || '120', 10)
  return minutes * 60 * 1000
}
