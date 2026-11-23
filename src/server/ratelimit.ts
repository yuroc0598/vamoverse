// Fixed-window rate limiting stored in Postgres (no extra infrastructure).
import type { Db } from './db'
import { fail } from './errors'

export async function consume(db: Db, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowSeconds],
  )
  return rows[0].count <= limit
}

export async function enforceRateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<void> {
  if (!(await consume(db, key, limit, windowSeconds))) throw fail.rateLimited()
}

export async function pruneRateLimits(db: Db): Promise<void> {
  await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`)
}
