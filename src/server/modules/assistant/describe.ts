// Server-written description of a proposed action for the confirmation card, built from the
// command definition and the real input (ids resolved through the user's own permissions).
// The model's free-text summary is shown only as a secondary note.
import { formatMoney } from '@/lib/format'
import { formatDateTime } from '@/lib/time'
import { getCommand, runAs } from '../../commands/run'
import type { Actor } from '../users/accounts'

function label(command: string): string {
  const summary = getCommand(command)?.summary ?? command
  return summary.split(/[.:—]/)[0].trim()
}

async function resolve(actor: Actor, key: string, value: unknown): Promise<string | null> {
  if (typeof value !== 'string') return null
  const run = runAs(actor)
  try {
    switch (key) {
      case 'sessionId': {
        const { session } = await run('sessions.view', { sessionId: value })
        return `${session.title}, ${formatDateTime(session.startsAt, session.timezone)}`
      }
      case 'bookingId': {
        const detail = await run('bookings.get', { bookingId: value })
        return `${detail.playerName} · ${detail.session.title}, ${formatDateTime(detail.session.startsAt, detail.session.timezone)}`
      }
      case 'playerId': {
        const people = actor.providerId ? (await run('clients.list', { includeArchived: true })).map((c) => ({ id: c.playerId, name: c.playerName })) : []
        const family = (await run('family.list', {})).map((p) => ({ id: p.id, name: p.displayName }))
        return [...people, ...family].find((p) => p.id === value)?.name ?? null
      }
      case 'offeringId':
        return (await run('offerings.get', { offeringId: value })).title
      default:
        return null
    }
  } catch {
    return null
  }
}

const FIELD_LABELS: Record<string, (v: unknown) => string | null> = {
  date: (v) => `on ${v}`,
  startTime: (v) => `at ${v}`,
  durationMinutes: (v) => `${v} min`,
  capacity: (v) => `${v} spots`,
  priceCents: (v) => (typeof v === 'number' ? formatMoney(v) : null),
  reason: (v) => `reason: ${v}`,
  body: (v) => `“${String(v).slice(0, 120)}${String(v).length > 120 ? '…' : ''}”`,
  allFuture: (v) => (v ? 'every future session' : null),
  allInSeries: (v) => (v ? 'every session in the series' : null),
  outcome: (v) => String(v).replace('_', '-'),
  waiveFee: (v) => (v ? 'fee waived' : null),
  title: (v) => `“${v}”`,
}

export async function describeAction(actor: Actor, command: string, input: Record<string, unknown>): Promise<string> {
  const details: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue
    if (key.endsWith('Id')) {
      details.push((await resolve(actor, key, value)) ?? `${key} not found`)
    } else if (FIELD_LABELS[key]) {
      const text = FIELD_LABELS[key](value)
      if (text) details.push(text)
    }
  }
  return details.length ? `${label(command)}: ${details.join(' · ')}` : label(command)
}
