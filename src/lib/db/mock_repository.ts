// In-memory repository — the zero-infra default. Backed by the canonical catalog
// (for capacity) and the existing capacity mock store (for registrations), so it
// stays consistent with the rest of the mock demo.
import type { Repository, RegisterResult, OccurrenceCounts } from './repository'
import { registerWithCapacityCheck, getServerCount, mockRegistrations } from '@/lib/utils/capacity'
import { getEvent } from '@/lib/domain/catalog'

const DEFAULT_CAPACITY = 4

function capacityForEvent(eventId: string): number {
  return getEvent(eventId)?.capacity ?? DEFAULT_CAPACITY
}

export class MockRepository implements Repository {
  readonly kind = 'mock' as const

  async registerForOccurrence(occurrenceId: string, studentId: string, eventId: string): Promise<RegisterResult> {
    const capacity = capacityForEvent(eventId)
    const res = await registerWithCapacityCheck(occurrenceId, studentId, eventId, capacity)
    if (!res.success) {
      throw new Error(res.error || 'registration_failed')
    }
    return { registrationId: res.registrationId!, status: res.status }
  }

  async getOccurrenceCounts(occurrenceId: string): Promise<OccurrenceCounts> {
    const registered = getServerCount(occurrenceId)
    const waitlisted = mockRegistrations.filter(
      (r) => r.occurrenceId === occurrenceId && r.status === 'waitlisted'
    ).length
    // Best-effort capacity: derive from the first registration's event.
    const first = mockRegistrations.find((r) => r.occurrenceId === occurrenceId)
    const capacity = first ? capacityForEvent(first.eventId) : DEFAULT_CAPACITY
    return { registered, waitlisted, capacity }
  }
}
