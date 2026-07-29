import { describe, it, expect, beforeEach } from 'vitest'
import { MockPaymentClient, clearMockPayments } from '@/lib/payments/mock'

describe('Payment Integration Flow', () => {
  beforeEach(() => {
    clearMockPayments()
  })

  it('full lifecycle: create manual -> auto-capture after dispute window -> captured', async () => {
    const client = new MockPaymentClient()
    const future = new Date(Date.now() + 5000)
    const payment = await client.createPaymentIntent({
      coachId: 'coach_1',
      studentId: 'stu_1',
      amountCents: 8000,
      type: 'lesson_auto',
      description: 'Private Lesson Mon 3pm',
      captureMethod: 'manual',
      autoCaptureAt: future,
      idempotencyKey: crypto.randomUUID(),
    })
    expect(payment.status).toBe('requires_capture')
    const captured = await client.capturePayment(payment.id)
    expect(captured.status).toBe('captured')
    const captured2 = await client.capturePayment(payment.id)
    expect(captured2.status).toBe('captured')
  })

  it('paid event registration at time of registration (captured immediately)', async () => {
    const client = new MockPaymentClient()
    const pay = await client.createPaymentIntent({
      coachId: 'coach_1',
      studentId: 'stu_2',
      amountCents: 4000,
      type: 'event_registration',
      description: 'Group Clinic Sat 9am',
      captureMethod: 'automatic',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(pay.status).toBe('captured')
    expect(pay.netToCoachCents).toBe(3800)
  })

  it('split pay for semi-private with remainder handling', async () => {
    const client = new MockPaymentClient()
    const totalCents = 10000
    const split2 = Math.floor(totalCents / 2)
    const remainder = totalCents - split2 * 2

    const p1 = await client.createPaymentIntent({
      coachId: 'c1', studentId: 's1',
      amountCents: split2 + remainder,
      type: 'event_registration',
      description: 'Semi-private split',
      idempotencyKey: crypto.randomUUID(),
    })
    const p2 = await client.createPaymentIntent({
      coachId: 'c1', studentId: 's2',
      amountCents: split2,
      type: 'event_registration',
      description: 'Semi-private split',
      idempotencyKey: crypto.randomUUID(),
    })
    expect(p1.amountCents + p2.amountCents).toBe(totalCents)
  })

  it('idempotency prevents double-charge on retry', async () => {
    const client = new MockPaymentClient()
    const key = `test_idem_${Date.now()}_${Math.random()}`
    const p1 = await client.createPaymentIntent({
      coachId: 'c1', studentId: 's1',
      amountCents: 4000,
      type: 'adhoc',
      description: 'Stringing',
      idempotencyKey: key,
    })
    const p2 = await client.createPaymentIntent({
      coachId: 'c1', studentId: 's1',
      amountCents: 4000,
      type: 'adhoc',
      description: 'Stringing retry',
      idempotencyKey: key,
    })
    expect(p1.id).toBe(p2.id)
    const list = await client.listPaymentsForCoach('c1')
    const filtered = list.filter((p: any) => p.idempotency_key === key)
    expect(filtered.length).toBe(1)
  })

  it('fee model 5% with net_to_coach correct', async () => {
    const client = new MockPaymentClient()
    const cases = [
      { cents: 1000, fee: 50 },
      { cents: 4000, fee: 200 },
      { cents: 8000, fee: 400 },
    ]
    for (const c of cases) {
      const res = await client.createPaymentIntent({
        coachId: 'c_fee', studentId: `s_${c.cents}`,
        amountCents: c.cents,
        type: 'event_registration',
        description: 'Fee check',
        idempotencyKey: crypto.randomUUID(),
      })
      expect(res.applicationFeeCents).toBe(c.fee)
      expect(res.netToCoachCents).toBe(c.cents - c.fee)
    }
  })
})
