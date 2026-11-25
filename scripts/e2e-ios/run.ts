// End-to-end check on the iOS Simulator, in the native app and in mobile Safari.
//
//   npm run test:ios                      mobile Safari (plus the Capacitor app when
//                                         IOS_WRAPPER_DISABLED=false)
//   npm run test:ios -- --only app        just the Capacitor app (needs IOS_WRAPPER_DISABLED=false)
//   npm run test:ios -- --build           rebuild and reinstall the app first
//
// It never touches your dev database or dev server: it starts a throwaway in-memory Postgres
// (PGlite) and its own `next dev` on separate ports, seeds demo data, and drives the
// simulator through its Web Inspector. Screenshots and logs go to e2e-results/<timestamp>/.
// Env: IOS_SIM_DEVICE (simulator name), E2E_PORT (default 3100), E2E_DB_PORT (default 5434).
import { mkdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { journeys } from './flows'
import { Inspector } from './inspector'
import { buildApp, pointAppAt, Simulator } from './simulator'
import { startStack } from './stack'
import { WRAPPER_DISABLED_MESSAGE, wrapperDisabled } from '../ios-wrapper'
import { Surface } from './surface'

const ROOT = resolve(__dirname, '../..')
const APP_ID = 'com.vamoverse.app'
const SAFARI_ID = 'com.apple.mobilesafari'
const PORT = Number(process.env.E2E_PORT || 3100)
const DB_PORT = Number(process.env.E2E_DB_PORT || 5434)
const BASE_URL = `http://localhost:${PORT}`

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
// The Capacitor wrapper is disabled by default (scripts/ios-wrapper.ts): then only mobile Safari
// runs here; the native app has its own suite (npm run test:ios-native).
const surfaces = (only ? [only] : wrapperDisabled() ? ['safari'] : ['app', 'safari']) as ('app' | 'safari')[]
if (surfaces.some((s) => s !== 'app' && s !== 'safari')) throw new Error('--only takes "app" or "safari"')
if (surfaces.includes('app') && wrapperDisabled()) throw new Error(WRAPPER_DISABLED_MESSAGE)

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = join(ROOT, 'e2e-results', stamp)
const log = (line: string) => console.log(line)

const cleanups: (() => Promise<void> | void)[] = []
async function cleanup(): Promise<void> {
  for (const fn of cleanups.reverse()) await Promise.resolve(fn()).catch(() => undefined)
  cleanups.length = 0
}
process.on('SIGINT', () => { void cleanup().then(() => process.exit(130)) })

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

  log(`iOS end-to-end run → ${relative(ROOT, OUT)}/`)
  const sim = await Simulator.ready()
  log(`  simulator: ${sim.name}`)
  log(`  database: fresh PGlite on :${DB_PORT}, migrated and seeded; server: next dev on :${PORT}`)
  // Compile the pages the journeys visit, so first visits in the simulator aren't slowed by it.
  const stack = await startStack({
    port: PORT, dbPort: DB_PORT, logDir: OUT,
    warm: ['/', '/today', '/s/x', '/b/x', '/dev/simulate?action=checkout&id=x', '/sessions/x', '/crew', '/settings/account', '/settings/family'],
  })
  cleanups.push(stack.stop)
  // Assertions query the same in-process database directly: PGlite serves one socket connection at a time.
  const db = stack.db

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
