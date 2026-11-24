// Booking status groups, defined once and reused in TypeScript and SQL.
export type BookingStatus =
  | 'held' | 'invited' | 'requested' | 'confirmed' | 'waitlisted' | 'offered'
  | 'cancelled' | 'late_cancelled' | 'no_show' | 'attended' | 'expired' | 'declined'

/** Statuses that occupy one of the session's seats. */
export const SEAT_STATUSES: BookingStatus[] = ['held', 'invited', 'confirmed', 'offered', 'attended']
/** Statuses where the booking is still in play (counts toward "one open booking per player"). */
export const OPEN_STATUSES: BookingStatus[] = ['held', 'invited', 'requested', 'confirmed', 'waitlisted', 'offered']

const sqlList = (statuses: readonly string[]) => `(${statuses.map((s) => `'${s}'`).join(',')})`
export const SEAT_SQL = sqlList(SEAT_STATUSES)
export const OPEN_SQL = sqlList(OPEN_STATUSES)
/**
 * SQL condition (b = bookings, s = sessions): an open booking whose session hasn't settled yet,
 * either upcoming or ended and still waiting for completion (attendance and charges).
 */
export const UNSETTLED_SQL = `s.status = 'scheduled' AND b.status IN ${OPEN_SQL}`
/** Tells people why a just-ended session still blocks them (see UNSETTLED_SQL). */
export const UNSETTLED_NOTE = 'Sessions that just ended settle within a few hours.'
