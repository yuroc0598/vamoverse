// Server-authoritative registration. This is the real capacity gate: it delegates
// to the repository (Postgres FOR UPDATE when DATABASE_URL is set, in-memory mock
// otherwise), so overbooking is prevented on the server, not trusted from the client.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { resolveActor } from '@/lib/auth/actor'
import { getRepository } from '@/lib/db/repository'
import { getEvent, getPlayer, toRosterPlayer } from '@/lib/domain/catalog'
import { validateDiscipline } from '@/lib/utils/gender'
import { hasDatabase } from '@/lib/db/pg'

const bodySchema = z.object({
  eventId: z.string().min(1).max(128),
  occurrenceId: z.string().min(1).max(256).optional(),
})

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || undefined

  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isMockMode && !hasDatabase()) {
    return NextResponse.json({ error: 'Registration database is not configured' }, { status: 503 })
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
    if (isMockMode) {
      const event = getEvent(eventId)
      const player = getPlayer(actor.id)
      if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      if (!player) return NextResponse.json({ error: 'Player profile is required' }, { status: 409 })
      if (event.priceCents > 0) {
        return NextResponse.json({ error: 'Verified payment checkout is required and is not available in demo mode; no charge was made' }, { status: 402 })
      }
      const baseRoster = eventId === 'evt_2' ? ['student_1', 'student_2', 'student_3'] : []
      if (baseRoster.includes(actor.id)) {
        return NextResponse.json({
          status: 'registered', registrationId: `catalog_${eventId}_${actor.id}`,
          counts: { registered: baseRoster.length, waitlisted: 0, capacity: event.capacity },
          backend: 'mock', demo: true, idempotent: true,
        })
      }
      const roster = baseRoster.map(getPlayer).filter((value): value is NonNullable<typeof value> => Boolean(value)).map(toRosterPlayer)
      const eligibility = validateDiscipline(event.discipline, [...roster, toRosterPlayer(player)])
      if (!eligibility.valid) {
        return NextResponse.json({ error: eligibility.error || 'Not eligible for this event' }, { status: 409 })
      }
    }
    const repo = await getRepository({ forceMock: isMockMode })
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
    if (msg.startsWith('occurrence_closed') || msg.startsWith('event_occurrence_mismatch')) {
      return NextResponse.json({ error: 'This occurrence is not open for registration' }, { status: 409 })
    }
    if (msg.startsWith('payment_required')) {
      return NextResponse.json({ error: 'Verified payment is required before registration; no charge was made' }, { status: 402 })
    }
    if (msg.startsWith('not_eligible') || msg.startsWith('rating_required') || msg.startsWith('profile_not_found')) {
      return NextResponse.json({ error: 'Player is not eligible for this event' }, { status: 409 })
    }
    logger.error('events.register_failed', { requestId, actorId: actor.id, eventId, err: msg })
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
