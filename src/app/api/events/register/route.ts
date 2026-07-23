// Server-authoritative registration. This is the real capacity gate: it delegates
// to the repository (Postgres FOR UPDATE when DATABASE_URL is set, in-memory mock
// otherwise), so overbooking is prevented on the server, not trusted from the client.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { resolveActor } from '@/lib/auth/actor'
import { getRepository } from '@/lib/db/repository'

const bodySchema = z.object({
  eventId: z.string().min(1).max(128),
  occurrenceId: z.string().min(1).max(256).optional(),
})

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || undefined

  const { actor } = await resolveActor(req)
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { eventId } = parsed.data
  // Default to a single canonical occurrence per event when the caller doesn't specify one.
  const occurrenceId = parsed.data.occurrenceId || `${eventId}_occ_default`

  try {
    const repo = await getRepository()
    const result = await repo.registerForOccurrence(occurrenceId, actor.id, eventId)
    const counts = await repo.getOccurrenceCounts(occurrenceId)
    logger.info('events.register', { requestId, actorId: actor.id, eventId, occurrenceId, status: result.status, repo: repo.kind })
    return NextResponse.json({
      status: result.status,
      registrationId: result.registrationId,
      counts,
      backend: repo.kind,
    })
  } catch (err: any) {
    const msg = String(err?.message || err)
    if (msg.startsWith('occurrence_not_found')) {
      return NextResponse.json({ error: 'Occurrence not found' }, { status: 404 })
    }
    logger.error('events.register_failed', { requestId, actorId: actor.id, eventId, err: msg })
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
