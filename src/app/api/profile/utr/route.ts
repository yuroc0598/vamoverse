// Link (POST) or unlink (DELETE) a UTR account on the caller's profile.
// Linking only confirms that a UTR account with the given ID and name exists;
// see src/lib/ratings/utr_lookup.ts for what that does and does not prove.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/lib/auth/actor'
import { getKv } from '@/lib/cache/kv'
import { hasDatabase, query } from '@/lib/db/pg'
import { logger } from '@/lib/logger'
import { lookupUtrAccount, parseUtrId, type UtrLookupResult } from '@/lib/ratings/utr_lookup'

const linkSchema = z.object({
  utrId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(2).max(120),
})

const UTR_LOOKUP_WINDOW_SECONDS = 60 * 60
const UTR_LOOKUP_MAX_PER_WINDOW = 10

async function withinLookupLimit(actorId: string): Promise<boolean> {
  try {
    const count = await getKv().incrWithTtl(`utr_lookup:rl:${actorId}`, UTR_LOOKUP_WINDOW_SECONDS)
    return count <= UTR_LOOKUP_MAX_PER_WINDOW
  } catch {
    return process.env.NODE_ENV !== 'production'
  }
}

function lookupFailure(result: Exclude<UtrLookupResult, { status: 'found' }>) {
  switch (result.status) {
    case 'name_mismatch':
      return NextResponse.json({
        status: result.status,
        error: 'That UTR ID belongs to an account with a different name. Enter your name exactly as it appears on UTR.',
      }, { status: 422 })
    case 'too_many_matches':
      return NextResponse.json({
        status: result.status,
        error: 'That name is too common for UTR to confirm automatically. Ask your coach to check your UTR profile.',
      }, { status: 422 })
    case 'not_found':
      return NextResponse.json({
        status: result.status,
        error: 'No UTR account matched that ID and name. Check both, and use your name exactly as it appears on UTR.',
      }, { status: 404 })
    case 'unavailable':
      return NextResponse.json({
        status: result.status,
        error: 'UTR lookup is unavailable right now. Try again later.',
      }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isMockMode && !hasDatabase()) {
    return NextResponse.json({ error: 'Profile database is not configured' }, { status: 503 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = linkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your UTR ID and your name as shown on UTR', details: parsed.error.flatten() }, { status: 400 })
  }
  const utrId = parseUtrId(parsed.data.utrId)
  if (!utrId) {
    return NextResponse.json({ error: 'Enter a numeric UTR ID or a utrsports.net profile link' }, { status: 400 })
  }

  if (!(await withinLookupLimit(actor.id))) {
    return NextResponse.json({ error: 'Too many UTR lookups. Try again in an hour.' }, { status: 429 })
  }

  if (!isMockMode) {
    const taken = await query<{ id: string }>(
      'SELECT id FROM users WHERE utr_player_id = $1 AND id <> $2', [utrId, actor.id],
    )
    if (taken.length) {
      return NextResponse.json({ error: 'That UTR account is already linked to another Vamoverse user.' }, { status: 409 })
    }
  }

  const result = await lookupUtrAccount({ utrId, name: parsed.data.name })
  logger.info('profile.utr_lookup', {
    actorId: actor.id,
    status: result.status,
    reason: result.status === 'unavailable' ? result.reason : undefined,
  })
  if (result.status !== 'found') return lookupFailure(result)

  if (isMockMode) {
    return NextResponse.json({ status: 'found', account: result.account, demo: true, persisted: false })
  }

  try {
    const rows = await query(
      `UPDATE users
          SET utr_player_id=$2, utr_account_name=$3, utr_account_claimed=$4, utr_account_checked_at=now()
        WHERE id=$1
        RETURNING utr_player_id, utr_account_name, utr_account_claimed, utr_account_checked_at`,
      [actor.id, result.account.id, result.account.displayName, result.account.claimed],
    )
    if (!rows.length) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    return NextResponse.json({ status: 'found', account: result.account, link: rows[0], persisted: true })
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'That UTR account is already linked to another Vamoverse user.' }, { status: 409 })
    }
    throw error
  }
}

export async function DELETE(req: NextRequest) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isMockMode) return NextResponse.json({ demo: true, persisted: false })
  if (!hasDatabase()) return NextResponse.json({ error: 'Profile database is not configured' }, { status: 503 })

  await query(
    `UPDATE users
        SET utr_player_id=NULL, utr_account_name=NULL, utr_account_claimed=NULL, utr_account_checked_at=NULL
      WHERE id=$1`,
    [actor.id],
  )
  return NextResponse.json({ unlinked: true, persisted: true })
}
