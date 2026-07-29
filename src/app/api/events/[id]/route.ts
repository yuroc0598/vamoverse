import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth/actor'
import { hasDatabase, query } from '@/lib/db/pg'
import { getEvent, toApiEvent } from '@/lib/domain/catalog'
import { mockCreatedEvents } from '@/lib/db/mock_repository'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  if (isMockMode) {
    const catalog = getEvent(id)
    if (catalog) return NextResponse.json({ event: toApiEvent(catalog), demo: true })
    const created = mockCreatedEvents.find((event) => event.id === id)
    if (!created) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    return NextResponse.json({ event: {
      id: created.id, title: created.title, discipline: created.discipline, type: created.type,
      start_at: created.startsAt,
      end_at: new Date(new Date(created.startsAt).getTime() + created.durationMinutes * 60_000).toISOString(),
      capacity: created.capacity, registered_count: 0, price_cents: created.priceCents,
      is_paid: created.priceCents > 0, level_min_utr: created.levelMinUtr,
      level_max_utr: created.levelMaxUtr, location_name: created.locationName,
      location_address: '', occurrence_id: created.occurrenceId,
    }, demo: true })
  }
  if (!hasDatabase()) return NextResponse.json({ error: 'Event database is not configured' }, { status: 503 })
  const rows = await query(
    `SELECT e.id,e.title,e.discipline,e.type,o.id AS occurrence_id,o.occurrence_start_at AS start_at,
       o.occurrence_end_at AS end_at,COALESCE(o.capacity_override,e.capacity) AS capacity,
       count(r.id) FILTER (WHERE r.status IN ('registered','invited','pending_accept'))::int AS registered_count,
       e.price_cents,(e.price_cents > 0) AS is_paid,e.level_min_utr,e.level_max_utr,
       e.location_name,e.location_address,e.match_format AS format,e.scoring_system
     FROM events e JOIN event_occurrences o ON o.event_id=e.id
     LEFT JOIN registrations r ON r.occurrence_id=o.id
     WHERE e.id=$1 GROUP BY e.id,o.id ORDER BY o.occurrence_start_at LIMIT 1`,
    [id]
  )
  if (!rows.length) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  return NextResponse.json({ event: rows[0], demo: false })
}
