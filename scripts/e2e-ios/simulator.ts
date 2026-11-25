// iOS Simulator control through `xcrun simctl`.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

async function simctl(...args: string[]): Promise<string> {
  const { stdout } = await run('xcrun', ['simctl', ...args], { maxBuffer: 16 * 1024 * 1024 })
  return stdout.trim()
}

interface Device { udid: string; name: string; state: string; isAvailable: boolean }

/**
 * Shows the simulator window (the tests run either way). Opened by path inside the selected
 * Xcode: renamed or side-by-side installs leave the app unregistered by name, and Xcode 27 moved
 * the simulator window from Simulator.app into DeviceHub.app.
 */
async function openSimulatorWindow(): Promise<void> {
  const developerDir = (await run('xcode-select', ['-p']).catch(() => ({ stdout: '' }))).stdout.trim()
  const candidates = [
    join(developerDir, 'Applications/Simulator.app'),
    join(developerDir, '../Applications/DeviceHub.app'),
  ].filter((app) => existsSync(app))
  for (const app of candidates) if (await run('open', [app]).then(() => true, () => false)) return
  await run('open', ['-a', 'Simulator']).catch(() => undefined)
}

export class Simulator {
  private constructor(readonly udid: string, readonly name: string, readonly inspectorSocket: string) {}

  /** The booted iPhone simulator, booting one if needed (IOS_SIM_DEVICE picks it by name). */
  static async ready(preferred = process.env.IOS_SIM_DEVICE): Promise<Simulator> {
    const runtimes = JSON.parse(await simctl('list', 'devices', 'available', '-j')).devices as Record<string, Device[]>
    const iphones = Object.values(runtimes).flat().filter((d) => d.isAvailable && d.name.startsWith('iPhone'))
    let device = iphones.find((d) => d.state === 'Booted' && (!preferred || d.name === preferred))
    if (!device) {
      device = iphones.find((d) => (preferred ? d.name === preferred : true))
      if (!device) throw new Error(preferred ? `No available simulator named "${preferred}".` : 'No iPhone simulator is installed (Xcode > Settings > Platforms).')
      await simctl('boot', device.udid)
      await simctl('bootstatus', device.udid)
    }
    await openSimulatorWindow()
    const socket = await simctl('getenv', device.udid, 'RWI_LISTEN_SOCKET')
    if (!socket) throw new Error('Could not find the simulator\'s Web Inspector socket.')
    return new Simulator(device.udid, device.name, socket)
  }

  openUrl(url: string): Promise<string> {
    return simctl('openurl', this.udid, url)
  }

  async screenshot(path: string): Promise<void> {
    await simctl('io', this.udid, 'screenshot', path).catch(() => undefined)
  }

  async appPath(bundleId: string): Promise<string | null> {
    return simctl('get_app_container', this.udid, bundleId, 'app').catch(() => null)
  }

  async install(appPath: string): Promise<void> {
    await simctl('install', this.udid, appPath)
  }

  async relaunch(bundleId: string): Promise<void> {
    await simctl('terminate', this.udid, bundleId).catch(() => undefined)
    await simctl('launch', this.udid, bundleId)
  }

  async terminate(bundleId: string): Promise<void> {
    await simctl('terminate', this.udid, bundleId).catch(() => undefined)
  }
}

/**
 * Points an installed Capacitor app at `serverUrl` by editing the capacitor.config.json in
 * its bundle (simulator builds aren't signature-checked). Returns a function that restores it.
 */
export function pointAppAt(appPath: string, serverUrl: string): () => void {
  const file = join(appPath, 'capacitor.config.json')
  if (!existsSync(file)) throw new Error(`${file} is missing; rebuild the app with --build.`)
  const original = readFileSync(file, 'utf8')
  const config = JSON.parse(original)
  config.server = { ...config.server, url: serverUrl, cleartext: true, allowNavigation: [new URL(serverUrl).hostname] }
  writeFileSync(file, JSON.stringify(config, null, '\t'))
  return () => writeFileSync(file, original)
}

/** Builds the iOS app for the simulator and returns the .app path. */
export async function buildApp(root: string, sim: Simulator, serverUrl: string): Promise<string> {
  // The bundled server URL doesn't matter (pointAppAt rewrites it after install), so an
  // existing generated config is left alone.
  const wrapper = join(root, 'ios-wrapper')
  if (!existsSync(join(wrapper, 'ios/App/App/capacitor.config.json'))) {
    await run('npx', ['cap', 'copy', 'ios'], { cwd: wrapper, env: { ...process.env, CAPACITOR_ALLOW_LIVERELOAD: 'true', CAPACITOR_DEV_URL: serverUrl } })
  }
  const derived = join(wrapper, 'ios/App/build/e2e')
  await run('xcodebuild', [
    '-workspace', 'ios-wrapper/ios/App/App.xcworkspace', '-scheme', 'App', '-configuration', 'Debug',
    '-destination', `id=${sim.udid}`, '-derivedDataPath', derived, 'build',
  ], { cwd: root, maxBuffer: 256 * 1024 * 1024 })
  return join(derived, 'Build/Products/Debug-iphonesimulator/App.app')
}
