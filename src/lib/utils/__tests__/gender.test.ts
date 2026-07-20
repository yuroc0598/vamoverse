import { describe, it, expect } from 'vitest'
import { validateDiscipline, getCapacityForDiscipline, suggestBalancedTeams, GENDER_TEST_CASES } from '../gender'
import type { Discipline } from '../../types/enums'

describe('validateDiscipline', () => {
  it('allows empty players list for any discipline', () => {
    const disciplines: Discipline[] = [
      'mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles',
      'mixed_doubles', 'open_singles', 'open_doubles', 'open'
    ]
    for (const d of disciplines) {
      expect(validateDiscipline(d, []).valid).toBe(true)
    }
  })

  describe('mens_singles', () => {
    it('validates 2M as valid', () => {
      expect(validateDiscipline('mens_singles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' }
      ]).valid).toBe(true)
    })
    it('rejects F in mens_singles', () => {
      expect(validateDiscipline('mens_singles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'F' }
      ]).valid).toBe(false)
    })
    it('rejects over capacity', () => {
      expect(validateDiscipline('mens_singles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' }, { id: '3', gender: 'M' }
      ]).valid).toBe(false)
    })
  })

  describe('womens_singles', () => {
    it('validates 2F as valid', () => {
      expect(validateDiscipline('womens_singles', [
        { id: '1', gender: 'F' }, { id: '2', gender: 'F' }
      ]).valid).toBe(true)
    })
    it('rejects M in womens_singles', () => {
      expect(validateDiscipline('womens_singles', [
        { id: '1', gender: 'F' }, { id: '2', gender: 'M' }
      ]).valid).toBe(false)
    })
    it('rejects over capacity symmetric to mens', () => {
      expect(validateDiscipline('womens_singles', [
        { id: '1', gender: 'F' }, { id: '2', gender: 'F' }, { id: '3', gender: 'F' }
      ]).valid).toBe(false)
    })
  })

  describe('mens_doubles', () => {
    it('validates 4M', () => {
      expect(validateDiscipline('mens_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' },
        { id: '3', gender: 'M' }, { id: '4', gender: 'M' }
      ]).valid).toBe(true)
    })
    it('rejects F', () => {
      expect(validateDiscipline('mens_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' }, { id: '3', gender: 'F' }
      ]).valid).toBe(false)
    })
    it('rejects over 4', () => {
      expect(validateDiscipline('mens_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' }, { id: '3', gender: 'M' },
        { id: '4', gender: 'M' }, { id: '5', gender: 'M' }
      ]).valid).toBe(false)
    })
  })

  describe('womens_doubles', () => {
    it('validates 4F', () => {
      expect(validateDiscipline('womens_doubles', [
        { id: '1', gender: 'F' }, { id: '2', gender: 'F' },
        { id: '3', gender: 'F' }, { id: '4', gender: 'F' }
      ]).valid).toBe(true)
    })
    it('rejects M', () => {
      expect(validateDiscipline('womens_doubles', [
        { id: '1', gender: 'F' }, { id: '2', gender: 'F' }, { id: '3', gender: 'M' }
      ]).valid).toBe(false)
    })
  })

  describe('mixed_doubles', () => {
    it('validates 2M2F exactly when full', () => {
      expect(validateDiscipline('mixed_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' },
        { id: '3', gender: 'F' }, { id: '4', gender: 'F' }
      ]).valid).toBe(true)
    })
    it('rejects 3M1F', () => {
      const res = validateDiscipline('mixed_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' },
        { id: '3', gender: 'M' }, { id: '4', gender: 'F' }
      ])
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/2M.*2F|3M1F|currently/i)
    })
    it('rejects 1M3F', () => {
      expect(validateDiscipline('mixed_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'F' },
        { id: '3', gender: 'F' }, { id: '4', gender: 'F' }
      ]).valid).toBe(false)
    })
    it('allows partial fills with max 2M2F', () => {
      expect(validateDiscipline('mixed_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'F' }
      ]).valid).toBe(true)
    })
    it('rejects partial with 3M', () => {
      expect(validateDiscipline('mixed_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' }, { id: '3', gender: 'M' }
      ]).valid).toBe(false)
    })
    it('rejects other/unspecified gender', () => {
      expect(validateDiscipline('mixed_doubles', [
        { id: '1', gender: 'other' as any }
      ]).valid).toBe(false)
    })
  })

  describe('open disciplines', () => {
    it('allows other in open_doubles', () => {
      expect(validateDiscipline('open_doubles', [
        { id: '1', gender: 'other' as any }, { id: '2', gender: 'M' as const }
      ]).valid).toBe(true)
    })
    it('rejects other in mens_doubles', () => {
      expect(validateDiscipline('mens_doubles', [
        { id: '1', gender: 'other' as any }
      ]).valid).toBe(false)
    })
    it('open_singles max 2', () => {
      expect(validateDiscipline('open_singles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'F' }, { id: '3', gender: 'other' as any }
      ]).valid).toBe(false)
    })
    it('open_doubles max 4', () => {
      expect(validateDiscipline('open_doubles', [
        { id: '1', gender: 'M' }, { id: '2', gender: 'M' }, { id: '3', gender: 'M' },
        { id: '4', gender: 'M' }, { id: '5', gender: 'M' }
      ]).valid).toBe(false)
    })
    it('open max 20', () => {
      const players = Array.from({ length: 21 }, (_, i) => ({ id: `${i}`, gender: 'M' as const }))
      expect(validateDiscipline('open', players).valid).toBe(false)
      const players20 = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, gender: 'M' as const }))
      expect(validateDiscipline('open', players20).valid).toBe(true)
    })
  })

  it('runs embedded GENDER_TEST_CASES', () => {
    for (const tc of GENDER_TEST_CASES) {
      const result = validateDiscipline(tc.discipline, tc.players as any)
      expect(result.valid, `Failed case ${tc.discipline} ${JSON.stringify(tc.players)} reason: ${tc.reason || ''}`).toBe(tc.expect)
    }
  })
})

