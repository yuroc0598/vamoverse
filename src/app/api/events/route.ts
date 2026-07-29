import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/lib/auth/actor'
import { getRepository } from '@/lib/db/repository'
import { logger } from '@/lib/logger'
import { hasDatabase, query } from '@/lib/db/pg'
import { listEvents, toApiEvent } from '@/lib/domain/catalog'
import { mockCreatedEvents } from '@/lib/db/mock_repository'
import { getCapacityForDiscipline } from '@/lib/utils/gender'

const disciplines = [
  'mens_singles', 'womens_singles', 'open_singles', 'mens_doubles',
  'womens_doubles', 'mixed_doubles', 'open_doubles', 'open',
] as const
const eventTypes = ['private', 'semi_private', 'group_clinic', 'tournament', 'custom_match', 'social_mixer'] as const

const createEventSchema = z.object({
  title: z.string().trim().min(3).max(120),
  discipline: z.enum(disciplines),
  type: z.enum(eventTypes),
  capacity: z.number().int().min(1).max(20),
  priceCents: z.number().int().min(0).max(1_000_000),
  levelMinUtr: z.number().min(1).max(16.5).optional(),
  levelMaxUtr: z.number().min(1).max(16.5).optional(),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(30).max(480),
  locationName: z.string().trim().min(2).max(160),
}).refine((value) => value.levelMinUtr == null || value.levelMaxUtr == null || value.levelMinUtr <= value.levelMaxUtr, {
  message: 'levelMinUtr must be less than or equal to levelMaxUtr',
  path: ['levelMaxUtr'],
}).refine((value) => value.type !== 'custom_match' || value.capacity === getCapacityForDiscipline(value.discipline, value.type), {
  message: 'Custom-match capacity must match its discipline',
  path: ['capacity'],
}).refine((value) => value.type !== 'private' || value.capacity === 1, {
  message: 'Private events must have capacity 1',
  path: ['capacity'],
}).refine((value) => new Date(value.startsAt).getTime() > Date.now(), {
  message: 'Event start time must be in the future',
  path: ['startsAt'],
})

export async function GET(req: NextRequest) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isMockMode) {
    const created = mockCreatedEvents.map((event) => ({
      id: event.id, title: event.title, discipline: event.discipline, type: event.type,
      start_at: event.startsAt,
      end_at: new Date(new Date(event.startsAt).getTime() + event.durationMinutes * 60_000).toISOString(),
      capacity: event.capacity, registered_count: 0, price_cents: event.priceCents,
      is_paid: event.priceCents > 0, level_min_utr: event.levelMinUtr,
      level_max_utr: event.levelMaxUtr, location_name: event.locationName,
    }))
    return NextResponse.json({ events: [...created, ...listEvents().map(toApiEvent)], demo: true })
  }
  if (!hasDatabase()) return NextResponse.json({ error: 'Event database is not configured' }, { status: 503 })
  const events = await query(
    `SELECT e.id,e.title,e.discipline,e.type,o.occurrence_start_at AS start_at,
       o.occurrence_end_at AS end_at,COALESCE(o.capacity_override,e.capacity) AS capacity,
       count(r.id) FILTER (WHERE r.status IN ('registered','invited','pending_accept'))::int AS registered_count,
       e.price_cents,(e.price_cents > 0) AS is_paid,e.level_min_utr,e.level_max_utr,
       e.location_name,e.location_address,e.match_format AS format,e.scoring_system
     FROM events e JOIN event_occurrences o ON o.event_id=e.id
     LEFT JOIN registrations r ON r.occurrence_id=o.id
     WHERE e.status='published' AND o.status='published'
     GROUP BY e.id,o.id ORDER BY o.occurrence_start_at LIMIT 200`
  )
  return NextResponse.json({ events, demo: false })
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || undefined
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (actor.role !== 'coach') return NextResponse.json({ error: 'Only approved coaches can create events' }, { status: 403 })
  if (!isMockMode && !hasDatabase()) return NextResponse.json({ error: 'Event database is not configured' }, { status: 503 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const repo = await getRepository({ forceMock: isMockMode })
    const event = await repo.createEvent({ ...parsed.data, coachId: actor.id })
    logger.info('events.created', { requestId, actorId: actor.id, eventId: event.id, backend: repo.kind })
    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        discipline: event.discipline,
        type: event.type,
        start_at: event.startsAt,
        end_at: new Date(new Date(event.startsAt).getTime() + event.durationMinutes * 60_000).toISOString(),
        capacity: event.capacity,
        registered_count: 0,
        price_cents: event.priceCents,
        is_paid: event.priceCents > 0,
        level_min_utr: event.levelMinUtr,
        level_max_utr: event.levelMaxUtr,
        location_name: event.locationName,
        occurrence_id: event.occurrenceId,
      },
      backend: repo.kind,
      demo: isMockMode,
    }, { status: 201 })
  } catch (error) {
    logger.error('events.create_failed', { requestId, actorId: actor.id, error })
    return NextResponse.json({ error: 'Event creation failed' }, { status: 500 })
  }
}
