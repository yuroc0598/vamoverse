import { describe, it, expect } from 'vitest'
import { validateDiscipline } from '@/lib/utils/gender'
import { parseUTR, getCompatibility } from '@/lib/utils/rating'
import { parseIntent } from '@/lib/vamos/mock_engine'

describe('Full App Smoke - Critical Paths', () => {
  it('coach can create group clinic with open discipline and mixed genders', () => {
    const players = [
      { id: '1', gender: 'M' as const },
      { id: '2', gender: 'F' as const },
      { id: '3', gender: 'other' as const }
    ]
    const res = validateDiscipline('open', players)
    expect(res.valid).toBe(true)
  })

  it('student can parse UTR and get compatibility', () => {
    const utr = parseUTR('4.5')
    expect(utr).toBe(4.5)
    const comp = getCompatibility(utr!, 4, 5)
    expect(comp.status).toBe('good')
  })

  it('vamos understands mixed doubles UTR search and suggests players', () => {
    const intent = parseIntent('Find me mixed doubles Thu 7pm UTR 4-5 near Fremont')
    expect(intent.intent).toBe('search_players')
    expect(intent.entities.discipline).toBe('mixed_doubles')
    // Simulate flow
    const playersForMatch = [
      { id: 'sarah', gender: 'F' as const, utr_singles: 4.8 },
      { id: 'leo', gender: 'M' as const, utr_singles: 4.5 },
    ]
    // Validate gender for mixed
    const disciplinePlayers = playersForMatch.map(p => ({ id: p.id, gender: p.gender }))
    // Partial 1M1F valid
    expect(validateDiscipline('mixed_doubles', disciplinePlayers).valid).toBe(true)
  })

  it('payment amounts formatted correctly via currency', async () => {
    const { formatCurrency } = await import('@/lib/utils')
    expect(formatCurrency(4000)).toBe('$40.00')
    expect(formatCurrency(8000)).toBe('$80.00')
  })

  it('event capacity respects discipline', async () => {
    const { getCapacityForDiscipline } = await import('@/lib/utils/gender')
    expect(getCapacityForDiscipline('mens_singles', 'private')).toBe(1)
    expect(getCapacityForDiscipline('open_doubles', 'group_clinic')).toBe(8)
  })

  it('UTR range up to 16.5 supported for college/pro', () => {
    expect(parseUTR('16.5')).toBe(16.5)
    expect(parseUTR('16.6')).toBeNull()
    expect(parseUTR('0')).toBeNull()
    expect(parseUTR('1')).toBe(1)
  })

  it('mixed doubles blocks 3M1F which is critical business rule', () => {
    const bad = [
      { id: '1', gender: 'M' as const },
      { id: '2', gender: 'M' as const },
      { id: '3', gender: 'M' as const },
      { id: '4', gender: 'F' as const },
    ]
    const result = validateDiscipline('mixed_doubles', bad)
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('Edge Cases & Regression', () => {
  it('empty players always valid (allows event creation before roster)', () => {
    expect(validateDiscipline('mens_singles', []).valid).toBe(true)
    expect(validateDiscipline('mixed_doubles', []).valid).toBe(true)
  })

  it('UTR parsing handles decimals', () => {
    expect(parseUTR('4.55')).toBe(4.55)
    expect(parseUTR('4.555')).toBe(4.56) // rounded to 2 decimals? Actually code rounds to 100 => 4.56
  })

  it('vamos intent fallback is general_chat', () => {
    expect(parseIntent('asdf qwerty random').intent).toBe('general_chat')
  })

  it('compatibility unknown when no UTR', () => {
    const res = getCompatibility(undefined, 3, 5)
    expect(res.status).toBe('unknown')
  })
})
