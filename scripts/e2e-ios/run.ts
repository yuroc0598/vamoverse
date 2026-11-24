// End-to-end check on the iOS Simulator, in the native app and in mobile Safari.
//
//   npm run test:ios                      both surfaces
//   npm run test:ios -- --only app        just the native app (or: --only safari)
//   npm run test:ios -- --build           rebuild and reinstall the app first
//
// It never touches your dev database or dev server: it starts a throwaway in-memory Postgres
// (PGlite) and its own `next dev` on separate ports, seeds demo data, and drives the
// simulator through its Web Inspector. Screenshots and logs go to e2e-results/<timestamp>/.
// Env: IOS_SIM_DEVICE (simulator name), E2E_PORT (default 3100), E2E_DB_PORT (default 5434).
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { journeys } from './flows'
import { Inspector } from './inspector'
import { buildApp, pointAppAt, Simulator } from './simulator'
import { Surface } from './surface'

const ROOT = resolve(__dirname, '../..')
const APP_ID = 'com.vamoverse.app'
const SAFARI_ID = 'com.apple.mobilesafari'
const PORT = Number(process.env.E2E_PORT || 3100)
const DB_PORT = Number(process.env.E2E_DB_PORT || 5434)
const BASE_URL = `http://localhost:${PORT}`
const DATABASE_URL = `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const surfaces = (only ? [only] : ['app', 'safari']) as ('app' | 'safari')[]
if (surfaces.some((s) => s !== 'app' && s !== 'safari')) throw new Error('--only takes "app" or "safari"')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = join(ROOT, 'e2e-results', stamp)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (line: string) => console.log(line)
// PGlite serves one connection; everything in this run uses a pool of one (as .env.local does).

const cleanups: (() => Promise<void> | void)[] = []
async function cleanup(): Promise<void> {
  for (const fn of cleanups.reverse()) await Promise.resolve(fn()).catch(() => undefined)
  cleanups.length = 0
}
process.on('SIGINT', () => { void cleanup().then(() => process.exit(130)) })

function runScript(script: string, logFile: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npx', ['tsx', script], { cwd: ROOT, env: { ...process.env, DATABASE_URL, PG_POOL_MAX: '1' }, stdio: ['ignore', logFile, logFile] })
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${script} failed (see ${relative(ROOT, OUT)}/setup.log)`))))
  })
}

async function startDatabase(logFile: number): Promise<PGlite> {
  const pglite = await PGlite.create()
  const server = new PGLiteSocketServer({ db: pglite, port: DB_PORT, host: '127.0.0.1', maxConnections: 20 })
  await server.start()
  cleanups.push(async () => { await server.stop(); await pglite.close() })
  await runScript('scripts/migrate.ts', logFile)
  await runScript('scripts/seed.ts', logFile)
  return pglite
}

