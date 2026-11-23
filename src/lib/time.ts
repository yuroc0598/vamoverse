// Timezone-safe date helpers shared by server and client. Calendar dates are
// 'YYYY-MM-DD' strings, wall times 'HH:MM', zones IANA names.

/** Used where a person has no zone of their own yet (players). US-first product. */
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles'

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    })
    partsFormatters.set(timeZone, f)
  }
  return f
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(instant: Date, timeZone: string) {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(instant).map((x) => [x.type, x.value]))
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: WEEKDAYS.indexOf(p.weekday),
    utcMsOfWallClock: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second),
  }
}

function offsetMs(instant: Date, timeZone: string): number {
  return zonedParts(instant, timeZone).utcMsOfWallClock - Math.floor(instant.getTime() / 1000) * 1000
}

/** The instant at which the wall clock in `timeZone` reads `date time`. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const first = wall - offsetMs(new Date(wall), timeZone)
  return new Date(wall - offsetMs(new Date(first), timeZone))
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function todayIn(timeZone: string, now = new Date()): string {
  return zonedParts(now, timeZone).date
}

/** Calendar date `days` from today in a zone. */
export function daysFromToday(days: number, timeZone = DEFAULT_TIME_ZONE): string {
  return addDays(todayIn(timeZone), days)
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function formatDateTime(instant: Date | string, timeZone: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options,
  }).format(new Date(instant))
}

export function formatTime(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(instant))
}

/** "Tue, Dec 2 · 6:00 – 7:30 PM" */
export function formatSessionRange(startsAt: Date | string, endsAt: Date | string, timeZone: string): string {
  return `${formatDateTime(startsAt, timeZone, { hour: undefined, minute: undefined })} · ${formatTime(startsAt, timeZone)} – ${formatTime(endsAt, timeZone)}`
}

export const US_TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Arizona' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
]
