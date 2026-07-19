// FIX H2: Capacity enforcement transactional - prevents overbooking race
// In prod, this would be a Postgres function with FOR UPDATE SKIP LOCKED

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

/**
 * FIX H2: Transactional registration that prevents overbooking
 * Production SQL:
 * 
 * CREATE OR REPLACE FUNCTION register_for_occurrence(
 *   p_occurrence_id uuid,
 *   p_student_id uuid,
 *   p_event_id uuid
 * ) RETURNS uuid AS $$
 * DECLARE
 *   v_capacity int;
 *   v_count int;
 *   v_registration_id uuid;
 * BEGIN
 *   -- Lock the occurrence row to serialize concurrent registrations
 *   SELECT COALESCE(capacity_override, e.capacity) INTO v_capacity
 *   FROM event_occurrences eo
 *   JOIN events e ON e.id = eo.event_id
 *   WHERE eo.id = p_occurrence_id
 *   FOR UPDATE; -- blocks other TX trying to register simultaneously
 *
 *   -- Count confirmed registrations (registered + invited)
 *   SELECT COUNT(*) INTO v_count
 *   FROM event_registrations
 *   WHERE occurrence_id = p_occurrence_id
 *   AND status IN ('registered','invited');
 *
 *   IF v_count >= v_capacity THEN
 *     -- Full, add to waitlist atomically
 *     INSERT INTO event_registrations (event_id, occurrence_id, student_id, status)
 *     VALUES (p_event_id, p_occurrence_id, p_student_id, 'waitlisted')
 *     RETURNING id INTO v_registration_id;
 *     RETURN v_registration_id; -- waitlisted
 *   ELSE
 *     -- Has space
 *     INSERT INTO event_registrations (event_id, occurrence_id, student_id, status)
 *     VALUES (p_event_id, p_occurrence_id, p_student_id, 'registered')
 *     RETURNING id INTO v_registration_id;
 *     RETURN v_registration_id;
 *   END IF;
 * END;
 * $$ LANGUAGE plpgsql;
 *
 * Waitlist promotion also needs TX:
 * - When someone cancels, SELECT first waitlisted FOR UPDATE SKIP LOCKED, update to registered
 */

// Mock implementation
export async function registerWithCapacityCheck(
  occurrenceId: string,
  studentId: string,
  eventId: string,
  currentCount: number,
  capacity: number
): Promise<RegistrationResult> {
  // Simulate row lock with check + insert atomically
  // In real DB this is one transaction
  
  if (currentCount >= capacity) {
    // Waitlist path
    return {
      success: true,
      status: 'waitlisted',
      registrationId: `reg_wait_${Date.now()}`
    }
  }

  return {
    success: true,
    status: 'registered',
    registrationId: `reg_${Date.now()}`
  }
}

// FIX M1: Reconciled custom match model - use match_slots + invitations, not both slot columns and team A/B confusion
export interface MatchSlot {
  slotNumber: 1 | 2 | 3 | 4
  team: 'A' | 'B'
  occupantId?: string
  status: 'empty' | 'invited' | 'occupied'
  invitationId?: string
}

// FIX M2: Normalized conversations - pick one model
// We choose conversations + conversation_members + messages
export interface Conversation {
  id: string
  type: 'dm' | 'group' | 'coach_broadcast'
  eventId?: string
  occurrenceId?: string
  coachId?: string
  memberIds: string[]
  createdAt: Date
}

export function getConversationMembers(conversation: Conversation, allUsers: any[]) {
  return allUsers.filter(u => conversation.memberIds.includes(u.id))
}
