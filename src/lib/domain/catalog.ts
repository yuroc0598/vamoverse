/**
 * Canonical domain catalog — the single source of truth for demo/mock reference data.
 *
 * Before this module, the same players (Maya/Sarah/Leo/Emma/Coach Alex) and events
 * (evt_1..evt_4) were redefined as inline literals in the Vamos chat route, the
 * events/play/payments pages and events/[id], each with drifted UTRs, ids, capacities
 * and prices. Everything now reads from here through typed adapters so the app can
 * never disagree with itself, and there is one obvious place to point at a real DB.
 */
import type {
  Discipline,
  EventType,
  Gender,
  MatchFormat,
  PaymentStatus,
  PaymentType,
  ScoringSystem,
  UserRole,
} from '@/lib/types/enums'

export interface CatalogPlayer {
  id: string
  name: string
  displayName: string
  email: string
  role: UserRole
  gender: Gender
  utrSingles?: number
  utrDoubles?: number
  ntrp?: number
  parentId?: string
  distanceMiles?: number
  goals?: string
}

export interface CatalogEvent {
  id: string
  title: string
  discipline: Discipline
  type: EventType
  /** Hours from "now" the occurrence starts; resolved to an ISO time at read time. */
  startOffsetHours: number
  durationMinutes: number
  capacity: number
  registeredCount: number
  priceCents: number
  levelMinUtr?: number
  levelMaxUtr?: number
  locationName: string
  locationAddress: string
  matchFormat?: MatchFormat
  scoringSystem?: ScoringSystem
}

export interface CatalogPayment {
  id: string
  coachId: string
  studentId: string
  amountCents: number
  type: PaymentType
  status: PaymentStatus
  description: string
  /** Minutes from "now" the payment auto-captures; resolved at read time. */
  autoCaptureOffsetMinutes?: number
}

// ---------------------------------------------------------------------------
// Canonical data
// ---------------------------------------------------------------------------

export const CATALOG_PLAYERS: CatalogPlayer[] = [
  { id: 'coach_1', name: 'Coach Alex', displayName: 'Coach Alex', email: 'coach@demo.com', role: 'coach', gender: 'M', utrSingles: 6.2, utrDoubles: 6.0, distanceMiles: 0.1, goals: 'Coach' },
  { id: 'student_1', name: 'Maya', displayName: 'Maya', email: 'maya@demo.com', role: 'student', gender: 'F', utrSingles: 4.5, utrDoubles: 4.2, ntrp: 3.5, distanceMiles: 0, goals: 'League Prep' },
  { id: 'student_2', name: 'Sarah', displayName: 'Sarah', email: 'sarah@demo.com', role: 'student', gender: 'F', utrSingles: 4.8, utrDoubles: 4.5, ntrp: 4.0, distanceMiles: 0.3, goals: 'League Prep' },
  { id: 'student_3', name: 'Leo', displayName: 'Leo (Junior)', email: 'leo@demo.com', role: 'student', gender: 'M', utrSingles: 4.5, utrDoubles: 4.0, ntrp: 3.5, parentId: 'parent_1', distanceMiles: 1.2, goals: 'Tournament' },
  { id: 'student_4', name: 'Emma', displayName: 'Emma (Junior)', email: 'emma@demo.com', role: 'student', gender: 'F', utrSingles: 4.2, utrDoubles: 3.9, ntrp: 3.0, parentId: 'parent_1', distanceMiles: 0.8, goals: 'Fun' },
  { id: 'parent_1', name: 'Dave', displayName: 'Dave (Parent)', email: 'dave@demo.com', role: 'parent', gender: 'M' },
]

export const CATALOG_EVENTS: CatalogEvent[] = [
  { id: 'evt_1', title: 'Adult 3.5 Doubles Clinic', discipline: 'open_doubles', type: 'group_clinic', startOffsetHours: 24, durationMinutes: 90, capacity: 8, registeredCount: 6, priceCents: 4000, levelMinUtr: 3.5, levelMaxUtr: 5.0, locationName: 'Fremont Tennis Center', locationAddress: 'Fremont, CA 94536 - Court 2', matchFormat: 'best_of_3_10pt_tb', scoringSystem: 'no_ad' },
  { id: 'evt_2', title: 'Mixed Doubles - Needs 1F UTR 4-5', discipline: 'mixed_doubles', type: 'custom_match', startOffsetHours: 48, durationMinutes: 120, capacity: 4, registeredCount: 3, priceCents: 0, levelMinUtr: 4, levelMaxUtr: 5, locationName: 'Fremont HS Court 2', locationAddress: 'Fremont, CA', matchFormat: 'pro_set_8_game', scoringSystem: 'ad' },
  { id: 'evt_3', title: 'Private Lesson - Leo (Junior)', discipline: 'open_singles', type: 'private', startOffsetHours: 0, durationMinutes: 60, capacity: 1, registeredCount: 1, priceCents: 8000, locationName: 'Central Park Courts', locationAddress: 'Fremont, CA', matchFormat: 'timed_90' },
  { id: 'evt_4', title: 'Womens Doubles Ladder - Round Robin', discipline: 'womens_doubles', type: 'tournament', startOffsetHours: 72, durationMinutes: 180, capacity: 12, registeredCount: 9, priceCents: 3500, levelMinUtr: 4, levelMaxUtr: 6, locationName: 'Bay Club', locationAddress: 'Fremont, CA' },
]

