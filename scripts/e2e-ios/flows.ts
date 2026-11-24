// The user journeys checked on the simulator. Each step acts through the UI and then checks
// both what the screen says and what the database recorded. Data is picked fresh each run, so
// the app and Safari passes can share one seeded database.
import type { Surface } from './surface'

export interface Step {
  name: string
  run: () => Promise<string | void>
}

/** Read access to the run's database (the in-process PGlite instance). */
interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

interface Ctx {
  ui: Surface
  db: Db
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params)
  check(rows.length, `Expected a row for: ${sql.replace(/\s+/g, ' ').slice(0, 120)}`)
  return rows[0]
}

const userIdOf = (db: Db, email: string) => one<{ id: string }>(db, `SELECT id FROM users WHERE email = $1`, [email]).then((r) => r.id)

/** An open session of an offering kind/payment rule that nobody has booked yet. */
function freeSession(db: Db, where: string) {
  return one<{ id: string; startsAt: Date; endsAt: Date }>(db, `
    SELECT s.id, s.starts_at AS "startsAt", s.ends_at AS "endsAt" FROM sessions s JOIN offerings o ON o.id = s.offering_id
    WHERE s.status = 'scheduled' AND s.starts_at > now() + interval '2 hours' AND ${where}
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = s.id)
    ORDER BY s.starts_at LIMIT 1`)
}

