import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/lib/auth/actor'
import { hasDatabase, query } from '@/lib/db/pg'

const ratingsSchema = z.object({
  utrSingles: z.number().min(1).max(16.5),
  utrDoubles: z.number().min(1).max(16.5),
  ntrp: z.number().min(1).max(7),
})

export async function GET(req: NextRequest) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isMockMode) return NextResponse.json({ demo: true, persisted: false })
  if (!hasDatabase()) return NextResponse.json({ error: 'Profile database is not configured' }, { status: 503 })

  const rows = await query(
    `SELECT id, utr_singles, utr_doubles, ntrp,
            utr_player_id, utr_account_name, utr_account_claimed, utr_account_checked_at
       FROM users WHERE id=$1`,
    [actor.id]
  )
  if (!rows.length) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  return NextResponse.json({ profile: rows[0], persisted: true })
}

export async function PATCH(req: NextRequest) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isMockMode) return NextResponse.json({ demo: true, persisted: false })
  if (!hasDatabase()) return NextResponse.json({ error: 'Profile database is not configured' }, { status: 503 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = ratingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ratings', details: parsed.error.flatten() }, { status: 400 })

  const rows = await query(
    `UPDATE users SET utr_singles=$2, utr_doubles=$3, ntrp=$4
     WHERE id=$1 RETURNING id, utr_singles, utr_doubles, ntrp`,
    [actor.id, parsed.data.utrSingles, parsed.data.utrDoubles, parsed.data.ntrp]
  )
  if (!rows.length) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  return NextResponse.json({ profile: rows[0], persisted: true })
}
