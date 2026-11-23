// Applies db/migrations/*.sql in order, once each, recording them in schema_migrations.
import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { db, tx } from './db'

export async function migrate(dir = path.join(process.cwd(), 'db', 'migrations')): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const applied = new Set((await db.query<{ version: string }>('SELECT version FROM schema_migrations')).map((r) => r.version))
  const pending = readdirSync(dir).filter((f) => f.endsWith('.sql') && !applied.has(f)).sort()
  for (const file of pending) {
    const sql = readFileSync(path.join(dir, file), 'utf8')
    await tx(async (t) => {
      await t.query(sql)
      await t.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file])
    })
  }
  return pending
}
