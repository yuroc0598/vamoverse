import { db } from '@/server/db'

/** Empties every table (keeps the schema) so each test starts clean. */
export async function resetDb(): Promise<void> {
  const tables = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'`)
  if (tables.length) await db.query(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`)
}
