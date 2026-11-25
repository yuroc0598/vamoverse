// The native app's journeys: the same 9 as the web-shell suite (flows.ts), with the same names
// and the same database checks. Each step:
//   1. `prepare` picks fresh data from the database and passes it to the UI test as env vars,
//   2. runs one XCUITest method (ios-native/VamoverseUITests/Journeys.swift),
//   3. `check`s what the database recorded.
// Steps without a `test` are built in later phases and reported as pending.
import { check, freeSession, one, type Db } from './flows'

/** Data shared between steps in one run (e.g. the booking step 2 creates, cancelled in step 3). */
interface Shared {
  bookedSessionId?: string
  bookingId?: string
  /** A pay-after lesson booked in step 4 and the free slot right after it (steps 5 and 6). */
  lesson?: { id: string; next: string }
  lessonStart?: number
  importRun?: string
  usersBefore?: number
}

export interface NativeStep {
  name: string
  /** `Journeys/<method>` in VamoverseUITests. */
  test?: string
  /** Env vars for the UI test (VAMO_BASE_URL is always set). */
  prepare?: (db: Db, shared: Shared) => Promise<Record<string, string>>
  /** Database checks after the UI step; returns a short detail for the report. */
  check?: (db: Db, shared: Shared) => Promise<string | void>
}

