// Data-access contract. The app talks to this interface, not to a specific store,
// so the mock and Postgres implementations are interchangeable behind an env flag.
import { hasDatabase } from './pg'
import type { Discipline, EventType } from '@/lib/types/enums'

export interface CreateEventInput {
  coachId: string
  title: string
  discipline: Discipline
  type: EventType
  capacity: number
  priceCents: number
  levelMinUtr?: number
  levelMaxUtr?: number
  startsAt: string
  durationMinutes: number
  locationName: string
}

export interface CreatedEvent extends CreateEventInput {
  id: string
  occurrenceId: string
}

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
  createEvent(input: CreateEventInput): Promise<CreatedEvent>
}

let cachedMock: Repository | null = null
let cachedPostgres: Repository | null = null

/**
 * Returns the Postgres repository when DATABASE_URL is set, otherwise the in-memory
 * mock. Async so the Postgres implementation (and the `pg` driver) is only loaded
 * when actually needed and never bundled into client code.
 */
export async function getRepository(options: { forceMock?: boolean } = {}): Promise<Repository> {
  if (options.forceMock) {
    if (!cachedMock) {
      const { MockRepository } = await import('./mock_repository')
      cachedMock = new MockRepository()
    }
    return cachedMock
  }
  if (hasDatabase()) {
    if (cachedPostgres) return cachedPostgres
    const { PgRepository } = await import('./pg_repository')
    cachedPostgres = new PgRepository()
    return cachedPostgres
  }
  if (!cachedMock) {
    const { MockRepository } = await import('./mock_repository')
    cachedMock = new MockRepository()
  }
  return cachedMock
}

export function _resetRepositoryForTests() {
  cachedMock = null
  cachedPostgres = null
}