async function startServer(logFile: number): Promise<void> {
  // next dev points next-env.d.ts at its own build folder; put yours back afterwards.
  const nextEnv = join(ROOT, 'next-env.d.ts')
  const nextEnvContents = readFileSync(nextEnv, 'utf8')
  cleanups.push(() => writeFileSync(nextEnv, nextEnvContents))
  const env = { ...process.env, DATABASE_URL, PG_POOL_MAX: '1', APP_URL: BASE_URL, NEXT_PUBLIC_APP_URL: BASE_URL, NEXT_DIST_DIR: '.next-e2e', PORT: String(PORT) }
  const child: ChildProcess = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, env, detached: true, stdio: ['ignore', logFile, logFile] })
  cleanups.push(() => { if (child.pid) process.kill(-child.pid, 'SIGTERM') })
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited (see ${relative(ROOT, OUT)}/server.log)`)
    if (await fetch(`${BASE_URL}/login`).then((r) => r.ok, () => false)) break
    await sleep(1000)
  }
  // Compile the pages the journeys visit, so first visits in the simulator aren't slowed by it.
  for (const path of ['/', '/today', '/s/x', '/b/x', '/dev/simulate?action=checkout&id=x', '/sessions/x', '/crew', '/settings/account', '/settings/family']) {
    await fetch(BASE_URL + path, { redirect: 'manual' }).catch(() => undefined)
  }
}

async function openSurface(name: 'app' | 'safari', sim: Simulator, inspector: Inspector): Promise<Surface> {
  if (name === 'safari') {
    await sim.openUrl(`${BASE_URL}/login`)
  } else {
    let appPath = args.includes('--build') ? null : await sim.appPath(APP_ID)
    if (!appPath) {
      log('  building the iOS app (xcodebuild)…')
      await sim.install(await buildApp(ROOT, sim, BASE_URL))
      appPath = await sim.appPath(APP_ID)
      if (!appPath) throw new Error('The app did not install.')
    }
    const restore = pointAppAt(appPath, BASE_URL)
    cleanups.push(async () => { restore(); await sim.terminate(APP_ID) })
    await sim.relaunch(APP_ID)
  }
  const surface = new Surface(name, sim, inspector, BASE_URL, name === 'app' ? APP_ID : SAFARI_ID)
  await surface.attach()
  return surface
}

interface Result { surface: string; step: string; ok: boolean; seconds: number; detail: string; screenshot: string }

async function main(): Promise<number> {
  mkdirSync(OUT, { recursive: true })
  const setupLog = openSync(join(OUT, 'setup.log'), 'a')
  const serverLog = openSync(join(OUT, 'server.log'), 'a')

  log(`iOS end-to-end run → ${relative(ROOT, OUT)}/`)
  const sim = await Simulator.ready()
  log(`  simulator: ${sim.name}`)
  log(`  database: fresh PGlite on :${DB_PORT}, migrated and seeded`)
  // Assertions query the same in-process database directly: PGlite serves one socket connection at a time.
  const db = await startDatabase(setupLog)
  log(`  server: next dev on :${PORT}`)
  await startServer(serverLog)

  const inspector = await Inspector.connect(sim.inspectorSocket)
  cleanups.push(() => inspector.close())

  const results: Result[] = []
  for (const name of surfaces) {
    log(`\n▶ ${name === 'app' ? 'Native app' : 'Mobile Safari'}`)
    let ui: Surface
    try {
      ui = await openSurface(name, sim, inspector)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      log(`  ✗ could not open: ${detail}`)
      results.push({ surface: name, step: 'Open', ok: false, seconds: 0, detail, screenshot: '' })
      continue
    }
    let blocked = false
    for (const [i, step] of journeys({ ui, db }).entries()) {
      const screenshot = join(OUT, `${name}-${String(i + 1).padStart(2, '0')}.png`)
      if (blocked) {
        results.push({ surface: name, step: step.name, ok: false, seconds: 0, detail: 'skipped after an earlier failure', screenshot: '' })
        log(`  - ${step.name} (skipped)`)
        continue
      }
      const started = Date.now()
      try {
        const detail = (await step.run()) || ''
        const seconds = (Date.now() - started) / 1000
        await sim.screenshot(screenshot)
        results.push({ surface: name, step: step.name, ok: true, seconds, detail, screenshot })
        log(`  ✓ ${step.name} (${seconds.toFixed(1)}s)${detail ? ` — ${detail}` : ''}`)
      } catch (error) {
        const seconds = (Date.now() - started) / 1000
        const detail = error instanceof Error ? error.message : String(error)
        await sim.screenshot(screenshot)
        results.push({ surface: name, step: step.name, ok: false, seconds, detail, screenshot })
        log(`  ✗ ${step.name} (${seconds.toFixed(1)}s)\n      ${detail}\n      screenshot: ${relative(ROOT, screenshot)}`)
        blocked = true
      }
    }
    ui.close()
  }

  const failed = results.filter((r) => !r.ok)
  log(`\n${failed.length ? '✗' : '✓'} ${results.length - failed.length}/${results.length} steps passed. Screenshots and logs: ${relative(ROOT, OUT)}/`)
  return failed.length ? 1 : 0
}

main()
  .then(async (code) => { await cleanup(); process.exit(code) })
  .catch(async (error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : error}`)
    await cleanup()
    process.exit(1)
  })
