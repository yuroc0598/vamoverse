import { describe, it, expect } from 'vitest'
import { getCompatibility, getCompatibilityColor, parseUTR, getNTRPLabel, formatUTRHistory } from '../rating'

describe('getCompatibility', () => {
  it('returns unknown when missing params', () => {
    expect(getCompatibility(undefined, 3, 5).status).toBe('unknown')
    expect(getCompatibility(4.5, undefined, 5).status).toBe('unknown')
    expect(getCompatibility(4.5, 3, undefined).status).toBe('unknown')
  })
  it('good match when delta <0.5', () => {
    // event avg = (4+5)/2=4.5, player 4.5 delta 0 => good
    const res = getCompatibility(4.5, 4, 5)
    expect(res.status).toBe('good')
    expect(res.delta).toBe(0)
    expect(res.label).toMatch(/Good Match/)
  })
  it('stretch when delta <=1.0', () => {
    // avg 4.5, player 5.5 delta 1.0 => stretch
    const res = getCompatibility(5.5, 4, 5)
    expect(res.status).toBe('stretch')
    expect(res.label).toMatch(/Stretch/)
  })
  it('mismatch when delta >1.0', () => {
    const res = getCompatibility(6.0, 4, 5)
    expect(res.status).toBe('mismatch')
    expect(res.delta).toBe(1.5)
  })
  it('boundary 0.49 good, 0.5 stretch', () => {
    // avg 4, min 3 max5 => avg4
    expect(getCompatibility(4.49, 3, 5).status).toBe('good')
    expect(getCompatibility(4.5, 3, 5).status).toBe('stretch')
  })
})

describe('getCompatibilityColor', () => {
  it('returns correct colors', () => {
    expect(getCompatibilityColor('good')).toMatch(/green/)
    expect(getCompatibilityColor('stretch')).toMatch(/yellow/)
    expect(getCompatibilityColor('mismatch')).toMatch(/red/)
    expect(getCompatibilityColor('unknown')).toMatch(/gray/)
  })
})

describe('parseUTR', () => {
  it('parses valid UTR', () => {
    expect(parseUTR('4.5')).toBe(4.5)
    expect(parseUTR('16.5')).toBe(16.5)
    expect(parseUTR('1')).toBe(1)
    expect(parseUTR('10.123')).toBe(10.12) // rounded 2 decimals
    expect(parseUTR(' 4.5 ')).toBe(4.5) // trims whitespace
  })
  it('rejects out of range', () => {
    expect(parseUTR('0.9')).toBeNull()
    expect(parseUTR('16.6')).toBeNull()
    expect(parseUTR('20')).toBeNull()
    expect(parseUTR('abc')).toBeNull()
    expect(parseUTR('')).toBeNull()
    expect(parseUTR('   ')).toBeNull()
  })
  it('allows up to 16.5 per N15 fix (not 10.5)', () => {
    expect(parseUTR('12')).not.toBeNull()
    expect(parseUTR('15.5')).not.toBeNull()
    expect(parseUTR('16.5')).not.toBeNull()
  })
  it('returns null for non-string input', () => {
    // @ts-ignore
    expect(parseUTR(null as any)).toBeNull()
    // @ts-ignore
    expect(parseUTR(undefined as any)).toBeNull()
  })
})

describe('getNTRPLabel', () => {
  it('returns Unrated when undefined', () => {
    expect(getNTRPLabel(undefined)).toBe('Unrated')
  })
  it('returns known labels', () => {
    expect(getNTRPLabel(3.5)).toMatch(/Improved/)
    expect(getNTRPLabel(4.0)).toMatch(/Dependable/)
    expect(getNTRPLabel(7.0)).toMatch(/World Class/)
  })
  it('returns fallback formatted', () => {
    const label = getNTRPLabel(3.3)
    expect(label).toContain('3.3')
  })
})

describe('formatUTRHistory', () => {
  it('formats dates and preserves values', () => {
    const history = [
      { date: '2024-01-01', utr_singles: 4.5, utr_doubles: 4.2 },
      { date: '2024-02-01', utr_singles: 4.6 }
    ]
    const formatted = formatUTRHistory(history)
    expect(formatted.length).toBe(2)
    expect(formatted[0].singles).toBe(4.5)
    expect(formatted[0].doubles).toBe(4.2)
    expect(formatted[1].singles).toBe(4.6)
    expect(formatted[0].date).toBeTruthy()
  })
})
