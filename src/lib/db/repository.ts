// Data-access contract. The app talks to this interface, not to a specific store,
// so the mock and Postgres implementations are interchangeable behind an env flag.
import { hasDatabase } from './pg'

export interface RegisterResult {
  registrationId: string
  status: 'registered' | 'waitlisted'
}

export interface OccurrenceCounts {
  registered: number
  waitlisted: number
  capacity: number
}

export interface Repository {
  readonly kind: 'mock' | 'postgres'
  /**
   * Register a student for an occurrence atomically. Implementations MUST prevent
   * overbooking under concurrency (Postgres uses SELECT ... FOR UPDATE).
   * Idempotent: re-registering an already-active student returns their existing spot.
   */
  registerForOccurrence(occurrenceId: string, studentId: string, eventId: string): Promise<RegisterResult>
  getOccurrenceCounts(occurrenceId: string): Promise<OccurrenceCounts>
}

let cached: Repository | null = null

/**
 * Returns the Postgres repository when DATABASE_URL is set, otherwise the in-memory
 * mock. Async so the Postgres implementation (and the `pg` driver) is only loaded
 * when actually needed and never bundled into client code.
 */
export async function getRepository(): Promise<Repository> {
  if (cached) return cached
  if (hasDatabase()) {
    const { PgRepository } = await import('./pg_repository')
    cached = new PgRepository()
  } else {
    const { MockRepository } = await import('./mock_repository')
    cached = new MockRepository()
  }
  return cached
}

export function _resetRepositoryForTests() {
  cached = null
}