export function journeys({ ui, db }: Ctx): Step[] {
  const run = Date.now().toString(36)
  let bookingPath = ''
  let lesson: { id: string; next: string } | null = null

  return [
    {
      name: 'Player signs in with the login form',
      run: async () => {
        await ui.signOut()
        await ui.waitFor('the login form', `return !!document.querySelector('input')`)
        await ui.run(`window.__e2eLeaving = location.href; setv(document.querySelector('input'), 'maya@demo.vamoverse.app'); return tap('Continue')`)
        await ui.waitFor('the player home', `return location.pathname === '/today' && text().includes('Hi, Maya')`)
      },
    },
    {
      name: 'Player books and pays through checkout',
      run: async () => {
        const session = await freeSession(db, `o.kind = 'hitting' AND o.payment_rule = 'pay_now'`)
        await ui.goto(`/s/${session.id}`)
        await ui.waitFor('the Book and pay button', `return text().includes('Book and pay')`)
        const checkout = await ui.tapAndWait('Book and pay', 'the checkout page')
        check(checkout.startsWith('/dev/simulate'), `Expected the checkout page, got ${checkout}`)
        bookingPath = await ui.tapAndWait('Complete', 'the booking page')
        check(bookingPath.startsWith('/b/'), `Expected the booking page, got ${bookingPath}`)
        await ui.waitFor('the confirmation', `return text().includes('You’re booked') && text().includes('Paid $60')`)
        const row = await one<{ status: string; paymentStatus: string; payment: string; playerName: string }>(db, `
          SELECT b.status, b.payment_status AS "paymentStatus", p.status AS payment, b.player_name AS "playerName"
          FROM bookings b JOIN payments p ON p.booking_id = b.id WHERE b.session_id = $1`, [session.id])
        check(row.status === 'confirmed' && row.paymentStatus === 'paid' && row.payment === 'succeeded', `Booking/payment out of sync: ${JSON.stringify(row)}`)
        check(row.playerName === 'Maya Chen', `Booking name snapshot is ${row.playerName}`)
        return `${session.id}: confirmed, paid`
      },
    },
    {
      name: 'Player cancels and is refunded per the policy',
      run: async () => {
        check(bookingPath, 'No booking from the previous step')
        await ui.run(`return tap('Cancel booking')`)
        await ui.waitFor('the cancellation', `return text().includes('Cancelled')`)
        const bookingId = bookingPath.split('/')[2].split('?')[0]
        const row = await one<{ status: string; paymentStatus: string; payment: string; amount: number; requested: number; refunded: number }>(db, `
          SELECT b.status, b.payment_status AS "paymentStatus", p.status AS payment, p.amount_cents AS amount,
                 p.refund_requested_cents AS requested, p.refunded_cents AS refunded
          FROM bookings b JOIN payments p ON p.booking_id = b.id WHERE b.id = $1`, [bookingId])
        check(row.refunded > 0 && row.refunded === row.requested, `Refund not executed: ${JSON.stringify(row)}`)
        if (row.status === 'cancelled') {
          check(row.refunded === row.amount && row.payment === 'refunded' && row.paymentStatus === 'refunded', `Full refund out of sync: ${JSON.stringify(row)}`)
        } else {
          check(row.status === 'late_cancelled' && row.refunded < row.amount && row.payment === 'partially_refunded', `Late cancel out of sync: ${JSON.stringify(row)}`)
          await ui.waitFor('the refund on the booking page', `return text().includes('refunded')`)
        }
        return `${row.status}: $${row.refunded / 100} of $${row.amount / 100} back`
      },
    },
    {
      name: 'Player books a pay-after lesson with a saved card',
      run: async () => {
        // A lesson whose next slot is free too, for the overlap check below.
        const pair = await one<{ id: string; next: string }>(db, `
          SELECT s1.id, s2.id AS next FROM sessions s1 JOIN offerings o ON o.id = s1.offering_id
          JOIN sessions s2 ON s2.offering_id = s1.offering_id AND s2.starts_at = s1.ends_at
          WHERE o.kind = 'private' AND o.payment_rule = 'pay_after' AND s1.status = 'scheduled' AND s2.status = 'scheduled'
            AND s1.starts_at > now() + interval '2 hours'
            AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id IN (s1.id, s2.id))
          ORDER BY s1.starts_at LIMIT 1`)
        await ui.goto(`/s/${pair.id}`)
        const page = await ui.tapAndWait('Book (pay after)', 'the booking page')
        check(page.startsWith('/b/'), `Expected the booking page, got ${page}`)
        await ui.waitFor('the confirmation', `return text().includes('charged after the session')`)
        const row = await one<{ status: string }>(db, `SELECT status FROM bookings WHERE session_id = $1`, [pair.id])
        check(row.status === 'confirmed', `Booking is ${row.status}`)
        lesson = pair
        return `${pair.id}: confirmed`
      },
    },
    {
      name: 'Coach adds a student to the next lesson slot',
      run: async () => {
        check(lesson, 'No lesson from the previous step')
        await ui.signInAs('alex@demo.vamoverse.app')
        await ui.goto(`/sessions/${lesson.next}`)
        const sarah = await one<{ id: string }>(db, `SELECT p.id FROM players p JOIN users u ON u.id = p.user_id WHERE u.email = 'sarah@demo.vamoverse.app'`)
        await ui.run(`
          setv($$('select')[0], ${JSON.stringify(sarah.id)});
          const weekly = $$('input[type=checkbox]')[0];
          if (weekly && weekly.checked) weekly.click();
          return tap('Add')`)
        await ui.waitFor('the confirmation', `return e2e.dialogs.some((d) => d.startsWith('Added to'))`)
        const row = await one<{ status: string }>(db, `SELECT status FROM bookings WHERE session_id = $1 AND player_id = $2`, [lesson.next, sarah.id])
        return `Sarah ${row.status}`
      },
    },
    {
      name: 'Coach cannot move a booked lesson onto another booked one',
      run: async () => {
        check(lesson, 'No lesson from the previous steps')
        const before = await one<{ startsAt: Date }>(db, `SELECT starts_at AS "startsAt" FROM sessions WHERE id = $1`, [lesson.id])
        await ui.goto(`/sessions/${lesson.id}`)
        await ui.run(`
          const time = $$('input[type=time]')[0];
          const [h, m] = time.value.split(':').map(Number);
          const later = h * 60 + m + 30;
          setv(time, String(Math.floor(later / 60)).padStart(2, '0') + ':' + String(later % 60).padStart(2, '0'));
          setTimeout(() => tap('Save'), 50);
          return true`)
        const result = await ui.waitFor<{ status: number; body: string }>('the save result', `return call('sessions.update')`)
        check(result.status === 409 && result.body.includes('overlaps'), `Expected a 409 overlap refusal, got ${result.status} ${result.body}`)
        await ui.waitFor('the error toast', `return toasts().some((t) => t.includes('overlaps another booked session'))`, { timeoutMs: 10_000 })
        const after = await one<{ startsAt: Date }>(db, `SELECT starts_at AS "startsAt" FROM sessions WHERE id = $1`, [lesson.id])
        check(after.startsAt.getTime() === before.startsAt.getTime(), 'The session moved anyway')
        return 'refused with a toast'
      },
    },
    {
      name: 'Coach imports contacts as invites only',
      run: async () => {
        const usersBefore = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM users`)
        await ui.goto('/crew')
        const lines = [`Ella ${run}, ella.${run}@example.com`, `Maya Lookup ${run}, maya@demo.vamoverse.app`, `Ray ${run}, +1 415 555 ${String(Date.now()).slice(-4)}`]
        await ui.run(`setv($$('textarea')[0], ${JSON.stringify(lines.join('\n'))}); return true`)
        await ui.waitFor('the parsed contacts', `return text().includes('Save 3 invites')`)
        await ui.run(`return tap('Save 3 invites')`)
        await ui.waitFor('the confirmation', `return e2e.dialogs.some((d) => d.startsWith('Saved 3 invites'))`)
        const usersAfter = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM users`)
        check(usersAfter.n === usersBefore.n, `Import created ${usersAfter.n - usersBefore.n} account(s)`)
        const invites = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM client_invites WHERE status = 'pending' AND name LIKE $1`, [`%${run}`])
        check(invites.n === 3, `Expected 3 pending invites, found ${invites.n}`)
        await ui.waitFor('the invite list', `return text().includes('Maya Lookup ${run}')`)
        return '3 pending invites, no accounts created'
      },
    },
    {
      name: 'Coach with booked sessions cannot delete the account',
      run: async () => {
        await ui.goto('/settings/account')
        await ui.run(`return tap('Delete my account')`)
        const result = await ui.waitFor<{ status: number; body: string }>('the delete result', `return call('account.delete')`)
        check(result.status === 409 && result.body.includes('Cancel your upcoming booked sessions first'), `Expected a 409 refusal, got ${result.status} ${result.body}`)
        await ui.waitFor('the error toast', `return toasts().some((t) => t.includes('Cancel your upcoming booked sessions first'))`, { timeoutMs: 10_000 })
        await userIdOf(db, 'alex@demo.vamoverse.app')
        return 'refused with a toast'
      },
    },
    {
      name: 'Parent cannot remove a junior with an upcoming booking',
      run: async () => {
        const leo = await one<{ id: string; upcoming: number }>(db, `
          SELECT p.id, (SELECT count(*)::int FROM bookings b JOIN sessions s ON s.id = b.session_id
                        WHERE b.player_id = p.id AND s.starts_at > now() AND b.status IN ('confirmed','invited','held')) AS upcoming
          FROM players p WHERE p.display_name = 'Leo Kim'`)
        check(leo.upcoming > 0, 'Seed data has no upcoming booking for Leo')
        await ui.signInAs('dave@demo.vamoverse.app')
        await ui.goto('/settings/family')
        await ui.run(`return tap('Remove')`)
        const result = await ui.waitFor<{ status: number; body: string }>('the remove result', `return call('family.removeJunior')`)
        check(result.status === 409, `Expected a 409 refusal, got ${result.status} ${result.body}`)
        await one(db, `SELECT 1 FROM players WHERE id = $1`, [leo.id])
        return 'refused; junior kept'
      },
    },
  ]
}
