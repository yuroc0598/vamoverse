import { z } from 'zod'
import { command } from '../../commands/define'
import { profileSlug } from '../../schemas'
import { tx } from '../../db'
import { fail } from '../../errors'
import { hasBookedOverlap, lockSession, notifySessionMoved, promoteWaitlist } from '../bookings/engine'
import { requirePublicProvider } from '../providers/profile'
import { archiveOffering, createOffering, listOfferings, offeringInput, offeringUpdateInput, requireOwnOffering, updateOffering } from './offerings'
import { listProviderSessions, listPublicSessions, requireOwnSession, sessionUpdateInput, updateSession } from './sessions'

const DAY_MS = 86_400_000

/** Either explicit ISO bounds, or a relative window: `days` starting `offsetDays` from now. */
const range = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  days: z.number().int().min(1).max(62).default(14),
  offsetDays: z.number().int().min(-62).max(365).default(0),
}).transform(({ from, to, days, offsetDays }) => {
  if (from && to) return { from: new Date(from), to: new Date(to) }
  const start = new Date(Date.now() - 2 * 3_600_000 + offsetDays * DAY_MS) // include sessions that just started
  return { from: start, to: new Date(start.getTime() + days * DAY_MS) }
}).refine((r) => r.to > r.from && r.to.getTime() - r.from.getTime() <= 62 * DAY_MS, 'Range must be 1–62 days')

export const scheduleCommands = {
  'offerings.create': command({
    summary: 'Create a clinic, private lesson, semi-private, or hitting session — one-off or weekly (choose weekdays), or open slots players book themselves.',
    access: 'provider',
    mutates: true,
    input: offeringInput,
    run: ({ actor, db }, input) => createOffering(db, actor.providerId, input),
  }),

  'offerings.update': command({
    summary: 'Change a session series (title, price, capacity, level, court, days or time). Applies to future sessions.',
    access: 'provider',
    mutates: true,
    input: offeringUpdateInput,
    run: async ({ actor, db }, input) => {
      const result = await updateOffering(db, actor.providerId, input)
      if (input.capacity !== undefined) {
        // More room: offer the new seats to anyone waiting.
        const waiting = await db.query<{ id: string }>(
          `SELECT DISTINCT s.id FROM sessions s JOIN bookings b ON b.session_id = s.id AND b.status = 'waitlisted'
           WHERE s.offering_id = $1 AND s.starts_at > now() AND s.status = 'scheduled'`, [input.offeringId])
        for (const { id } of waiting) await tx(async (t) => promoteWaitlist(t, await lockSession(t, id)))
      }
      return result
    },
  }),

  'offerings.archive': command({
    summary: 'Stop a session series. Future sessions without bookings are removed.',
    access: 'provider',
    mutates: true,
    input: z.object({ offeringId: z.string() }),
    run: ({ actor, db }, { offeringId }) => archiveOffering(db, actor.providerId, offeringId),
  }),

  'offerings.list': command({
    summary: 'List your active session series.',
    access: 'provider',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listOfferings(db, actor.providerId),
  }),

  'offerings.get': command({
    summary: 'Get one of your session series.',
    access: 'provider',
    mutates: false,
    input: z.object({ offeringId: z.string() }),
    run: ({ actor, db }, { offeringId }) => requireOwnOffering(db, actor.providerId, offeringId),
  }),

  'sessions.list': command({
    summary: 'List your sessions (default: the next 14 days; or give days/offsetDays, or ISO from/to) with seats taken, waitlist, and requests.',
    access: 'provider',
    mutates: false,
    input: range,
    run: ({ actor, db }, { from, to }) => listProviderSessions(db, actor.providerId, from, to),
  }),

  'sessions.get': command({
    summary: 'Get one of your sessions.',
    access: 'provider',
    mutates: false,
    input: z.object({ sessionId: z.string() }),
    run: ({ actor, db }, { sessionId }) => requireOwnSession(db, actor.providerId, sessionId),
  }),

  'sessions.update': command({
    summary: 'Edit one session: move it (booked players are told), change duration/capacity/price, add a note, or record the court booking.',
    access: 'provider',
    mutates: true,
    input: sessionUpdateInput,
    run: ({ actor }, input) => tx(async (t) => {
      await lockSession(t, input.sessionId) // capacity checks must see concurrent bookings
      const result = await updateSession(t, actor.providerId, input)
      if (result.moved && result.session.seatsTaken > 0
        && await hasBookedOverlap(t, actor.providerId, result.session.startsAt, result.session.endsAt, result.session.id)) {
        throw fail.conflict('That time overlaps another booked session.')
      }
      const notified = result.moved ? await notifySessionMoved(t, result.session) : 0
      if (input.capacity !== undefined) await promoteWaitlist(t, await lockSession(t, input.sessionId))
      return { ...result, notified }
    }),
  }),

  'schedule.public': command({
    summary: 'Get a coach or hitter’s public page with upcoming bookable sessions.',
    access: 'public',
    mutates: false,
    input: z.object({ slug: profileSlug }),
    run: async ({ db }, { slug }) => {
      const provider = await requirePublicProvider(db, slug)
      return { provider, sessions: await listPublicSessions(db, provider.id) }
    },
  }),
}
