// A throwaway backend for end-to-end runs: an in-memory Postgres (PGlite), migrated and seeded,
// and its own `next dev`. It never touches your dev database or dev server. Used by the web-shell
// suite (test:ios), the native suite (test:ios-native), and the fixture recorder (--fresh).
import { spawn, type ChildProcess } from 'node:child_process'
import { openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const ROOT = resolve(__dirname, '../..')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Stack {
  baseUrl: string
  /** The run's database, in process: PGlite serves one socket connection, so assertions query it here. */
  db: PGlite
  stop(): Promise<void>
}

interface Options {
  port: number
  dbPort: number
  /** Where setup.log and server.log go. */
  logDir: string
  /** Pages to compile up front so first visits aren't slowed down. */
  warm?: string[]
}

export async function startStack({ port, dbPort, logDir, warm = [] }: Options): Promise<Stack> {
  const baseUrl = `http://localhost:${port}`
  const databaseUrl = `postgres://postgres@127.0.0.1:${dbPort}/postgres`
  const setupLog = openSync(join(logDir, 'setup.log'), 'a')
  const serverLog = openSync(join(logDir, 'server.log'), 'a')
  const stops: (() => Promise<void> | void)[] = []
  const stop = async () => {
    for (const fn of stops.reverse()) await Promise.resolve(fn()).catch(() => undefined)
    stops.length = 0
  }

  try {
    // PGlite serves one connection; everything in this run uses a pool of one (as .env.local does).
    const env = { ...process.env, DATABASE_URL: databaseUrl, PG_POOL_MAX: '1' }
    const runScript = (script: string) => new Promise<void>((done, fail) => {
      const child = spawn('npx', ['tsx', script], { cwd: ROOT, env, stdio: ['ignore', setupLog, setupLog] })
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${script} failed (see ${relative(ROOT, logDir)}/setup.log)`))))
    })

    const db = await PGlite.create()
    const server = new PGLiteSocketServer({ db, port: dbPort, host: '127.0.0.1', maxConnections: 20 })
    await server.start()
    stops.push(async () => { await server.stop(); await db.close() })
    await runScript('scripts/migrate.ts')
    await runScript('scripts/seed.ts')

    // next dev points next-env.d.ts at its build folder; put yours back afterwards. (tsconfig already
    // includes .next-e2e, so next dev leaves it alone; restoring it would undo edits made meanwhile.)
    for (const file of ['next-env.d.ts']) {
      const path = join(ROOT, file)
      const contents = readFileSync(path, 'utf8')
      stops.push(() => writeFileSync(path, contents))
    }
    const child: ChildProcess = spawn('npx', ['next', 'dev', '-p', String(port)], {
      cwd: ROOT, detached: true, stdio: ['ignore', serverLog, serverLog],
      env: { ...env, APP_URL: baseUrl, NEXT_PUBLIC_APP_URL: baseUrl, NEXT_DIST_DIR: '.next-e2e', PORT: String(port) },
    })
    stops.push(() => {
      if (child.pid) process.kill(-child.pid, 'SIGTERM')
      // Stopping next dev mid-write can leave a half-written generated validator.ts here, which
      // breaks `npm run typecheck` (tsconfig includes .next-e2e). It's regenerated on the next start.
      rmSync(join(ROOT, '.next-e2e/dev/types'), { recursive: true, force: true })
    })
    const deadline = Date.now() + 180_000
    while (!(await fetch(`${baseUrl}/login`).then((r) => r.ok, () => false))) {
      if (child.exitCode !== null) throw new Error(`next dev exited (see ${relative(ROOT, logDir)}/server.log)`)
      if (Date.now() > deadline) throw new Error('next dev did not answer within 3 minutes.')
      await sleep(1000)
    }
    for (const path of warm) await fetch(baseUrl + path, { redirect: 'manual' }).catch(() => undefined)
    return { baseUrl, db, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