export const nativeJourneys: NativeStep[] = [
  {
    name: 'Player signs in with the login form',
    test: 'Journeys/test01_PlayerSignsIn',
    check: async (db) => {
      // Signing in matched the seeded account by email; it did not create a second one.
      const row = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM users WHERE lower(email) = 'maya@demo.vamoverse.app'`)
      check(row.n === 1, `Expected one account for Maya, found ${row.n}`)
      return 'Maya signed in (one account)'
    },
  },
  {
    name: 'Player books and pays through checkout',
    test: 'Journeys/test02_PlayerBooksAndPays',
    prepare: async (db, shared) => {
      const session = await freeSession(db, `o.kind = 'hitting' AND o.payment_rule = 'pay_now'`)
      shared.bookedSessionId = session.id
      return { VAMO_SESSION_ID: session.id }
    },
    check: async (db, shared) => {
      const row = await one<{ id: string; status: string; paymentStatus: string; payment: string; playerName: string }>(db, `
        SELECT b.id, b.status, b.payment_status AS "paymentStatus", p.status AS payment, b.player_name AS "playerName"
        FROM bookings b JOIN payments p ON p.booking_id = b.id WHERE b.session_id = $1`, [shared.bookedSessionId])
      check(row.status === 'confirmed' && row.paymentStatus === 'paid' && row.payment === 'succeeded', `Booking/payment out of sync: ${JSON.stringify(row)}`)
      check(row.playerName === 'Maya Chen', `Booking name snapshot is ${row.playerName}`)
      shared.bookingId = row.id
      return `${shared.bookedSessionId}: confirmed, paid`
    },
  },
  {
    name: 'Player cancels and is refunded per the policy',
    test: 'Journeys/test03_PlayerCancels',
    prepare: async (_db, shared) => {
      check(shared.bookingId, 'No booking from the previous step')
      return { VAMO_BOOKING_ID: shared.bookingId }
    },
    check: async (db, shared) => {
      const row = await one<{ status: string; paymentStatus: string; payment: string; amount: number; requested: number; refunded: number }>(db, `
        SELECT b.status, b.payment_status AS "paymentStatus", p.status AS payment, p.amount_cents AS amount,
               p.refund_requested_cents AS requested, p.refunded_cents AS refunded
        FROM bookings b JOIN payments p ON p.booking_id = b.id WHERE b.id = $1`, [shared.bookingId])
      check(row.refunded > 0 && row.refunded === row.requested, `Refund not executed: ${JSON.stringify(row)}`)
      if (row.status === 'cancelled') {
        check(row.refunded === row.amount && row.payment === 'refunded' && row.paymentStatus === 'refunded', `Full refund out of sync: ${JSON.stringify(row)}`)
      } else {
        check(row.status === 'late_cancelled' && row.refunded < row.amount && row.payment === 'partially_refunded', `Late cancel out of sync: ${JSON.stringify(row)}`)
      }
      return `${row.status}: $${row.refunded / 100} of $${row.amount / 100} back`
    },
  },
  {
    name: 'Player books a pay-after lesson with a saved card',
    test: 'Journeys/test04_PlayerBooksPayAfter',
    prepare: async (db, shared) => {
      // A lesson whose next slot is free too (journeys 5 and 6 use the pair).
      const pair = await one<{ id: string; next: string }>(db, `
        SELECT s1.id, s2.id AS next FROM sessions s1 JOIN offerings o ON o.id = s1.offering_id
        JOIN sessions s2 ON s2.offering_id = s1.offering_id AND s2.starts_at = s1.ends_at
        WHERE o.kind = 'private' AND o.payment_rule = 'pay_after' AND s1.status = 'scheduled' AND s2.status = 'scheduled'
          AND s1.starts_at > now() + interval '2 hours'
          AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id IN (s1.id, s2.id))
        ORDER BY s1.starts_at LIMIT 1`)
      shared.bookedSessionId = pair.id
      shared.lesson = pair
      return { VAMO_SESSION_ID: pair.id }
    },
    check: async (db, shared) => {
      const row = await one<{ status: string }>(db, `SELECT status FROM bookings WHERE session_id = $1`, [shared.bookedSessionId])
      check(row.status === 'confirmed', `Booking is ${row.status}`)
      return `${shared.bookedSessionId}: confirmed`
    },
  },
  {
    name: 'Coach adds a student to the next lesson slot',
    test: 'Journeys/test05_CoachAddsStudent',
    prepare: async (_db, shared) => {
      check(shared.lesson, 'No lesson from the previous step')
      return { VAMO_SESSION_ID: shared.lesson.next }
    },
    check: async (db, shared) => {
      const sarah = await one<{ id: string }>(db, `SELECT p.id FROM players p JOIN users u ON u.id = p.user_id WHERE u.email = 'sarah@demo.vamoverse.app'`)
      const row = await one<{ status: string }>(db, `SELECT status FROM bookings WHERE session_id = $1 AND player_id = $2`, [shared.lesson!.next, sarah.id])
      return `Sarah ${row.status}`
    },
  },
  {
    name: 'Coach cannot move a booked lesson onto another booked one',
    test: 'Journeys/test06_CoachCannotOverlap',
    prepare: async (db, shared) => {
      check(shared.lesson, 'No lesson from the previous steps')
      const before = await one<{ startsAt: Date }>(db, `SELECT starts_at AS "startsAt" FROM sessions WHERE id = $1`, [shared.lesson.id])
      shared.lessonStart = before.startsAt.getTime()
      return { VAMO_SESSION_ID: shared.lesson.id }
    },
    check: async (db, shared) => {
      // The 409 refusal is asserted on screen (its toast); the session must not have moved.
      const after = await one<{ startsAt: Date }>(db, `SELECT starts_at AS "startsAt" FROM sessions WHERE id = $1`, [shared.lesson!.id])
      check(after.startsAt.getTime() === shared.lessonStart, 'The session moved anyway')
      return 'refused with a toast'
    },
  },
  {
    name: 'Coach imports contacts as invites only',
    test: 'Journeys/test07_CoachImportsContacts',
    prepare: async (db, shared) => {
      const run = Date.now().toString(36)
      const users = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM users`)
      shared.importRun = run
      shared.usersBefore = users.n
      return { VAMO_RUN: run, VAMO_PHONE_SUFFIX: String(Date.now()).slice(-4) }
    },
    check: async (db, shared) => {
      const { importRun, usersBefore = -1 } = shared
      const usersAfter = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM users`)
      check(usersAfter.n === usersBefore, `Import created ${usersAfter.n - usersBefore} account(s)`)
      const invites = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM client_invites WHERE status = 'pending' AND name LIKE $1`, [`%${importRun}`])
      check(invites.n === 3, `Expected 3 pending invites, found ${invites.n}`)
      return '3 pending invites, no accounts created'
    },
  },
  {
    name: 'Coach with booked sessions cannot delete the account',
    test: 'Journeys/test08_CoachCannotDeleteAccount',
    check: async (db) => {
      // The 409 refusal is asserted on screen (its toast); the account must still be there.
      await one(db, `SELECT id FROM users WHERE email = 'alex@demo.vamoverse.app'`)
      return 'refused with a toast'
    },
  },
  {
    name: 'Parent cannot remove a junior with an upcoming booking',
    test: 'Journeys/test09_ParentCannotRemoveJunior',
    prepare: async (db) => {
      const leo = await one<{ upcoming: number }>(db, `
        SELECT (SELECT count(*)::int FROM bookings b JOIN sessions s ON s.id = b.session_id
                WHERE b.player_id = p.id AND s.starts_at > now() AND b.status IN ('confirmed','invited','held')) AS upcoming
        FROM players p WHERE p.display_name = 'Leo Kim'`)
      check(leo.upcoming > 0, 'Seed data has no upcoming booking for Leo')
      return {}
    },
    check: async (db) => {
      // The refusal (409) is asserted on screen by the UI test (its toast); the junior must still exist.
      await one(db, `SELECT 1 FROM players WHERE display_name = 'Leo Kim' AND guardian_user_id IS NOT NULL`)
      return 'refused; junior kept'
    },
  },
]
