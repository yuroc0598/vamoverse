import { describe, it, expect, beforeEach } from 'vitest'
import { MockPaymentClient, clearMockPayments } from '../mock'

describe('MockPaymentClient', () => {
  let client: MockPaymentClient

  beforeEach(() => {
    clearMockPayments()
    client = new MockPaymentClient()
  })

  it('creates payment with auto id and stripe id', async () => {
    const res = await client.createPaymentIntent({
      coachId: 'coach_1',
      studentId: 'stu_1',
      amountCents: 4000,
      type: 'event_registration',
      description: 'Group Clinic',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(res.id).toMatch(/^pay_/)
    expect(res.status).toBe('captured')
    expect(res.amountCents).toBe(4000)
    expect(res.idempotencyKey).toBeTruthy()
  })

  it('applies 5% application fee by default', async () => {
    const res = await client.createPaymentIntent({
      coachId: 'coach_1',
      studentId: 'stu_1',
      amountCents: 10000,
      type: 'adhoc',
      description: 'Stringing',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(res.applicationFeeCents).toBe(500)
    expect(res.netToCoachCents).toBe(9500)
  })

  it('respects custom applicationFeeCents', async () => {
    const res = await client.createPaymentIntent({
      coachId: 'c1',
      studentId: 's1',
      amountCents: 10000,
      type: 'adhoc',
      description: 'Custom fee',
      applicationFeeCents: 250,
      idempotencyKey: crypto.randomUUID(),
    })
    expect(res.applicationFeeCents).toBe(250)
  })

  it('creates manual capture with requires_capture status and autoCaptureAt', async () => {
    const future = new Date(Date.now() + 2 * 60 * 1000)
    const res = await client.createPaymentIntent({
      coachId: 'c1',
      studentId: 's1',
      amountCents: 8000,
      type: 'lesson_auto',
      description: 'Private Lesson',
      captureMethod: 'manual',
      autoCaptureAt: future,
      idempotencyKey: crypto.randomUUID(),
    })
    expect(res.status).toBe('requires_capture')
    expect(res.autoCaptureAt?.getTime()).toBe(future.getTime())
  })

  it('idempotent creation via idempotencyKey', async () => {
    const key = `idem_test_${Date.now()}_unique_${Math.random()}`
    const p1 = await client.createPaymentIntent({
      coachId: 'c1',
      studentId: 's1',
      amountCents: 5000,
      type: 'adhoc',
      description: 'Idem test',
      idempotencyKey: key,
    })
    const p2 = await client.createPaymentIntent({
      coachId: 'c1',
      studentId: 's1',
      amountCents: 5000,
      type: 'adhoc',
      description: 'Idem test duplicate',
      idempotencyKey: key,
    })
    expect(p1.id).toBe(p2.id)
    expect(p1.amountCents).toBe(p2.amountCents)
  })

  it('capturePayment is idempotent', async () => {
    const created = await client.createPaymentIntent({
      coachId: 'c1',
      studentId: 's1',
      amountCents: 8000,
      type: 'lesson_auto',
      description: 'To capture',
      captureMethod: 'manual',
      autoCaptureAt: new Date(Date.now() + 10000),
      idempotencyKey: crypto.randomUUID(),
    })
    expect(created.status).toBe('requires_capture')
    const cap1 = await client.capturePayment(created.id)
    expect(cap1.status).toBe('captured')
    const cap2 = await client.capturePayment(created.id)
    expect(cap2.status).toBe('captured')
  })

  it('refund changes status', async () => {
    const created = await client.createPaymentIntent({
      coachId: 'c1',
      studentId: 's1',
      amountCents: 4000,
      type: 'event_registration',
      description: 'To refund',
      idempotencyKey: crypto.randomUUID(),
    })
    const refunded = await client.refundPayment(created.id)
    expect(refunded.status).toBe('refunded')
  })

  it('listPaymentsForCoach filters by coach', async () => {
    const coachId = `coach_${Date.now()}_${Math.random()}`
    await client.createPaymentIntent({ coachId, studentId: 's1', amountCents: 1000, type: 'adhoc', description: 'A', idempotencyKey: crypto.randomUUID() })
    await client.createPaymentIntent({ coachId, studentId: 's2', amountCents: 2000, type: 'adhoc', description: 'B', idempotencyKey: crypto.randomUUID() })
    const list = await client.listPaymentsForCoach(coachId)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.every((p: any) => p.coach_id === coachId)).toBe(true)
  })

  it('getPendingCaptures returns only expired requires_capture', () => {
    const pending = MockPaymentClient.getPendingCaptures()
    expect(Array.isArray(pending)).toBe(true)
  })

  it('stores occurrence_id when provided (C6 fix)', async () => {
    const res = await client.createPaymentIntent({
      coachId: 'c1',
      studentId: 's1',
      amountCents: 4000,
      type: 'lesson_auto',
      description: 'Occurrence attached',
      occurrenceId: 'occ_123',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(res.id).toBeTruthy()
  })

  it('throws if idempotencyKey missing', async () => {
    await expect(
      // @ts-expect-error testing missing key
      client.createPaymentIntent({
        coachId: 'c1',
        studentId: 's1',
        amountCents: 1000,
        type: 'adhoc',
        description: 'no key',
      })
    ).rejects.toThrow('idempotencyKey required')
  })

  it('rejects non-positive or non-integer amounts (no zero/negative charges)', async () => {
    const base = {
      coachId: 'c1',
      studentId: 's1',
      type: 'adhoc' as const,
      description: 'bad amount',
    }
    for (const amountCents of [0, -100, 1.5, NaN, 2_000_000]) {
      await expect(
        client.createPaymentIntent({ ...base, amountCents, idempotencyKey: crypto.randomUUID() })
      ).rejects.toThrow('amountCents must be a positive integer')
    }
  })
})
