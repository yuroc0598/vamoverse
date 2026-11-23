// Local Postgres without Docker: a persistent PGlite server on DEV_DB_PORT (default 5433).
//   npm run db:dev        then DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { mkdirSync } from 'fs'

async function main() {
  const port = Number(process.env.DEV_DB_PORT || 5433)
  mkdirSync('.data', { recursive: true })
  const pglite = await PGlite.create({ dataDir: '.data/pglite' })
  const server = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1', maxConnections: 20 })
  await server.start()
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/postgres`
  const { migrate } = await import('../src/server/migrate')
  const { closeDb } = await import('../src/server/db')
  const applied = await migrate()
  await closeDb()
  console.log(`Dev database ready at ${process.env.DATABASE_URL}${applied.length ? ` (applied ${applied.join(', ')})` : ''}`)
  const shutdown = async () => {
    await server.stop()
    await pglite.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
