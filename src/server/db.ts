// Postgres access. Server-only. Every module function takes a `Db` so the same code
// runs inside or outside a transaction; inside `tx`, only use the handle you are given.
import { Pool, types } from 'pg'

// Return numerics/bigints as numbers and DATE columns as 'YYYY-MM-DD' strings
// (the default Date conversion would shift calendar dates by the server timezone).
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))
types.setTypeParser(20, (v) => (v === null ? null : Number(v)))
types.setTypeParser(1082, (v) => v)

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
}

let pool: Pool | null = null

function sslOption() {
  if (process.env.PGSSL !== 'require') return undefined
  // Verify the server certificate. Supply the provider's CA when it is not publicly trusted.
  return process.env.PGSSL_CA ? { rejectUnauthorized: true, ca: process.env.PGSSL_CA } : { rejectUnauthorized: true }
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 5),
      ssl: sslOption(),
    })
  }
  return pool
}

export const db: Db = {
  async query(text, params) {
    const result = await getPool().query(text, params)
    return result.rows
  },
}

/** Runs `fn` in one transaction; rolls back on any error. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  const handle: Db = {
    async query(text, params) {
      const result = await client.query(text, params)
      return result.rows
    },
  }
  try {
    await client.query('BEGIN')
    const result = await fn(handle)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function maybeOne<T = Record<string, unknown>>(handle: Db, text: string, params?: unknown[]): Promise<T | null> {
  const rows = await handle.query<T>(text, params)
  return rows[0] ?? null
}

/**
 * Partial update: sets only the columns whose value is not `undefined` (null clears).
 * Table and column names come from code, never from input. Returns whether a row changed.
 */
export async function updateRow(handle: Db, table: string, id: string, columns: Record<string, unknown>): Promise<boolean> {
  const set = Object.entries(columns).filter(([, value]) => value !== undefined)
  if (!set.length) return false
  const rows = await handle.query(
    `UPDATE ${table} SET ${set.map(([column], i) => `${column} = $${i + 2}`).join(', ')}, updated_at = now()
     WHERE id = $1 RETURNING id`,
    [id, ...set.map(([, value]) => value)])
  return rows.length > 0
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