export const CATALOG_PAYMENTS: CatalogPayment[] = [
  { id: 'pay_1', coachId: 'coach_1', studentId: 'student_3', amountCents: 8000, type: 'lesson_auto', status: 'requires_capture', description: 'Private Lesson Mon 3pm', autoCaptureOffsetMinutes: 2 },
  { id: 'pay_2', coachId: 'coach_1', studentId: 'student_1', amountCents: 4000, type: 'event_registration', status: 'captured', description: 'Group Clinic Sat 9am' },
  { id: 'pay_3', coachId: 'coach_1', studentId: 'student_2', amountCents: 4000, type: 'adhoc', status: 'captured', description: 'Stringing' },
  { id: 'pay_4', coachId: 'coach_1', studentId: 'student_1', amountCents: 4000, type: 'late_fee', status: 'pending', description: 'Late cancel <24h' },
]

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function listPlayers(): CatalogPlayer[] {
  return CATALOG_PLAYERS
}

export function listStudents(): CatalogPlayer[] {
  return CATALOG_PLAYERS.filter((p) => p.role === 'student')
}

export function getPlayer(id: string): CatalogPlayer | undefined {
  return CATALOG_PLAYERS.find((p) => p.id === id)
}

export function playerName(id: string): string {
  return getPlayer(id)?.displayName ?? id
}

export function listEvents(): CatalogEvent[] {
  return CATALOG_EVENTS
}

export function getEvent(id: string): CatalogEvent | undefined {
  return CATALOG_EVENTS.find((e) => e.id === id)
}

export function listPayments(): CatalogPayment[] {
  return CATALOG_PAYMENTS
}

// ---------------------------------------------------------------------------
// Adapters — produce the exact (snake_case / simplified) shapes each surface uses,
// so callers never hand-roll a divergent literal again.
// ---------------------------------------------------------------------------

/** Shape consumed by the Vamos chat route player search + UI avatars. */
export function toApiPlayer(p: CatalogPlayer) {
  return {
    id: p.id,
    name: p.name,
    display_name: p.displayName,
    gender: p.gender,
    utr_singles: p.utrSingles ?? 0,
    utr_doubles: p.utrDoubles ?? 0,
    avatar: '',
    distance_miles: p.distanceMiles ?? 0,
  }
}

/** Shape consumed by EventCard / events pages / the chat route event list. */
export function toApiEvent(e: CatalogEvent) {
  const start = new Date(Date.now() + e.startOffsetHours * 3600 * 1000)
  const end = new Date(start.getTime() + e.durationMinutes * 60 * 1000)
  return {
    id: e.id,
    title: e.title,
    discipline: e.discipline,
    type: e.type,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    capacity: e.capacity,
    registered_count: e.registeredCount,
    price_cents: e.priceCents,
    is_paid: e.priceCents > 0,
    level_min_utr: e.levelMinUtr,
    level_max_utr: e.levelMaxUtr,
    location_name: e.locationName,
    location_address: e.locationAddress,
    format: e.matchFormat,
    scoring_system: e.scoringSystem,
  }
}

/** Snake_case payment shape used by the Vamos chat route. */
export function toApiPayment(p: CatalogPayment) {
  return {
    id: p.id,
    coach_id: p.coachId,
    student_id: p.studentId,
    amount_cents: p.amountCents,
    type: p.type,
    status: p.status,
    description: p.description,
    auto_capture_at:
      p.autoCaptureOffsetMinutes != null
        ? new Date(Date.now() + p.autoCaptureOffsetMinutes * 60 * 1000).toISOString()
        : undefined,
  }
}

/** Richer payment shape used by the coach-facing payments page (resolves student name). */
export function toUiPayment(p: CatalogPayment) {
  return {
    ...toApiPayment(p),
    student_name: playerName(p.studentId),
    created_at: new Date().toISOString(),
  }
}

export function listCoachPaymentsUi(coachId: string) {
  return listPayments()
    .filter((p) => p.coachId === coachId)
    .map(toUiPayment)
}

export interface RosterPlayer {
  id: string
  gender: 'M' | 'F' | 'other'
  name?: string
  utr?: number
}

/** Simplified roster/partner-card shape used by the play page and events/[id]. */
export function toRosterPlayer(p: CatalogPlayer): RosterPlayer {
  return {
    id: p.id,
    gender: p.gender === 'unspecified' ? 'other' : p.gender,
    name: p.displayName,
    utr: p.utrDoubles ?? p.utrSingles,
  }
}

/** Hitting-partner card shape used by the play page's partner finder. */
export function toPartnerCard(p: CatalogPlayer) {
  return {
    id: p.id,
    name: p.displayName,
    gender: p.gender,
    utr: p.utrSingles ?? 0,
    distance: p.distanceMiles ?? 0,
    goals: p.goals ?? '',
  }
}

/** Everyone the given user could hit with (other students + coaches). */
export function listHittingPartners(excludeId: string) {
  return listPlayers()
    .filter((p) => p.id !== excludeId && p.role !== 'parent')
    .map(toPartnerCard)
}
