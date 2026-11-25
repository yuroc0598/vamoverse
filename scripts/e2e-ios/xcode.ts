// Building and testing the native app (ios-native/) with xcodebuild and swift.
import { execFile, spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const ROOT = resolve(__dirname, '../..')
const run = promisify(execFile)
export const NATIVE_APP_ID = 'com.vamoverse.app.dev'
const UI_TEST_TIMEOUT_MS = 5 * 60_000

/**
 * Xcode and SwiftPM run package manifests and Swift macros under `sandbox-exec`, which fails
 * inside an already-sandboxed process (some CI runners and agent shells). Set
 * VAMO_XCODE_SANDBOX=off there; normal terminals don't need it.
 */
const noSandbox = process.env.VAMO_XCODE_SANDBOX === 'off'
const sandboxArgs = noSandbox ? ['-IDEPackageSupportDisableManifestSandbox=YES', 'OTHER_SWIFT_FLAGS=$(inherited) -disable-sandbox'] : []

function projectArgs(udid: string, derivedData: string): string[] {
  return ['-project', 'ios-native/Vamoverse.xcodeproj', '-scheme', 'Vamoverse', '-configuration', 'Debug',
    '-destination', `id=${udid}`, '-derivedDataPath', derivedData, ...sandboxArgs]
}

/** Compiler errors from xcodebuild output, or its last lines. */
function summarize(output: string): string {
  const errors = [...new Set(output.split('\n').filter((l) => /error:|failed:|XCTAssert|Test Case .* failed/.test(l)).map((l) => l.trim()))]
  return (errors.length ? errors : output.trim().split('\n').slice(-15)).slice(0, 15).join('\n')
}

async function xcodebuild(args: string[]): Promise<void> {
  try {
    await run('xcodebuild', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 })
  } catch (error) {
    const out = error as { stdout?: string; stderr?: string }
    throw new Error(`xcodebuild ${args.at(-1)} failed:\n${summarize(`${out.stdout ?? ''}\n${out.stderr ?? ''}`)}`)
  }
}

/** Builds the app (and, with `forTesting`, the UI tests) for the simulator; returns the .app path. */
export async function buildNativeApp(udid: string, derivedData: string, forTesting = false): Promise<string> {
  await xcodebuild([...projectArgs(udid, derivedData), forTesting ? 'build-for-testing' : 'build'])
  return join(derivedData, 'Build/Products/Debug-iphonesimulator/Vamoverse.app')
}

/** Runs one XCUITest method (e.g. `Journeys/test01_PlayerSignsIn`) against an already built bundle. */
export async function runUITest(udid: string, derivedData: string, test: string, env: Record<string, string>, resultBundle: string): Promise<void> {
  const testEnv = Object.fromEntries(Object.entries(env).map(([k, v]) => [`TEST_RUNNER_${k}`, v]))
  return new Promise((done, fail) => {
    const child = spawn('xcodebuild', [
      ...projectArgs(udid, derivedData), '-only-testing', `VamoverseUITests/${test}`, '-resultBundlePath', resultBundle, 'test-without-building',
    ], { cwd: ROOT, env: { ...process.env, ...testEnv } })
    let output = ''
    let timedOut = false
    // A runner that never connects otherwise hangs for ~9 minutes before XCTest gives up.
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, UI_TEST_TIMEOUT_MS)
    child.stdout.on('data', (c: Buffer) => { output += c })
    child.stderr.on('data', (c: Buffer) => { output += c })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) return done()
      const hint = /failed to bless service hub|thwarted by sandboxing|hung before establishing connection/.test(output)
        ? 'The XCUITest runner could not connect to the simulator. This happens inside sandboxed shells (agent sandboxes, some CI); run from a normal terminal.\n'
        : ''
      fail(new Error(`${timedOut ? `Timed out after ${UI_TEST_TIMEOUT_MS / 60000} minutes.\n` : ''}${hint}${summarize(output)}`))
    })
  })
}

/** `swift test` for VamoKit; `env` can point the fixture tests at a fresh recording. */
export async function swiftTest(env: Record<string, string> = {}, filter?: string): Promise<string> {
  const args = ['test', '--package-path', 'ios-native/VamoKit', ...(noSandbox ? ['--disable-sandbox'] : []), ...(filter ? ['--filter', filter] : [])]
  try {
    const { stdout } = await run('swift', args, { cwd: ROOT, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 })
    return stdout.split('\n').filter((l) => /Test run with/.test(l)).pop() ?? 'passed'
  } catch (error) {
    const out = error as { stdout?: string; stderr?: string }
    throw new Error(`swift test failed:\n${summarize(`${out.stdout ?? ''}\n${out.stderr ?? ''}`)}`)
  }
}
