// One command to use the app on the iOS Simulator against your local dev server.
//
//   npm run ios:sim              start what's missing, then open the app in the simulator
//   npm run ios:sim -- --build   rebuild and reinstall the app first (after native changes)
//
// Starts the dev database (seeding it the first time) and `next dev` on :3000 unless they're
// already running, boots a simulator, builds and installs the app if needed, points it at
// http://localhost:3000, and launches it. Servers it started keep running until Ctrl-C.
// Env: IOS_SIM_DEVICE picks the simulator by name.
// This is the Capacitor web shell in ios/, which is disabled by default (IOS_WRAPPER_DISABLED, see
// scripts/ios-wrapper.ts): then it runs the native app (`npm run ios:sim:native`) instead.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { DEV_SERVER_URL as SERVER_URL, ensureDevServer, startedAnything, stopStarted } from './dev-stack'
import { wrapperDisabled } from './ios-wrapper'
import { buildApp, pointAppAt, Simulator } from './e2e-ios/simulator'

const ROOT = resolve(__dirname, '..')
const APP_ID = 'com.vamoverse.app'

async function main(): Promise<void> {
  if (wrapperDisabled()) {
    // The wrapper is retired (IOS_WRAPPER_DISABLED): run the native app instead, same arguments.
    console.log('The Capacitor wrapper is disabled; opening the native app (npm run ios:sim:native).')
    const result = spawnSync('npx', ['tsx', 'scripts/ios-sim-native.ts', ...process.argv.slice(2)], { cwd: ROOT, stdio: 'inherit' })
    process.exit(result.status ?? 1)
  }
  const simReady = Simulator.ready()
  await ensureDevServer()

  const sim = await simReady
  console.log(`✓ simulator: ${sim.name}`)
  let appPath = process.argv.includes('--build') ? null : await sim.appPath(APP_ID)
  if (!appPath) {
    console.log('▶ building and installing the app (xcodebuild, a few minutes the first time)')
    await sim.install(await buildApp(ROOT, sim, SERVER_URL))
    appPath = await sim.appPath(APP_ID)
    if (!appPath) throw new Error('The app did not install.')
  }
  pointAppAt(appPath, SERVER_URL)
  await sim.relaunch(APP_ID)

  console.log(`\n✓ Vamoverse is open in the simulator, loading ${SERVER_URL}`)
  console.log('  Sign in with any seeded email, e.g. maya@demo.vamoverse.app (player), alex@demo.vamoverse.app (coach), dave@demo.vamoverse.app (parent).')
  console.log('  Web changes: close and reopen the app. Web Inspector: Safari > Develop > Simulator > Vamoverse.')
  if (startedAnything()) console.log('  Servers keep running here; press Ctrl-C to stop them.\n')
  else process.exit(0)
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`)
  stopStarted()
  process.exit(1)
})
