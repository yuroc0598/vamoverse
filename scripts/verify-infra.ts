/**
 * Standalone integration check for the real Postgres + Redis path, exercised
 * through the actual repository / KV code (not raw SQL). Not part of the vitest
 * suite because it requires live services.
 *
 * Usage:
 *   DATABASE_URL=postgres://postgres:test@localhost:55432/postgres \
 *   REDIS_URL=redis://localhost:56379 \
 *   npx tsx scripts/verify-infra.ts
 */
import { getRepository } from '@/lib/db/repository'
import { query, closePool } from '@/lib/db/pg'
import { getKv } from '@/lib/cache/kv'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
    throw new Error(msg)
  }
  console.log('OK  :', msg)
}

async function main() {
  const CAP = 3
  const N = 15
  const eid = 'evt_vs'
  const oid = 'occ_vs'

  await query(`INSERT INTO users(id,email,role,display_name,gender) VALUES ('coach_vs','cvs@x.com','coach','C','M') ON CONFLICT (id) DO NOTHING`)
  await query(
    `INSERT INTO users(id,email,role,display_name,gender)
     SELECT 'vs'||g, 'vs'||g||'@x.com','student','VS'||g,'M' FROM generate_series(1,$1) g
     ON CONFLICT (id) DO NOTHING`, [N])
  await query(
    `INSERT INTO events(id,coach_id,title,discipline,type,capacity,price_cents)
     VALUES ($1,'coach_vs','Race','open_singles','private',$2,0) ON CONFLICT (id) DO NOTHING`, [eid, CAP])
  await query(
    `INSERT INTO event_occurrences(id,event_id,occurrence_start_at,occurrence_end_at)
     VALUES ($1,$2, now()+interval '1 day', now()+interval '1 day 1 hour') ON CONFLICT (id) DO NOTHING`, [oid, eid])
  // Fresh run each time
  await query(`DELETE FROM registrations WHERE occurrence_id=$1`, [oid])

  const repo = await getRepository()
  assert(repo.kind === 'postgres', `repository backend is postgres (got ${repo.kind})`)

  // Fire N concurrent registrations at capacity CAP.
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => repo.registerForOccurrence(oid, `vs${i + 1}`, eid))
  )
  const registered = results.filter((r) => r.status === 'registered').length
  const waitlisted = results.filter((r) => r.status === 'waitlisted').length
  console.log(`   -> ${registered} registered, ${waitlisted} waitlisted (capacity ${CAP}, ${N} concurrent)`)
  assert(registered === CAP, `exactly ${CAP} registered under concurrency (no overbooking)`)
  assert(waitlisted === N - CAP, `the rest (${N - CAP}) waitlisted`)

  // Idempotency: re-register an already-registered student.
  const first = results.find((r) => r.status === 'registered')!
  const again = await repo.registerForOccurrence(oid, 'vs1', eid)
  const counts = await repo.getOccurrenceCounts(oid)
  assert(counts.registered === CAP, `re-registration did not add a spot (still ${CAP})`)
  assert(again.status === 'registered', 're-registration returns registered (idempotent)')
  void first

  // KV / Redis
  const kv = getKv()
  assert(kv.kind === 'redis', `KV backend is redis (got ${kv.kind})`)
  const c1 = await kv.incrWithTtl('vs:rl', 60)
  const c2 = await kv.incrWithTtl('vs:rl', 60)
  assert(c2 === c1 + 1, `incrWithTtl increments across calls (${c1} -> ${c2})`)
  const nxKey = `vs:nx:${Date.now()}`
  const nx1 = await kv.setNx(nxKey, 60)
  const nx2 = await kv.setNx(nxKey, 60)
  assert(nx1 === true && nx2 === false, 'setNx: first true, replay false (dedup works)')

  await closePool()
  console.log('\nAll infra checks passed.')
  process.exit(process.exitCode || 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
