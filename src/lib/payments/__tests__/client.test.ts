import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAutoCaptureDelayMs, getPaymentClient, _resetPaymentClientForTests } from '../client'

describe('getAutoCaptureDelayMs', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    delete process.env.NEXT_PUBLIC_AUTO_CAPTURE_DELAY_MINUTES
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns 120 min default when env not set', () => {
    delete process.env.AUTO_CAPTURE_DELAY_MINUTES
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    expect(getAutoCaptureDelayMs()).toBe(120 * 60 * 1000)
  })

  it('parses env minutes', () => {
    process.env.AUTO_CAPTURE_DELAY_MINUTES = '2'
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    expect(getAutoCaptureDelayMs()).toBe(2 * 60 * 1000)
  })

  it('handles custom minutes', () => {
    process.env.AUTO_CAPTURE_DELAY_MINUTES = '60'
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    expect(getAutoCaptureDelayMs()).toBe(60 * 60 * 1000)
  })

  it('handles invalid env falls back to default 120', () => {
    process.env.AUTO_CAPTURE_DELAY_MINUTES = 'invalid'
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    const result = getAutoCaptureDelayMs()
    expect(result).toBe(120 * 60 * 1000)
  })

  it('handles zero or negative as invalid -> default', () => {
    process.env.AUTO_CAPTURE_DELAY_MINUTES = '0'
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    expect(getAutoCaptureDelayMs()).toBe(120 * 60 * 1000)
    process.env.AUTO_CAPTURE_DELAY_MINUTES = '-5'
    expect(getAutoCaptureDelayMs()).toBe(120 * 60 * 1000)
  })

  it('uses demo mode 2 minutes when NEXT_PUBLIC_DEMO_MODE=true', () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true'
    delete process.env.AUTO_CAPTURE_DELAY_MINUTES
    expect(getAutoCaptureDelayMs()).toBe(2 * 60 * 1000)
  })
})

describe('PaymentClient Factory', () => {
  beforeEach(() => {
    _resetPaymentClientForTests()
  })

  it('getPaymentClient returns mock when no stripe key', async () => {
    delete process.env.STRIPE_SECRET_KEY
    _resetPaymentClientForTests()
    const client = getPaymentClient()
    expect(client).toBeDefined()
    expect(typeof client.createPaymentIntent).toBe('function')
    expect(typeof client.capturePayment).toBe('function')
  })

  it('returns same instance on second call (singleton)', () => {
    delete process.env.STRIPE_SECRET_KEY
    _resetPaymentClientForTests()
    const c1 = getPaymentClient()
    const c2 = getPaymentClient()
    expect(c1).toBe(c2)
  })

  it('reset clears singleton and mock store', async () => {
    const c1 = getPaymentClient()
    await c1.createPaymentIntent({
      coachId: 'reset_test_c',
      studentId: 's1',
      amountCents: 1000,
      type: 'adhoc',
      description: 'reset test',
      idempotencyKey: crypto.randomUUID(),
    })
    _resetPaymentClientForTests()
    const c2 = getPaymentClient()
    expect(c1).not.toBe(c2)
    const list = await c2.listPaymentsForCoach('reset_test_c')
    expect(list.length).toBe(0)
  })
})
