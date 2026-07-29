// FIXED per review L1, L2, M1, M7, C3 - Canonical enums as single source of truth
export type UserRole = 'coach' | 'student' | 'parent' | 'admin' // admin added per M12
export type Gender = 'M' | 'F' | 'other' | 'unspecified'

// Canonical: social_mixer not social (was drift)
export type EventType = 'private' | 'semi_private' | 'group_clinic' | 'evaluation' | 'camp' | 'tournament' | 'custom_match' | 'social_mixer'
export type Discipline = 'mens_singles' | 'womens_singles' | 'mens_doubles' | 'womens_doubles' | 'mixed_doubles' | 'open_singles' | 'open_doubles' | 'open'
// FIX L2: Separate match format vs tournament structure
export type MatchFormat = 'best_of_3_10pt_tb' | 'pro_set_8_game' | 'fast4' | 'timed_90'
export type TournamentStructure = 'single_elim' | 'round_robin' | 'compass' | 'feed_in' | 'ladder' | 'king_of_court'
export type EventFormat = MatchFormat | TournamentStructure // kept for backward compat but deprecated, use MatchFormat + TournamentStructure
export type ScoringSystem = 'ad' | 'no_ad'
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed'

// FIX H5: Added invited, pending_accept for invitation flow
export type RegistrationStatus = 'invited' | 'pending_accept' | 'registered' | 'waitlisted' | 'cancelled' | 'no_show' | 'completed'

// FIX: Added subscription, package per H9, added chargeback states per C3, FIX N14/N5: Removed disputed - was colliding with internal review vs chargeback
export type PaymentType = 'lesson_auto' | 'event_registration' | 'adhoc' | 'late_fee' | 'no_show' | 'subscription' | 'package'
export type PaymentStatus = 'pending' | 'requires_capture' | 'captured' | 'failed' | 'refunded' | 'cancelled' | 'requires_action' | 'chargeback_open' | 'chargeback_lost' // FIX N14/N5: removed disputed - use internal_review_status for internal disputes, chargeback_* for Stripe
export type InternalReviewStatus = 'hold' | 'disputed_by_student' | 'approved' | 'rejected'

export type ConnectionStatus = 'pending' | 'accepted' | 'blocked' | 'declined'

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'

// FIX M11: Added missing notification types
export type NotificationType = 'event_published' | 'event_updated' | 'event_cancelled' | 'registration_confirmed' | 'waitlist_promoted' | 'reschedule_request' | 'match_invite' | 'match_confirmed' | 'payment_captured' | 'payment_failed' | 'payment_requires_action' | 'new_message' | 'new_review' | 'adhoc_charge' | 'dispute_opened'

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  mens_singles: "Men's Singles",
  womens_singles: "Women's Singles",
  mens_doubles: "Men's Doubles",
  womens_doubles: "Women's Doubles",
  mixed_doubles: "Mixed Doubles",
  open_singles: "Open Singles",
  open_doubles: "Open Doubles",
  open: "Open"
}

export const DISCIPLINE_ICONS: Record<Discipline, string> = {
  mens_singles: "♂",
  womens_singles: "♀",
  mens_doubles: "♂♂",
  womens_doubles: "♀♀",
  mixed_doubles: "♂♀+♂♀",
  open_singles: "●○",
  open_doubles: "●●○○",
  open: "Open"
}

export const MATCH_FORMAT_LABELS: Record<MatchFormat, string> = {
  best_of_3_10pt_tb: "Best of 3 with 10pt TB",
  pro_set_8_game: "Pro Set (8 games)",
  fast4: "Fast4",
  timed_90: "Timed 90min",
}

export const SCORING_LABELS: Record<ScoringSystem, string> = {
  ad: "Ad",
  no_ad: "No-Ad",
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  private: "Private Lesson",
  semi_private: "Semi-Private",
  group_clinic: "Group Clinic",
  evaluation: "Evaluation",
  camp: "Camp",
  tournament: "Tournament",
  custom_match: "Custom Match",
  social_mixer: "Social Mixer"
}