describe('getCapacityForDiscipline', () => {
  it('returns 2 for singles custom_match', () => {
    expect(getCapacityForDiscipline('mens_singles', 'custom_match')).toBe(2)
    expect(getCapacityForDiscipline('womens_singles', 'custom_match')).toBe(2)
    expect(getCapacityForDiscipline('open_singles', 'custom_match')).toBe(2)
  })
  it('returns 4 for doubles custom_match', () => {
    expect(getCapacityForDiscipline('mens_doubles', 'custom_match')).toBe(4)
    expect(getCapacityForDiscipline('womens_doubles', 'custom_match')).toBe(4)
    expect(getCapacityForDiscipline('mixed_doubles', 'custom_match')).toBe(4)
    expect(getCapacityForDiscipline('open_doubles', 'custom_match')).toBe(4)
  })
  it('returns 1 for private', () => {
    expect(getCapacityForDiscipline('mens_singles', 'private')).toBe(1)
  })
  it('returns 4 for semi_private', () => {
    expect(getCapacityForDiscipline('open_doubles', 'semi_private')).toBe(4)
  })
  it('returns 8 for group_clinic', () => {
    expect(getCapacityForDiscipline('open', 'group_clinic')).toBe(8)
  })
  it('fallback returns 2', () => {
    expect(getCapacityForDiscipline('mens_singles', 'unknown_type')).toBe(2)
  })
  // Fixed: open custom_match should return 20 (open max) not 2
  it('returns 20 for open custom_match (fixed)', () => {
    const cap = getCapacityForDiscipline('open', 'custom_match')
    expect(cap).toBe(20)
  })
})

describe('suggestBalancedTeams', () => {
  it('handles non-4 length', () => {
    const players = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }]
    const res = suggestBalancedTeams(players as any)
    expect(res.teamA.length).toBe(2)
    expect(res.teamB.length).toBe(1)
    expect(res.delta).toBe(0)
  })
  it('finds minimal delta among 3 combos', () => {
    const players = [
      { id: '1', name: 'A', utr: 5.0 },
      { id: '2', name: 'B', utr: 5.0 },
      { id: '3', name: 'C', utr: 1.0 },
      { id: '4', name: 'D', utr: 1.0 },
    ]
    const { teamA, teamB, delta } = suggestBalancedTeams(players)
    // Best should pair high+low vs high+low => delta 0
    expect(delta).toBe(0)
    expect(teamA.length).toBe(2)
    expect(teamB.length).toBe(2)
  })
  it('produces unbalanced suggestion when delta >1', () => {
    const players = [
      { id: '1', name: 'A', utr: 8.0 },
      { id: '2', name: 'B', utr: 7.0 },
      { id: '3', name: 'C', utr: 1.0 },
      { id: '4', name: 'D', utr: 1.0 },
    ]
    const res = suggestBalancedTeams(players)
    // All combos: [8+7=15 vs 1+1=2 delta13], [8+1=9 vs7+1=8 delta1], [8+1=9 vs7+1=8 delta1] => best delta 1
    expect(res.delta).toBeLessThanOrEqual(1)
    // Test with even more unbalanced? Actually 8,7,1,1 best delta is 1
    // Now make 10,9,1,1 => combos: 19vs2 delta17, 11vs10 delta1, 11vs10 delta1 => still 1
    // To force >1, need 10,10,1,1 => 20vs2 delta18, 11vs11 delta0 => 0, so always can balance if paired high+low
    // Let's test 10,9,8,1 => combos: 19vs9 delta10, 18vs10 delta8, 11vs17 delta6 => best 6 >1 => unbalanced suggestion
    const players2 = [
      { id: '1', name: 'A', utr: 10 },
      { id: '2', name: 'B', utr: 9 },
      { id: '3', name: 'C', utr: 8 },
      { id: '4', name: 'D', utr: 1 },
    ]
    const res2 = suggestBalancedTeams(players2)
    expect(res2.delta).toBeGreaterThan(1)
    expect(res2.suggestion).toMatch(/Unbalanced/)
  })
  it('suggests balanced when delta <0.3', () => {
    const players = [
      { id: '1', name: 'A', utr: 4.0 },
      { id: '2', name: 'B', utr: 4.1 },
      { id: '3', name: 'C', utr: 4.0 },
      { id: '4', name: 'D', utr: 4.0 },
    ]
    const res = suggestBalancedTeams(players)
    expect(res.delta).toBeLessThan(0.3)
    expect(res.suggestion).toMatch(/Balanced/)
  })
  it('handles missing utr as 0', () => {
    const players = [
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
      { id: '3', name: 'C' },
      { id: '4', name: 'D' },
    ]
    const res = suggestBalancedTeams(players as any)
    expect(res.delta).toBe(0)
  })
})
