// The native app's contract: docs/api/*.json must match the code, every web page must be known
// to the native Router (or marked web-only), and every link the server writes must route.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ROUTES, WEB_ONLY_PAGES, matchAppRoute } from '@/lib/app-routes'
import { apiDocs, commandCatalog, sharedStrings } from '@/server/api-catalog'
import { commands } from '@/server/commands/registry'
import { bookingPath } from '@/server/modules/bookings/links'

const ROOT = resolve(__dirname, '../..')

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path, keep) : keep(path) ? [path] : []
  })
}

describe('docs/api', () => {
  it('is up to date (run `npm run api:catalog` after changing commands, labels, or routes)', () => {
    for (const [file, expected] of Object.entries(apiDocs())) {
      let actual = ''
      try { actual = readFileSync(join(ROOT, file), 'utf8') } catch { /* missing counts as stale */ }
      expect(actual, `${file} is stale: run npm run api:catalog`).toBe(expected)
    }
  })

  it('lists every command with an input schema', () => {
    const catalog = commandCatalog().commands
    expect(catalog.map((c) => c.name).sort()).toEqual(Object.keys(commands).sort())
    const importCmd = catalog.find((c) => c.name === 'clients.import')!
    expect(importCmd).toMatchObject({ access: 'provider', mutates: true, input: { type: 'object', properties: { text: { type: 'string' } } } })
  })

  it('carries formatter vectors computed by the real functions', () => {
    const { vectors } = sharedStrings()
    expect(vectors.formatMoney).toContainEqual({ args: [6000], out: '$60' })
    expect(vectors.formatMoney).toContainEqual({ args: [6050], out: '$60.50' })
    expect(vectors.formatSessionRange.length).toBeGreaterThan(20)
  })
})

describe('native router table', () => {
  const normalize = (pattern: string) => pattern.replace(/:[^/]+/g, ':')

  it('knows every web page, or marks it web-only', () => {
    const appDir = join(ROOT, 'src/app')
    const pages = files(appDir, (p) => p.endsWith('/page.tsx')).map((p) => {
      const segments = relative(appDir, p).split('/').slice(0, -1).filter((s) => !/^\(.*\)$/.test(s))
      return `/${segments.map((s) => s.replace(/^\[(.+)\]$/, ':$1')).join('/')}`
    })
    const known = new Set([...APP_ROUTES.map((r) => normalize(r.pattern)), ...WEB_ONLY_PAGES])
    const missing = pages.filter((p) => !known.has(normalize(p)))
    expect(missing, 'add these pages to src/lib/app-routes.ts').toEqual([])
    expect(pages.length).toBeGreaterThan(25)
  })

  it('routes every link the server writes (notifications, payment return URLs)', () => {
    const sources = files(join(ROOT, 'src/server'), (p) => p.endsWith('.ts')).map((p) => readFileSync(p, 'utf8'))
    const links = new Set<string>()
    const literal = (text: string) => text.replace(/\$\{[^}]+\}/g, 'x')
    for (const src of sources) {
      for (const m of src.matchAll(/link:\s*(['`])([^'`]*)\1/g)) links.add(literal(m[2]))
      for (const m of src.matchAll(/\$\{appUrl\(\)\}(\/[^`'"\s]*)/g)) links.add(literal(m[1]))
      if (/link:\s*bookingPath\(|bookingUrl\(/.test(src)) links.add(`${bookingPath('bkg_x')}&paid=1`)
    }
    expect(links.size).toBeGreaterThan(8)
    // Hosted pages (the dev payment simulator) open in a browser sheet, not through the Router.
    const hosted = (l: string) => WEB_ONLY_PAGES.includes(new URL(l, 'https://app.invalid').pathname)
    const unrouted = [...links].filter((l) => !hosted(l) && !matchAppRoute(l))
    expect(unrouted, 'add these to src/lib/app-routes.ts').toEqual([])
  })

  it('matches paths with params and the query keys a screen reads', () => {
    expect(matchAppRoute('/b/bkg_1?t=abc&paid=1&utm=x')).toMatchObject({ route: { screen: 'booking' }, params: { id: 'bkg_1' }, query: { t: 'abc', paid: '1' } })
    expect(matchAppRoute('https://vamoverse.app/offerings/new')?.route.screen).toBe('offeringNew')
    expect(matchAppRoute('/offerings/off_1')).toMatchObject({ route: { screen: 'offering' }, params: { id: 'off_1' } })
    expect(matchAppRoute('/settings')?.route.screen).toBe('settings')
    expect(matchAppRoute('/admin')?.route.target).toBe('safari')
    expect(matchAppRoute('/nope/1')).toBeNull()
    expect(matchAppRoute('/dev/simulate')).toBeNull()
  })
})
