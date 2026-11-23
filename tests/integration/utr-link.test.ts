import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE as unlinkUtr, POST as linkUtr } from '@/app/api/profile/utr/route'
import { GET as getProfile } from '@/app/api/profile/route'
import { _resetKvForTests } from '@/lib/cache/kv'

const cookie = `vamoverse_mock_session=${encodeURIComponent(JSON.stringify({ id: 'student_1', email: 'maya@demo.com', role: 'student' }))}`

function post(body: unknown, withCookie = true) {
  return new NextRequest('http://localhost/api/profile/utr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(withCookie ? { cookie } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function stubUtrSearch(sources: Record<string, unknown>[], total = sources.length) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hits: sources.map((source) => ({ source })), total }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const maya = { id: 7654321, displayName: 'Maya Chen', firstName: 'Maya', lastName: 'Chen', claimed: true, isDemoPlayer: false, location: { display: 'Fremont, CA' } }

beforeEach(() => {
  _resetKvForTests()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
  vi.stubEnv('DATABASE_URL', '')
  vi.stubEnv('REDIS_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('UTR account link API', () => {
  it('requires an authenticated actor', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const fetchMock = stubUtrSearch([maya])
    expect((await linkUtr(post({ utrId: '7654321', name: 'Maya Chen' }, false))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed input before calling UTR', async () => {
    const fetchMock = stubUtrSearch([maya])
    expect((await linkUtr(post('{not json'))).status).toBe(400)
    expect((await linkUtr(post({ utrId: '7654321' }))).status).toBe(400)
    expect((await linkUtr(post({ utrId: 'https://example.com/profiles/1', name: 'Maya Chen' }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirms an existing account in demo mode without persisting it', async () => {
    stubUtrSearch([maya])
    const response = await linkUtr(post({ utrId: 'https://app.utrsports.net/profiles/7654321', name: 'maya chen' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'found',
      account: { id: '7654321', displayName: 'Maya Chen', claimed: true, location: 'Fremont, CA' },
      demo: true,
      persisted: false,
    })
  })

  it.each([
    [[{ ...maya, displayName: 'Someone Else', firstName: 'Someone', lastName: 'Else' }], 1, 422, 'name_mismatch'],
    [Array.from({ length: 20 }, (_, i) => ({ ...maya, id: i + 1 })), 10000, 422, 'too_many_matches'],
    [[{ ...maya, id: 1 }], 1, 404, 'not_found'],
  ])('maps lookup outcomes to responses (%#)', async (sources, total, httpStatus, status) => {
    stubUtrSearch(sources as Record<string, unknown>[], total as number)
    const response = await linkUtr(post({ utrId: '7654321', name: 'Maya Chen' }))
    expect(response.status).toBe(httpStatus)
    const payload = await response.json()
    expect(payload.status).toBe(status)
    expect(payload.error).toEqual(expect.any(String))
  })

  it('reports UTR outages as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    const response = await linkUtr(post({ utrId: '7654321', name: 'Maya Chen' }))
    expect(response.status).toBe(503)
    expect((await response.json()).status).toBe('unavailable')
  })

  it('rate-limits lookups per user', async () => {
    const fetchMock = stubUtrSearch([maya])
    for (let i = 0; i < 10; i++) {
      expect((await linkUtr(post({ utrId: '7654321', name: 'Maya Chen' }))).status).toBe(200)
    }
    expect((await linkUtr(post({ utrId: '7654321', name: 'Maya Chen' }))).status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })

  it('does not call UTR outside demo mode without a real session', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'real-looking-key')
    const fetchMock = stubUtrSearch([maya])
    const response = await linkUtr(post({ utrId: '7654321', name: 'Maya Chen' }))
    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('unlink and profile read are demo no-ops', async () => {
    const unlink = await unlinkUtr(new NextRequest('http://localhost/api/profile/utr', { method: 'DELETE', headers: { cookie } }))
    expect(await unlink.json()).toEqual({ demo: true, persisted: false })
    const profile = await getProfile(new NextRequest('http://localhost/api/profile', { headers: { cookie } }))
    expect(await profile.json()).toEqual({ demo: true, persisted: false })
  })
})
