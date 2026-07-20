import { describe, it, expect } from 'vitest'
import { cn, formatCurrency, formatDate, generateMockId } from '../utils'

describe('cn', () => {
  it('merges classes', () => {
    expect(cn('text-red', 'bg-blue')).toContain('text-red')
    expect(cn('text-red', 'bg-blue')).toContain('bg-blue')
  })
  it('handles conditional classes via clsx', () => {
    expect(cn('a', { b: true, c: false })).toContain('a')
    expect(cn('a', { b: true, c: false })).toContain('b')
    expect(cn('a', { b: true, c: false })).not.toContain('c')
  })
  it('twMerge dedupes', () => {
    const res = cn('p-2', 'p-4')
    expect(res).toBe('p-4') // last wins
  })
})

describe('formatCurrency', () => {
  it('formats cents to USD', () => {
    expect(formatCurrency(100)).toBe('$1.00')
    expect(formatCurrency(4000)).toBe('$40.00')
    expect(formatCurrency(0)).toBe('$0.00')
  })
  it('supports other currency', () => {
    const res = formatCurrency(100, 'EUR')
    expect(res).toContain('1.00')
  })
})

describe('formatDate', () => {
  it('formats Date object', () => {
    const d = new Date('2024-01-15T15:30:00Z')
    const formatted = formatDate(d)
    expect(formatted).toBeTruthy()
    expect(typeof formatted).toBe('string')
  })
  it('formats string date', () => {
    const formatted = formatDate('2024-01-15')
    expect(formatted).toBeTruthy()
  })
})

describe('generateMockId', () => {
  it('generates with default prefix', () => {
    const id = generateMockId()
    expect(id).toMatch(/^mock_/)
  })
  it('uses custom prefix', () => {
    const id = generateMockId('pay')
    expect(id).toMatch(/^pay_/)
  })
  it('uniqueness', () => {
    const a = generateMockId()
    const b = generateMockId()
    expect(a).not.toBe(b)
  })
})
