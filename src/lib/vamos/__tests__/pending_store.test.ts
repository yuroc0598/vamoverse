import { describe, it, expect, beforeEach } from 'vitest'
import {
  createPendingAction,
  verifyPendingAction,
  consumePendingAction,
  getPendingAction,
  _resetPendingStoreForTests,
} from '../pending_store'

const payload = { tool: 'create_payment', params: { amount_cents: 4000, student_id: 'student_1' }, summary: 'Charge $40' }

describe('pending_store: confirmation is not forgeable (P0-4)', () => {
  beforeEach(() => _resetPendingStoreForTests())

  it('accepts a freshly created action for the owning user', () => {
    const entry = createPendingAction('coach_1', payload)
    expect(entry.id).toMatch(/^pa_\d+_[a-f0-9]{16}$/)
    const res = verifyPendingAction(entry.id, 'coach_1')
    expect(res.valid).toBe(true)
  })

  it('rejects a forged id that was never stored', () => {
    const forged = `pa_${Date.now()}_aaaaaaaaaaaaaaaa`
    const res = verifyPendingAction(forged, 'coach_1')
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('not_found')
    expect(res.status).toBe(400)
  })

  it('rejects when a different user tries to confirm someone else\'s action', () => {
    const entry = createPendingAction('coach_1', payload)
    const res = verifyPendingAction(entry.id, 'student_2')
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('user_mismatch')
    expect(res.status).toBe(403)
  })

  it('rejects an anonymous actor for a user-scoped action', () => {
    const entry = createPendingAction('coach_1', payload)
    const res = verifyPendingAction(entry.id, null)
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('user_required')
    expect(res.status).toBe(403)
  })

  it('detects tampering: mutating the stored payload breaks the HMAC', () => {
    const entry = createPendingAction('coach_1', payload)
    // Simulate an attacker mutating the stored payload without re-signing.
    entry.payload.params.amount_cents = 999999
    const res = verifyPendingAction(entry.id, 'coach_1')
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('signature_mismatch')
  })

  it('rejects an expired action', () => {
    const entry = createPendingAction('coach_1', payload)
    entry.expiresAt = Date.now() - 1000
    const res = verifyPendingAction(entry.id, 'coach_1')
    expect(res.valid).toBe(false)
    expect(res.reason).toBe('expired')
  })

  it('is single-use: consuming removes it so it cannot be replayed', () => {
    const entry = createPendingAction('coach_1', payload)
    expect(verifyPendingAction(entry.id, 'coach_1').valid).toBe(true)
    const consumed = consumePendingAction(entry.id)
    expect(consumed?.id).toBe(entry.id)
    expect(getPendingAction(entry.id)).toBeUndefined()
    expect(verifyPendingAction(entry.id, 'coach_1').reason).toBe('not_found')
  })

  it('allows null-owner actions (anonymous drafts) to be confirmed by anyone', () => {
    const entry = createPendingAction(null, payload)
    expect(verifyPendingAction(entry.id, null).valid).toBe(true)
    expect(verifyPendingAction(entry.id, 'anyone').valid).toBe(true)
  })
})
