// Postgres-backed repository. Registration goes through the register_for_occurrence
// SQL function whose SELECT ... FOR UPDATE serializes concurrent joiners and makes
// overbooking impossible — the guarantee the in-memory mock cannot provide.
import type { Repository, RegisterResult, OccurrenceCounts } from './repository'
import { query } from './pg'

export class PgRepository implements Repository {
  readonly kind = 'postgres' as const

  async registerForOccurrence(occurrenceId: string, studentId: string, eventId: string): Promise<RegisterResult> {
    const rows = await query<{ registration_id: string; out_status: string }>(
      'SELECT registration_id, out_status FROM register_for_occurrence($1, $2, $3)',
      [occurrenceId, studentId, eventId]
    )
    if (!rows.length) throw new Error('registration_failed')
    const { registration_id, out_status } = rows[0]
    return { registrationId: registration_id, status: out_status as RegisterResult['status'] }
  }

  async getOccurrenceCounts(occurrenceId: string): Promise<OccurrenceCounts> {
    const rows = await query<{ registered: string; waitlisted: string; capacity: string | null }>(
      `SELECT
         count(*) FILTER (WHERE r.status IN ('registered','invited','pending_accept')) AS registered,
         count(*) FILTER (WHERE r.status = 'waitlisted') AS waitlisted,
         (SELECT COALESCE(o.capacity_override, e.capacity)
            FROM event_occurrences o JOIN events e ON e.id = o.event_id
            WHERE o.id = $1) AS capacity
       FROM registrations r
       WHERE r.occurrence_id = $1`,
      [occurrenceId]
    )
    const row = rows[0] || { registered: '0', waitlisted: '0', capacity: '0' }
    return {
      registered: Number(row.registered) || 0,
      waitlisted: Number(row.waitlisted) || 0,
      capacity: Number(row.capacity) || 0,
    }
  }
}
