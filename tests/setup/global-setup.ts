// Starts one Postgres for the whole test run and applies migrations.
// Uses TEST_DATABASE_URL when provided (CI runs real Postgres); otherwise an
// in-process PGlite server, so tests need no local installation.
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import type { AddressInfo } from 'net'

export default async function setup() {
  let stop = async () => {}
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  } else {
    const pglite = await PGlite.create()
    const server = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1' })
    await server.start()
    const { port } = (server as unknown as { server: { address(): AddressInfo } }).server.address()
    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/postgres`
    process.env.PG_POOL_MAX = '1'
    stop = async () => { await server.stop(); await pglite.close() }
  }
  const { migrate } = await import('../../src/server/migrate')
  const { closeDb } = await import('../../src/server/db')
  await migrate()
  await closeDb()
  return stop
}
