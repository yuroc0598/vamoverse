// End-to-end check of the native SwiftUI app (ios-native/) on the iOS Simulator.
//
//   npm run test:ios-native
//
// Like test:ios, it never touches your dev database or server: it starts a throwaway seeded
// backend (PGlite + next dev), then
//   1. records fresh command fixtures and runs VamoKit's fixture tests on them (server output drift),
//   2. checks every input the app encodes against the server's zod schemas (input drift),
//   3. builds the app and its UI tests once,
//   4. runs each journey step as one XCUITest method and checks the database after it.
// Results, xcresult bundles, and screenshots go to e2e-results/native-<timestamp>/.
// Env: IOS_SIM_DEVICE, E2E_NATIVE_PORT (default 3101), E2E_NATIVE_DB_PORT (default 5435),
// VAMO_XCODE_SANDBOX=off inside sandboxed shells (see xcode.ts).
import { mkdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { checkNativeInputs } from '../check-native-inputs'
import { recordFixtures } from '../record-fixtures'
import { nativeJourneys } from './native-flows'
import { Simulator } from './simulator'
import { startStack, type Stack } from './stack'
import { NATIVE_APP_ID, buildNativeApp, runUITest, swiftTest } from './xcode'

const ROOT = resolve(__dirname, '../..')
const PORT = Number(process.env.E2E_NATIVE_PORT || 3101)
const DB_PORT = Number(process.env.E2E_NATIVE_DB_PORT || 5435)
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = join(ROOT, 'e2e-results', `native-${stamp}`)
const DERIVED = join(ROOT, 'ios-native/build/e2e')
const log = (line: string) => console.log(line)
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`

let stack: Stack | null = null
process.on('SIGINT', () => { void stack?.stop().then(() => process.exit(130)) })

async function main(): Promise<number> {
  mkdirSync(OUT, { recursive: true })
  log(`Native iOS end-to-end run → ${relative(ROOT, OUT)}/`)
  const simReady = Simulator.ready()
  log(`  backend: fresh PGlite on :${DB_PORT}, migrated and seeded; next dev on :${PORT}`)
  stack = await startStack({ port: PORT, dbPort: DB_PORT, logDir: OUT })
  const sim = await simReady
  log(`  simulator: ${sim.name}`)

  let started = Date.now()
  const fixtures = join(OUT, 'fixtures')
  const count = await recordFixtures(stack.baseUrl, fixtures, () => undefined)
  log(`  fixtures: recorded ${count}; VamoKit on them: ${await swiftTest({ VAMO_FIXTURES_DIR: fixtures }, 'FixtureTests')} (${seconds(started)})`)

  started = Date.now()
  const inputs = await checkNativeInputs()
  if (inputs.failures.length) throw new Error(`Native inputs rejected by the server's schemas:\n  ${inputs.failures.join('\n  ')}`)
  log(`  inputs: ${inputs.checked} native command inputs match the server's schemas (${seconds(started)})`)

  started = Date.now()
  log('  building the app and UI tests (xcodebuild build-for-testing)…')
  await buildNativeApp(sim.udid, DERIVED, true)
  log(`  built (${seconds(started)})`)

  const shared = {}
  let passed = 0
  let failed = 0
  let blocked = false
  log('\n▶ Native app (SwiftUI)')
  for (const [i, step] of nativeJourneys.entries()) {
    const n = String(i + 1).padStart(2, '0')
    if (!step.test) { log(`  · ${step.name} (not built yet)`); continue }
    if (blocked) { log(`  - ${step.name} (skipped after an earlier failure)`); failed++; continue }
    const stepStarted = Date.now()
    const screenshot = join(OUT, `native-${n}.png`)
    try {
      const env = { VAMO_BASE_URL: stack.baseUrl, ...(await step.prepare?.(stack.db, shared)) }
      await runUITest(sim.udid, DERIVED, step.test, env, join(OUT, `native-${n}.xcresult`))
      const detail = (await step.check?.(stack.db, shared)) || ''
      await sim.screenshot(screenshot)
      log(`  ✓ ${step.name} (${seconds(stepStarted)})${detail ? ` — ${detail}` : ''}`)
      passed++
    } catch (error) {
      await sim.screenshot(screenshot)
      await sim.terminate('com.vamoverse.app.uitests.xctrunner')
      log(`  ✗ ${step.name} (${seconds(stepStarted)})\n      ${String(error instanceof Error ? error.message : error).replace(/\n/g, '\n      ')}\n      screenshot: ${relative(ROOT, screenshot)}`)
      failed++
      blocked = true
    }
  }
  await sim.terminate(NATIVE_APP_ID)

  const pending = nativeJourneys.filter((s) => !s.test).length
  log(`\n${failed ? '✗' : '✓'} ${passed}/${passed + failed} native steps passed${pending ? `; ${pending} of ${nativeJourneys.length} journeys not built yet` : ''}. Results: ${relative(ROOT, OUT)}/`)
  return failed ? 1 : 0
}

main()
  .then(async (code) => { await stack?.stop(); process.exit(code) })
  .catch(async (error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : error}`)
    await stack?.stop()
    process.exit(1)
  })
