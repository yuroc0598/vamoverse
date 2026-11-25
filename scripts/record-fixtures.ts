// Records real command responses from a seeded dev server as decoding fixtures for the native
// app's VamoKit tests. Only read commands are called; nothing is changed on the server.
//
//   npm run ios:fixtures -- --fresh            throwaway seeded backend (stable data; use this)
//   npm run ios:fixtures                       your dev server at http://localhost:3000
//   npm run ios:fixtures -- --base-url http://localhost:3100 --out /tmp/fixtures
//
// Each file is the exact response body (`{ data }` or `{ error }`), named <command>.<who>.json.
// The server must be in dev auth mode (no Supabase) with `npm run db:seed` data. test:ios-native
// also records into its results folder and runs the VamoKit fixture tests on that recording.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { startStack } from './e2e-ios/stack'

const ROOT = resolve(__dirname, '..')

/** Seeded demo accounts (scripts/seed.ts). */
const PEOPLE = { coach: 'alex@demo.vamoverse.app', hitter: 'sam@demo.vamoverse.app', player: 'maya@demo.vamoverse.app', parent: 'dave@demo.vamoverse.app' }
type Who = keyof typeof PEOPLE | 'guest'

interface Response { status: number; body: { data?: unknown; error?: { code: string; message: string } } }

/** The first `key` found on the first item of an array (or of `data[field]`). */
function firstId(data: unknown, key: string, field?: string): string | undefined {
  const list = field ? (data as Record<string, unknown> | undefined)?.[field] : data
  return Array.isArray(list) ? (list.find((item) => item && typeof item === 'object' && key in item)?.[key] as string | undefined) : undefined
}

/** Records every fixture from `baseUrl` into `out` (replacing its .json files); returns how many. */
export async function recordFixtures(baseUrl: string, out: string, log: (line: string) => void = console.log): Promise<number> {
  const BASE_URL = baseUrl.replace(/\/$/, '')
  const OUT = out
  let written = 0

  async function signIn(email: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const text = await res.text()
    let body: { data?: { token?: string }; error?: { message: string } } = {}
    try { body = JSON.parse(text) } catch { /* an HTML error page; reported below with the status */ }
    if (!body.data?.token) throw new Error(`Dev sign-in failed for ${email}: ${body.error?.message ?? res.status}. Is the server in dev auth mode?`)
    return body.data.token
  }

  async function record(who: Who, token: string | null, name: string, input: Record<string, unknown> = {}, suffix = ''): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(`${BASE_URL}/api/commands/${name}`, { method: 'POST', headers, body: JSON.stringify(input) })
    const body = JSON.parse(await res.text()) as Response['body']
    writeFileSync(join(OUT, `${name}.${who}${suffix}.json`), `${JSON.stringify(body, null, 2)}\n`)
    written++
    if (body.error && !suffix.startsWith('.error')) log(`  ! ${name} as ${who}: ${res.status} ${body.error.message}`)
    return { status: res.status, body }
  }

  if (!(await fetch(`${BASE_URL}/login`).then((r) => r.ok, () => false))) throw new Error(`No server at ${BASE_URL}. Start one with npm run dev (after db:dev and db:seed).`)
  mkdirSync(OUT, { recursive: true })
  for (const file of readdirSync(OUT)) if (file.endsWith('.json')) rmSync(join(OUT, file))

  // One at a time: on a fresh `next dev`, parallel first requests can race the route's first
  // compile and get Next's HTML 404 page.
  const tokens = {} as Record<keyof typeof PEOPLE, string>
  for (const [who, email] of Object.entries(PEOPLE) as [keyof typeof PEOPLE, string][]) tokens[who] = await signIn(email)
  const everyone: [Who, string | null][] = [['guest', null], ...Object.entries(tokens) as [Who, string][]]

  // Signed in or not.
  for (const [who, token] of everyone) await record(who, token, 'account.me')
  await record('guest', null, 'account.get', {}, '.error-unauthorized')
  await record('player', tokens.player, 'sessions.list', {}, '.error-forbidden')
  await record('player', tokens.player, 'bookings.get', { bookingId: 'bkg_missing' }, '.error-not-found')
  await record('player', tokens.player, 'messages.start', {}, '.error-bad-request')

  // Every signed-in user.
  for (const who of ['coach', 'hitter', 'player', 'parent'] as const) {
    const token = tokens[who]
    for (const name of ['account.get', 'family.list', 'coaches.mine', 'credits.mine', 'payments.mine', 'notifications.list', 'assistant.history']) {
      await record(who, token, name)
    }
    const mine = await record(who, token, 'bookings.mine')
    const bookingId = firstId(mine.body.data, 'id') ?? firstId(mine.body.data, 'bookingId')
    if (bookingId) await record(who, token, 'bookings.get', { bookingId })
    const threads = await record(who, token, 'messages.threads')
    const threadId = firstId(threads.body.data, 'id') ?? firstId(threads.body.data, 'threadId')
    if (threadId) await record(who, token, 'messages.read', { threadId })
  }

  // Providers.
  for (const who of ['coach', 'hitter'] as const) {
    const token = tokens[who]
    const settings = (await record(who, token, 'provider.settings')).body.data as { slug?: string } | undefined
    for (const name of ['clients.list', 'clients.invites', 'courts.list', 'credits.sold', 'packages.list', 'plan.get', 'money.summary']) {
      await record(who, token, name)
    }
    const sessions = await record(who, token, 'sessions.list', { days: 14 })
    const sessionId = firstId(sessions.body.data, 'id')
    if (sessionId) {
      await record(who, token, 'sessions.get', { sessionId })
      await record(who, token, 'sessions.roster', { sessionId })
    }
    const offerings = await record(who, token, 'offerings.list')
    const offeringId = firstId(offerings.body.data, 'id')
    if (offeringId) await record(who, token, 'offerings.get', { offeringId })
    if (settings?.slug) {
      for (const name of ['provider.public', 'schedule.public', 'packages.public']) await record('guest', null, name, { slug: settings.slug }, `.${who}`)
    }
  }

  // Public discovery, and a public session as a guest and as a player.
  const found = await record('guest', null, 'find.sessions')
  await record('guest', null, 'find.providers')
  const publicSession = firstId(found.body.data, 'id') ?? firstId(found.body.data, 'id', 'sessions')
  if (publicSession) {
    await record('guest', null, 'sessions.view', { sessionId: publicSession })
    await record('player', tokens.player, 'sessions.view', { sessionId: publicSession })
  }

  log(`Recorded ${written} responses from ${BASE_URL} → ${relative(ROOT, OUT) || OUT}/`)
  return written
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const out = resolve(ROOT, flag('--out') ?? 'ios-native/VamoKit/Tests/VamoKitTests/Fixtures')
  if (!args.includes('--fresh')) {
    await recordFixtures(flag('--base-url') ?? process.env.FIXTURES_BASE_URL ?? 'http://localhost:3000', out)
    return
  }
  const logDir = mkdtempSync(join(tmpdir(), 'vamo-fixtures-'))
  console.log(`Starting a throwaway backend (logs in ${logDir})…`)
  const stack = await startStack({ port: Number(process.env.FIXTURES_PORT || 3102), dbPort: Number(process.env.FIXTURES_DB_PORT || 5436), logDir })
  try { await recordFixtures(stack.baseUrl, out) } finally { await stack.stop() }
}

if (require.main === module) {
  main().then(() => process.exit(0), (error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
