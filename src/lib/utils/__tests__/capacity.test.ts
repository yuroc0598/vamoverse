import { describe, it, expect, beforeEach } from 'vitest'
import { registerWithCapacityCheck, clearMockRegistrations, getServerCount, mockRegistrations } from '../capacity'

describe('registerWithCapacityCheck', () => {
  beforeEach(() => {
    clearMockRegistrations()
  })

  it('registers when under capacity (new 4-arg signature)', async () => {
    const res = await registerWithCapacityCheck('occ_new_1', 'stu1', 'evt1', 8)
    expect(res.success).toBe(true)
    expect(res.status).toBe('registered')
    expect(res.registrationId).toMatch(/^reg_/)
    expect(getServerCount('occ_new_1')).toBe(1)
  })

  it('waitlists when at capacity', async () => {
    for (let i = 0; i < 8; i++) {
      await registerWithCapacityCheck('occ_full', `stu${i}`, 'evt1', 8)
    }
    const res = await registerWithCapacityCheck('occ_full', 'stu_new', 'evt1', 8)
    expect(res.success).toBe(true)
    expect(res.status).toBe('waitlisted')
    expect(res.registrationId).toMatch(/wait/)
  })

  it('waitlists when over capacity', async () => {
    for (let i = 0; i < 8; i++) {
      await registerWithCapacityCheck('occ_over', `stu${i}`, 'evt1', 8)
    }
    const res = await registerWithCapacityCheck('occ_over', 'stu_extra', 'evt1', 8)
    expect(res.status).toBe('waitlisted')
  })

  it('registers when 0 count', async () => {
    const res = await registerWithCapacityCheck('occ_empty', 'stu1', 'evt1', 1)
    expect(res.status).toBe('registered')
  })

  it('edge capacity 0 always waitlists', async () => {
    const res = await registerWithCapacityCheck('occ_zero_cap', 'stu1', 'evt1', 0)
    expect(res.status).toBe('waitlisted')
  })

  it('ignores client-provided currentCount and uses server count (TOCTOU fix)', async () => {
    await registerWithCapacityCheck('occ_toctou', 'stu1', 'evt1', 2)
    await registerWithCapacityCheck('occ_toctou', 'stu2', 'evt1', 2)
    // Client says count=0 but server has 2/2 full => should waitlist
    const res = await registerWithCapacityCheck('occ_toctou', 'stu3', 'evt1', 0, 2)
    expect(res.status).toBe('waitlisted')
    // Verify server count is still 2
    expect(getServerCount('occ_toctou')).toBe(2)
    expect(mockRegistrations.filter(r => r.occurrenceId === 'occ_toctou' && r.status === 'registered').length).toBe(2)
  })

  it('supports backward compat 5-arg signature ignoring client count', async () => {
    const res = await registerWithCapacityCheck('occ_bc', 'stu1', 'evt1', 2, 8)
    expect(res.status).toBe('registered')
    const res2 = await registerWithCapacityCheck('occ_bc', 'stu2', 'evt1', 8, 8)
    expect(res2.status).toBe('registered')
  })
})
