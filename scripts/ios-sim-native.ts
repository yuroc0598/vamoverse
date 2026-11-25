// One command to use the native SwiftUI app (ios-native/) on the iOS Simulator against your
// local dev server.
//
//   npm run ios:sim:native              start what's missing, build if needed, open the app
//   npm run ios:sim:native -- --build   rebuild and reinstall first (after Swift changes)
//   npm run ios:sim:native -- --as alex@demo.vamoverse.app   open signed in as someone (dev sign-in)
//
// Starts the dev database (seeding it the first time) and `next dev` on :3000 unless they're
// already running, boots a simulator, builds and installs "Vamoverse Dev" (com.vamoverse.app.dev)
// if needed, and launches it pointed at http://localhost:3000. It installs next to the Capacitor
// app (com.vamoverse.app), so both can be compared side by side.
// Env: IOS_SIM_DEVICE picks the simulator; VAMO_XCODE_SANDBOX=off inside sandboxed shells.
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { DEV_SERVER_URL, ensureDevServer, startedAnything, stopStarted } from './dev-stack'
import { Simulator } from './e2e-ios/simulator'
import { NATIVE_APP_ID, buildNativeApp } from './e2e-ios/xcode'

const ROOT = resolve(__dirname, '..')
const run = promisify(execFile)

async function main(): Promise<void> {
  const simReady = Simulator.ready()
  await ensureDevServer()

  const sim = await simReady
  console.log(`✓ simulator: ${sim.name}`)
  if (process.argv.includes('--build') || !(await sim.appPath(NATIVE_APP_ID))) {
    console.log('▶ building and installing the native app (xcodebuild, a minute or two the first time)')
    await sim.install(await buildNativeApp(sim.udid, join(ROOT, 'ios-native/build/sim')))
  }
  await sim.terminate(NATIVE_APP_ID)
  // Launch arguments land in UserDefaults' argument domain (AppConfig.baseURL reads VamoBaseURL).
  const as = process.argv.includes('--as') ? process.argv[process.argv.indexOf('--as') + 1] : null
  await run('xcrun', ['simctl', 'launch', sim.udid, NATIVE_APP_ID, '-VamoBaseURL', DEV_SERVER_URL, ...(as ? ['-VamoSignInAs', as] : [])])

  console.log(`\n✓ Vamoverse Dev (native) is open in the simulator, using ${DEV_SERVER_URL}`)
  console.log('  Sign in with any seeded email, e.g. maya@demo.vamoverse.app (player), alex@demo.vamoverse.app (coach), dave@demo.vamoverse.app (parent).')
  console.log('  After Swift changes: npm run ios:sim:native -- --build (or run the Vamoverse scheme from ios-native/Vamoverse.xcodeproj in Xcode).')
  if (startedAnything()) console.log('  Servers keep running here; press Ctrl-C to stop them.\n')
  else process.exit(0)
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`)
  stopStarted()
  process.exit(1)
})
