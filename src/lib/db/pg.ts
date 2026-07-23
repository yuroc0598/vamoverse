// Lazy Postgres pool. Server-only — never import from a client component.
// The pool is created on first use and reused across requests within an instance.
import { Pool } from 'pg'

let pool: Pool | null = null

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — Postgres repository is unavailable')
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
      ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
    })
  }
  return pool
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await getPool().query(text, params)
  return res.rows as T[]
}

/** Run a function inside a single transaction, rolling back on error. */
export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw e
  } finally {
    client.release()
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
