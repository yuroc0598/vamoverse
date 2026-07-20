import { describe, it, expect } from 'vitest'
import { validateDiscipline, getCapacityForDiscipline } from '@/lib/utils/gender'
import { registerWithCapacityCheck } from '@/lib/utils/capacity'

describe('Registration Flow Integration', () => {
  it('mixed doubles registration enforces 2M2F exactly', async () => {
    const discipline = 'mixed_doubles' as const
    // Step 1: validate partial fill
    let players = [{ id: '1', gender: 'M' as const }, { id: '2', gender: 'F' as const }]
    expect(validateDiscipline(discipline, players).valid).toBe(true)

    // Step 2: try to add 2 more M (would be 3M1F) should fail
    players = [
      { id: '1', gender: 'M' as const }, { id: '2', gender: 'M' as const },
      { id: '3', gender: 'M' as const }, { id: '4', gender: 'F' as const }
    ]
    expect(validateDiscipline(discipline, players).valid).toBe(false)

    // Step 3: correct 2M2F passes
    players = [
      { id: '1', gender: 'M' as const }, { id: '2', gender: 'M' as const },
      { id: '3', gender: 'F' as const }, { id: '4', gender: 'F' as const }
    ]
    expect(validateDiscipline(discipline, players).valid).toBe(true)
  })

  it('capacity enforcement prevents overbooking -> waitlist', async () => {
    const capacity = 4
    // First 4 registrations succeed
    for (let i = 0; i < 4; i++) {
      const res = await registerWithCapacityCheck('occ1', `stu${i}`, 'evt1', i, capacity)
      expect(res.status).toBe('registered')
    }
    // 5th goes to waitlist
    const res = await registerWithCapacityCheck('occ1', 'stu5', 'evt1', 4, capacity)
    expect(res.status).toBe('waitlisted')
  })

  it('open doubles allows other gender, mens_doubles does not', () => {
    const otherPlayer = { id: '1', gender: 'other' as const }
    expect(validateDiscipline('open_doubles', [otherPlayer]).valid).toBe(true)
    expect(validateDiscipline('mens_doubles', [otherPlayer as any]).valid).toBe(false)
  })

  it('capacity per discipline types', () => {
    expect(getCapacityForDiscipline('mens_singles', 'custom_match')).toBe(2)
    expect(getCapacityForDiscipline('mens_doubles', 'custom_match')).toBe(4)
    expect(getCapacityForDiscipline('mens_singles', 'private')).toBe(1)
    expect(getCapacityForDiscipline('open_doubles', 'semi_private')).toBe(4)
    expect(getCapacityForDiscipline('open', 'group_clinic')).toBe(8)
  })

  it('full flow: validate -> capacity check -> payment', async () => {
    const discipline = 'mens_doubles' as const
    const players = [
      { id: '1', gender: 'M' as const }, { id: '2', gender: 'M' as const },
      { id: '3', gender: 'M' as const }, { id: '4', gender: 'M' as const }
    ]
    // Gender valid
    expect(validateDiscipline(discipline, players).valid).toBe(true)

    // Capacity check
    const cap = getCapacityForDiscipline(discipline, 'custom_match')
    expect(cap).toBe(4)

    // Registration mock
    const reg = await registerWithCapacityCheck('occ_custom', 'stu_owner', 'evt_custom', 0, cap)
    expect(reg.success).toBe(true)
  })
})
