// Expands an offering's weekly pattern into concrete session times (pure, timezone-aware).
import { addDays, addMinutesToTime, weekdayOf, zonedToUtc } from '@/lib/time'

export interface RecurrenceSpec {
  timezone: string
  startDate: string
  startTime: string
  durationMinutes: number
  slotsPerDay: number
  repeatWeekdays: number[] | null
  repeatEveryWeeks: number
  endDate: string | null
}

export interface Occurrence {
  startsAt: Date
  endsAt: Date
}

export const GENERATION_HORIZON_DAYS = 84

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Sunday-based week index of `date` relative to the week containing `anchor`. */
function weekIndex(anchor: string, date: string): number {
  return Math.floor((daysBetween(anchor, date) + weekdayOf(anchor)) / 7)
}

function slotsOn(spec: RecurrenceSpec, date: string): Occurrence[] {
  return Array.from({ length: spec.slotsPerDay }, (_, i) => {
    const start = addMinutesToTime(spec.startTime, i * spec.durationMinutes)
    const startsAt = zonedToUtc(date, start, spec.timezone)
    return { startsAt, endsAt: new Date(startsAt.getTime() + spec.durationMinutes * 60_000) }
  }).filter((o) => o.startsAt.getTime() < zonedToUtc(addDays(date, 1), '00:00', spec.timezone).getTime())
}

/** Session times whose calendar date falls within [from, through] (inclusive). */
export function expand(spec: RecurrenceSpec, from: string, through: string): Occurrence[] {
  const first = from > spec.startDate ? from : spec.startDate
  const last = spec.endDate && spec.endDate < through ? spec.endDate : through
  if (first > last) return []
  if (!spec.repeatWeekdays?.length) return spec.startDate >= first && spec.startDate <= last ? slotsOn(spec, spec.startDate) : []
  const weekdays = new Set(spec.repeatWeekdays)
  const out: Occurrence[] = []
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (weekdays.has(weekdayOf(date)) && weekIndex(spec.startDate, date) % spec.repeatEveryWeeks === 0) out.push(...slotsOn(spec, date))
  }
  return out
}
