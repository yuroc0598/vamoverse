import { describe, expect, it, vi } from 'vitest'
import { lookupUtrAccount, normalizeName, parseUtrId } from '@/lib/ratings/utr_lookup'

type Source = Record<string, unknown>

function searchResponse(sources: Source[], total = sources.length) {
  return new Response(JSON.stringify({ hits: sources.map((source) => ({ source })), total }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

function fetchReturning(response: Response | (() => Promise<Response>)) {
  return vi.fn(async () => (typeof response === 'function' ? response() : response)) as unknown as typeof fetch
}

const jane: Source = {
  id: 1234567, displayName: 'Jane Doe', firstName: 'Jane', lastName: 'Doe',
  claimed: true, isDemoPlayer: false, location: { display: 'Sunnyvale, CA' },
  singlesUtr: 0, singlesUtrDisplay: '0.xx',
}

describe('parseUtrId', () => {
  it.each([
    ['1234567', '1234567'],
    ['  1234567 ', '1234567'],
    ['https://app.utrsports.net/profiles/1234567', '1234567'],
    ['app.utrsports.net/profiles/1234567?tab=results', '1234567'],
    ['https://www.utrsports.net/profiles/0042/', '42'],
  ])('accepts %s', (input, expected) => {
    expect(parseUtrId(input)).toBe(expected)
  })

  it.each([
    '', 'abc', '12.5', 'https://example.com/profiles/1234567',
    'https://app.utrsports.net.evil.com/profiles/1', '1234567890123',
  ])('rejects %s', (input) => {
    expect(parseUtrId(input)).toBeNull()
  })
})

describe('normalizeName', () => {
  it('ignores case, accents, punctuation, and extra spaces', () => {
    expect(normalizeName('  José   O’Brien-Núñez ')).toBe('jose o brien nunez')
    expect(normalizeName('JOHN SMITH ')).toBe(normalizeName('john smith'))
  })
})

describe('lookupUtrAccount', () => {
  it('finds an account whose ID and name both match', async () => {
    const fetchImpl = fetchReturning(searchResponse([{ ...jane, id: 999, displayName: 'Jane Doe' }, jane]))
    const result = await lookupUtrAccount({ utrId: '1234567', name: 'jane doe' }, { fetchImpl })
    expect(result).toEqual({
      status: 'found',
      account: { id: '1234567', displayName: 'Jane Doe', claimed: true, location: 'Sunnyvale, CA' },
    })
  })

  it('searches UTR by name with the result cap', async () => {
    const fetchImpl = fetchReturning(searchResponse([jane]))
    await lookupUtrAccount({ utrId: 'https://app.utrsports.net/profiles/1234567', name: ' Jane Doe ' }, {
      fetchImpl, searchUrl: 'https://utr.test/search',
    })
    const url = new URL(String((fetchImpl as any).mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe('https://utr.test/search')
    expect(url.searchParams.get('query')).toBe('Jane Doe')
    expect(url.searchParams.get('top')).toBe('20')
  })

  it('matches on first and last name when the display name differs', async () => {
    const fetchImpl = fetchReturning(searchResponse([{ ...jane, displayName: 'JD' }]))
    const result = await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl })
    expect(result.status).toBe('found')
  })

  it('reports a name mismatch when the ID belongs to someone else', async () => {
    const fetchImpl = fetchReturning(searchResponse([{ ...jane, displayName: 'Jane Smith', lastName: 'Smith' }]))
    expect(await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl }))
      .toEqual({ status: 'name_mismatch' })
  })

  it('does not accept a partial name', async () => {
    const fetchImpl = fetchReturning(searchResponse([{ ...jane, displayName: 'Mary Jane Doe', firstName: 'Mary Jane' }]))
    expect((await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl })).status).toBe('name_mismatch')
  })

  it('ignores UTR demo players', async () => {
    const fetchImpl = fetchReturning(searchResponse([{ ...jane, isDemoPlayer: true }]))
    expect((await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl })).status).toBe('not_found')
  })

  it('says the name is too common when exact matches fill the visible results', async () => {
    const sameName = Array.from({ length: 20 }, (_, i) => ({ ...jane, id: i + 1 }))
    const fetchImpl = fetchReturning(searchResponse(sameName, 10000))
    expect(await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl }))
      .toEqual({ status: 'too_many_matches', totalMatches: 10000 })
  })

  it('reports not found once results move past exact name matches', async () => {
    const results = [{ ...jane, id: 1 }, { ...jane, id: 2, displayName: 'Jane Doering', lastName: 'Doering' }]
    const fetchImpl = fetchReturning(searchResponse(results, 5712))
    expect((await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl })).status).toBe('not_found')
  })

  it('reports not found when every result was visible', async () => {
    const fetchImpl = fetchReturning(searchResponse([{ ...jane, id: 1 }]))
    expect((await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl })).status).toBe('not_found')
  })

  it('does not call UTR for an invalid ID or empty name', async () => {
    const fetchImpl = fetchReturning(searchResponse([jane]))
    expect((await lookupUtrAccount({ utrId: 'nope', name: 'Jane Doe' }, { fetchImpl })).status).toBe('not_found')
    expect((await lookupUtrAccount({ utrId: '1234567', name: ' !! ' }, { fetchImpl })).status).toBe('not_found')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('treats HTTP errors as unavailable', async () => {
    const fetchImpl = fetchReturning(new Response('blocked', { status: 403 }))
    expect(await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl }))
      .toEqual({ status: 'unavailable', reason: 'http_403' })
  })

  it('treats an unexpected response shape as unavailable', async () => {
    const fetchImpl = fetchReturning(new Response(JSON.stringify({ players: [] }), { status: 200 }))
    expect(await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl }))
      .toEqual({ status: 'unavailable', reason: 'unexpected_response' })
  })

  it('treats network failures and timeouts as unavailable', async () => {
    const failing = fetchReturning(() => Promise.reject(new TypeError('fetch failed')))
    expect(await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl: failing }))
      .toEqual({ status: 'unavailable', reason: 'network_error' })

    const timeout = fetchReturning(() => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })))
    expect(await lookupUtrAccount({ utrId: '1234567', name: 'Jane Doe' }, { fetchImpl: timeout }))
      .toEqual({ status: 'unavailable', reason: 'timeout' })
  })
})
