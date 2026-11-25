// Starts what's missing of the local dev setup (database on :5433, `next dev` on :3000), for the
// one-command simulator scripts (ios:sim, ios:sim:native). Processes it starts keep running until
// Ctrl-C; ones that were already running are left alone.
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
export const DEV_SERVER_URL = 'http://localhost:3000'
const DB_PORT = Number(process.env.DEV_DB_PORT || 5433)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const children: ChildProcess[] = []

/** True when this script started a server that's still running (keep the process alive). */
export const startedAnything = () => children.length > 0

export function stopStarted(): void {
  for (const child of children.reverse()) if (child.pid && child.exitCode === null) process.kill(-child.pid, 'SIGTERM')
}
process.on('SIGINT', () => { stopStarted(); process.exit(0) })
process.on('SIGTERM', () => { stopStarted(); process.exit(0) })

function listening(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.once('connect', () => { socket.destroy(); done(true) })
    socket.once('error', () => done(false))
  })
}

const serverUp = () => fetch(`${DEV_SERVER_URL}/login`).then((r) => r.ok, () => false)

/** Starts a long-running npm script, prefixing its output; resolves once `ready` matches. */
function start(label: string, script: string, ready: RegExp): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn('npm', ['run', '--silent', script], { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    let isReady = false
    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      for (const line of text.split('\n')) if (line.trim()) console.log(`[${label}] ${line}`)
      if (!isReady && ready.test(text)) { isReady = true; done() }
    }
    child.stdout!.on('data', onData)
    child.stderr!.on('data', onData)
    child.on('exit', (code) => {
      if (!isReady) fail(new Error(`npm run ${script} exited with code ${code}`))
    })
  })
}

function runOnce(script: string): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn('npm', ['run', '--silent', script], { cwd: ROOT, stdio: 'inherit' })
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`npm run ${script} failed`))))
  })
}

/** Ensures the dev database (seeded the first time) and dev server are up. */
export async function ensureDevServer(): Promise<void> {
  if (await listening(DB_PORT)) {
    console.log(`✓ dev database already running on :${DB_PORT}`)
    // It may have started before newer migrations existed (db:dev applies them only at startup).
    await runOnce('db:migrate')
  } else {
    console.log(`▶ starting the dev database on :${DB_PORT}`)
    await start('db', 'db:dev', /Dev database ready/)
    await runOnce('db:seed') // skips if the database already has data
  }

  if (await serverUp()) {
    console.log(`✓ dev server already running at ${DEV_SERVER_URL}`)
  } else {
    console.log(`▶ starting the dev server at ${DEV_SERVER_URL}`)
    await start('web', 'dev', /Ready|Local:/)
    const deadline = Date.now() + 120_000
    while (!(await serverUp())) {
      if (Date.now() > deadline) throw new Error('The dev server did not answer within 2 minutes.')
      await sleep(1000)
    }
  }
}
