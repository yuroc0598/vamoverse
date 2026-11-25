// The apple-app-site-association file: which links open the native app.
import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/.well-known/apple-app-site-association/route'
import { claimedPaths } from '@/server/universal-links'

const saved = process.env.APPLE_TEAM_ID
afterEach(() => { if (saved === undefined) delete process.env.APPLE_TEAM_ID; else process.env.APPLE_TEAM_ID = saved })

describe('apple-app-site-association', () => {
  it('is a 404 until the Apple Team ID is configured', async () => {
    delete process.env.APPLE_TEAM_ID
    expect(GET().status).toBe(404)
  })

  it('names the App Store app and lists exclusions before the claimed paths', async () => {
    process.env.APPLE_TEAM_ID = 'TEAM123456'
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const { applinks } = await res.json()
    const [details] = applinks.details
    expect(details.appIDs).toEqual(['TEAM123456.com.vamoverse.app'])
    const paths = details.components.map((c: { '/': string; exclude?: boolean }) => `${c.exclude ? '!' : ''}${c['/']}`)
    for (const path of ['/s/*', '/b/*', '/p/*', '/sessions/*', '/messages/*', '/notifications', '/today', '/money', '/crew', '/schedule', '/settings', '/settings/payouts']) {
      expect(paths).toContain(path)
    }
    for (const path of ['/api/*', '/dev/*', '/admin', '/login', '/auth/*']) expect(paths).toContain(`!${path}`)
    expect(paths).not.toContain('/')
    expect(paths).not.toContain('/login')
    const firstClaim = paths.findIndex((p: string) => !p.startsWith('!'))
    expect(paths.slice(firstClaim).every((p: string) => !p.startsWith('!'))).toBe(true)
    expect(claimedPaths().every((p) => !p.startsWith('/auth') && !p.startsWith('/api'))).toBe(true)
  })
})
