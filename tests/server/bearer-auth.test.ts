// Native-app auth: `Authorization: Bearer <token>` resolves the same actor as the browser cookie,
// wins over a cookie when both are sent, and a bad token is "signed out" (401), never a 500.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DEV_SESSION_COOKIE, createDevSession } from '@/server/auth/dev-session'
import { bearerToken, resolveActor } from '@/server/auth/session'
import { resetDb } from '../helpers/db'
import { makeUser } from '../helpers/factories'

// Route handlers read the request through next/headers; outside Next, feed them from this request.
const request = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({
  headers: async () => request.headers,
  cookies: async () => {
    const pairs = (request.headers.get('cookie') ?? '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k)
    const jar = new Map(pairs.map(([k, ...v]) => [k, v.join('=')]))
    return { get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), getAll: () => [...jar].map(([name, value]) => ({ name, value })) }
  },
}))

const { POST: command } = await import('@/app/api/commands/[name]/route')
const { POST: devSignIn } = await import('@/app/api/auth/dev/route')

async function call(name: string, headers: Record<string, string>) {
  request.headers = new Headers(headers)
  const req = new NextRequest(`http://localhost:3000/api/commands/${name}`, { method: 'POST', headers, body: '{}' })
  const res = await command(req, { params: Promise.resolve({ name }) })
  return { status: res.status, body: await res.json() }
}

beforeEach(resetDb)

describe('bearer header parsing', () => {
  it('only treats the Bearer scheme as a bearer token', () => {
    expect(bearerToken(null)).toBeUndefined()
    expect(bearerToken('Basic abc')).toBeUndefined()
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('bearer   abc ')).toBe('abc')
    expect(bearerToken('Bearer')).toBe('')
    expect(bearerToken('Bearer ')).toBe('')
  })
})

describe('bearer auth (dev mode)', () => {
  it('resolves the same actor as the cookie', async () => {
    const user = await makeUser('Maya')
    const token = createDevSession(user.userId).value
    const viaBearer = await call('account.get', { authorization: `Bearer ${token}` })
    const viaCookie = await call('account.get', { cookie: `${DEV_SESSION_COOKIE}=${token}` })
    expect(viaBearer.status).toBe(200)
    expect(viaBearer.body).toEqual(viaCookie.body)
    expect((await resolveActor(`Bearer ${token}`, async () => null))?.userId).toBe(user.userId)
  })

  it('wins over a cookie for a different user', async () => {
    const maya = await makeUser('Maya')
    const sam = await makeUser('Sam')
    const res = await call('account.me', {
      authorization: `Bearer ${createDevSession(maya.userId).value}`,
      cookie: `${DEV_SESSION_COOKIE}=${createDevSession(sam.userId).value}`,
    })
    expect(res.body.data.userId).toBe(maya.userId)
  })

  it('treats an invalid, empty, or expired bearer as signed out, even with a valid cookie', async () => {
    const user = await makeUser('Maya')
    const cookie = `${DEV_SESSION_COOKIE}=${createDevSession(user.userId).value}`
    const expired = createDevSession(user.userId, Date.now() - 31 * 24 * 3600 * 1000).value
    for (const authorization of ['Bearer nope', 'Bearer ', `Bearer ${expired}`, `Bearer ${createDevSession(user.userId).value}x`]) {
      const res = await call('account.get', { authorization, cookie })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('unauthorized')
      expect((await call('account.me', { authorization, cookie })).body).toEqual({ data: null })
    }
  })

  it('ignores non-bearer Authorization headers and falls back to the cookie', async () => {
    const user = await makeUser('Maya')
    const res = await call('account.me', { authorization: 'Basic dXNlcjpwYXNz', cookie: `${DEV_SESSION_COOKIE}=${createDevSession(user.userId).value}` })
    expect(res.body.data.userId).toBe(user.userId)
  })
})

describe('dev sign-in', () => {
  it('returns the session as a bearer token alongside the cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/dev', { method: 'POST', body: JSON.stringify({ email: 'new@example.com', name: 'New' }) })
    const res = await devSignIn(req)
    const body = await res.json()
    expect(body.data).toMatchObject({ ok: true, token: expect.any(String) })
    expect(res.cookies.get(DEV_SESSION_COOKIE)?.value).toBe(body.data.token)
    const me = await call('account.me', { authorization: `Bearer ${body.data.token}` })
    expect(me.body.data).toMatchObject({ email: 'new@example.com', displayName: 'New' })
  })
})
