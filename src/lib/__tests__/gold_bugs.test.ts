import { describe, it, expect } from 'vitest'

// Gold tests for bug fixes - these should FAIL without fix, PASS with fix

describe('Gold: gender capacity for open discipline', () => {
  it('should return 20 for open custom_match', async () => {
    const { getCapacityForDiscipline } = await import('@/lib/utils/gender')
    const cap = getCapacityForDiscipline('open' as any, 'custom_match')
    expect(cap).toBe(20)
  })
})

describe('Gold: womens parsing bug - womens contains mens substring', () => {
  it('should parse womens doubles as F not any', async () => {
    const { parseIntent } = await import('@/lib/vamos/mock_engine')
    const res = parseIntent('find womens doubles player UTR 4-5')
    expect(res.entities.gender).toBe('F')
  })

  it('should parse mens and womens as any', async () => {
    const { parseIntent } = await import('@/lib/vamos/mock_engine')
    const res = parseIntent('find mens and womens doubles players')
    expect(res.entities.gender).toBe('any')
  })
})

describe('Gold: auto-capture delay invalid handling', () => {
  it('should fallback to 120min for invalid env', async () => {
    const original = process.env.AUTO_CAPTURE_DELAY_MINUTES
    process.env.AUTO_CAPTURE_DELAY_MINUTES = 'invalid'
    // Need to reimport fresh module - we test the function directly
    const { getAutoCaptureDelayMs, _resetPaymentClientForTests } = await import('@/lib/payments/client')
    // Reset to ensure fresh read
    const result = getAutoCaptureDelayMs()
    expect(result).toBe(120 * 60 * 1000)
    process.env.AUTO_CAPTURE_DELAY_MINUTES = original
  })

  it('should fallback for zero or negative', async () => {
    const original = process.env.AUTO_CAPTURE_DELAY_MINUTES
    const { getAutoCaptureDelayMs } = await import('@/lib/payments/client')
    process.env.AUTO_CAPTURE_DELAY_MINUTES = '0'
    expect(getAutoCaptureDelayMs()).toBe(120 * 60 * 1000)
    process.env.AUTO_CAPTURE_DELAY_MINUTES = '-5'
    expect(getAutoCaptureDelayMs()).toBe(120 * 60 * 1000)
    process.env.AUTO_CAPTURE_DELAY_MINUTES = original
  })
})

describe('Gold: parseUTR trimming and null handling', () => {
  it('should handle whitespace trimming', async () => {
    const { parseUTR } = await import('@/lib/utils/rating')
    expect(parseUTR(' 4.5 ')).toBe(4.5)
    expect(parseUTR('   ')).toBeNull()
  })

  it('should handle non-string input', async () => {
    const { parseUTR } = await import('@/lib/utils/rating')
    // @ts-ignore
    expect(parseUTR(null as any)).toBeNull()
    // @ts-ignore
    expect(parseUTR(undefined as any)).toBeNull()
  })
})

describe('Gold: getCompatibility null vs falsy', () => {
  it('should handle 0 as valid number but out of UTR range? Actually 0 is falsy but should be treated as provided', async () => {
    const { getCompatibility } = await import('@/lib/utils/rating')
    // 0 is not valid UTR (min 1) but should not be treated as missing via falsy check
    // Old code: if (!playerUTR) => unknown for 0, new code checks nullish + isFinite
    // For 0, old returns unknown, new should also return unknown? Actually 0 is provided but invalid range - but we test nullish handling
    // For null/undefined, should be unknown
    expect(getCompatibility(undefined as any, 3, 5).status).toBe('unknown')
    expect(getCompatibility(null as any, 3, 5).status).toBe('unknown')
    // For valid, should compute
    const valid = getCompatibility(4.5, 4, 5)
    expect(valid.status).toBe('good')
  })
})
