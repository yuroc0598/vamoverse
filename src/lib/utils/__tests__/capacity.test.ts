import { describe, it, expect } from 'vitest'
import { registerWithCapacityCheck, getConversationMembers } from '../capacity'

describe('registerWithCapacityCheck', () => {
  it('registers when under capacity', async () => {
    const res = await registerWithCapacityCheck('occ1', 'stu1', 'evt1', 2, 8)
    expect(res.success).toBe(true)
    expect(res.status).toBe('registered')
    expect(res.registrationId).toMatch(/^reg_/)
  })
  it('waitlists when at capacity', async () => {
    const res = await registerWithCapacityCheck('occ1', 'stu1', 'evt1', 8, 8)
    expect(res.success).toBe(true)
    expect(res.status).toBe('waitlisted')
    expect(res.registrationId).toMatch(/wait/)
  })
  it('waitlists when over capacity', async () => {
    const res = await registerWithCapacityCheck('occ1', 'stu1', 'evt1', 10, 8)
    expect(res.status).toBe('waitlisted')
  })
  it('registers when 0 count', async () => {
    const res = await registerWithCapacityCheck('occ1', 'stu1', 'evt1', 0, 1)
    expect(res.status).toBe('registered')
  })
  it('edge capacity 0 always waitlists', async () => {
    const res = await registerWithCapacityCheck('occ1', 'stu1', 'evt1', 0, 0)
    expect(res.status).toBe('waitlisted')
  })
})

describe('getConversationMembers', () => {
  it('filters users by memberIds', () => {
    const conv = {
      id: 'c1', type: 'group' as const,
      memberIds: ['u1', 'u2'],
      createdAt: new Date()
    }
    const users = [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }, { id: 'u3', name: 'C' }]
    const members = getConversationMembers(conv as any, users)
    expect(members.length).toBe(2)
    expect(members.map((m: any) => m.id)).toEqual(['u1', 'u2'])
  })
  it('returns empty when no match', () => {
    const conv = { id: 'c1', type: 'dm' as const, memberIds: ['nope'], createdAt: new Date() }
    expect(getConversationMembers(conv as any, [{ id: 'u1' }]).length).toBe(0)
  })
})
