// FIX H2: Capacity enforcement transactional - prevents overbooking race
// In prod, this would be a Postgres function with FOR UPDATE SKIP LOCKED
// Production uses SELECT ... FOR UPDATE to lock occurrence row, then COUNT,
// then INSERT atomically. Waitlist promotion uses FOR UPDATE SKIP LOCKED
// to avoid blocking: SELECT first waitlisted FOR UPDATE SKIP LOCKED, update.

export interface RegistrationAttempt {
  occurrenceId: string
  studentId: string
  eventId: string
}

export interface RegistrationResult {
  success: boolean
  status: 'registered' | 'waitlisted'
  registrationId?: string
  error?: string
}

export interface MockRegistration {
  occurrenceId: string
  studentId: string
  eventId: string
  status: 'registered' | 'invited' | 'waitlisted' | 'cancelled'
  registrationId: string
  createdAt: string
}

export const mockRegistrations: MockRegistration[] = []

export function clearMockRegistrations() {
  mockRegistrations.length = 0
}

export function getServerCount(occurrenceId: string): number {
  return mockRegistrations.filter(
    r => r.occurrenceId === occurrenceId && ['registered', 'invited'].includes(r.status)
  ).length
}

/**
 * Transactional registration that prevents TOCTOU overbooking.
 * Server is source of truth: count comes from DB (mockRegistrations here),
 * NOT from client-provided currentCount.
 *
 * Production SQL:
 *   SELECT ... FOR UPDATE; SELECT COUNT(*) ...; INSERT ...
 *   Waitlist promotion: SELECT ... FOR UPDATE SKIP LOCKED
 *
 * Backward compat: old signature (occurrenceId, studentId, eventId, currentCount, capacity)
 * is still accepted but currentCount is ignored - server count wins.
 */
export async function registerWithCapacityCheck(
  occurrenceId: string,
  studentId: string,
  eventId: string,
  capacityOrCurrentCount: number,
  maybeCapacity?: number
): Promise<RegistrationResult> {
  let capacity: number
  if (typeof maybeCapacity === 'number') {
    capacity = maybeCapacity
  } else {
    capacity = capacityOrCurrentCount
  }

  if (!Number.isFinite(capacity) || capacity < 0) {
    return { success: false, status: 'waitlisted', error: 'Invalid capacity' }
  }

  if (!occurrenceId || !studentId || !eventId) {
    return { success: false, status: 'waitlisted', error: 'Missing ids' }
  }

  const existing = mockRegistrations.find(
    r => r.occurrenceId === occurrenceId && r.studentId === studentId && ['registered', 'invited'].includes(r.status)
  )
  if (existing) {
    return { success: true, status: 'registered', registrationId: existing.registrationId }
  }

  const serverCount = getServerCount(occurrenceId)
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  if (serverCount >= capacity) {
    const regId = `reg_wait_${uniqueSuffix}`
    mockRegistrations.push({
      occurrenceId,
      studentId,
      eventId,
      status: 'waitlisted',
      registrationId: regId,
      createdAt: new Date().toISOString(),
    })
    return { success: true, status: 'waitlisted', registrationId: regId }
  }

  const regId = `reg_${uniqueSuffix}`
  mockRegistrations.push({
    occurrenceId,
    studentId,
    eventId,
    status: 'registered',
    registrationId: regId,
    createdAt: new Date().toISOString(),
  })

  return { success: true, status: 'registered', registrationId: regId }
}
