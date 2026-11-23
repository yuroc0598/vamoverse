import { describe, expect, it } from 'vitest'
import { expand, type RecurrenceSpec } from '@/server/modules/schedule/recurrence'

const base: RecurrenceSpec = {
  timezone: 'America/Los_Angeles', startDate: '2026-12-01', startTime: '18:00', durationMinutes: 90,
  slotsPerDay: 1, repeatWeekdays: null, repeatEveryWeeks: 1, endDate: null,
}
const iso = (list: { startsAt: Date }[]) => list.map((o) => o.startsAt.toISOString())

describe('recurrence', () => {
  it('produces a single session when not repeating', () => {
    expect(iso(expand(base, '2026-11-23', '2027-02-01'))).toEqual(['2026-12-02T02:00:00.000Z'])
    expect(expand(base, '2026-12-02', '2027-02-01')).toEqual([])
  })

  it('repeats on chosen weekdays and keeps local time across DST', () => {
    const spec = { ...base, startDate: '2027-03-01', repeatWeekdays: [2, 4] } // Tue/Thu; DST starts Mar 14, 2027
    const times = iso(expand(spec, '2027-03-01', '2027-03-18'))
    expect(times).toEqual([
      '2027-03-03T02:00:00.000Z', '2027-03-05T02:00:00.000Z', '2027-03-10T02:00:00.000Z', '2027-03-12T02:00:00.000Z',
      '2027-03-17T01:00:00.000Z', '2027-03-19T01:00:00.000Z',
    ])
  })

  it('honors every-other-week, end dates, and the window', () => {
    const spec = { ...base, startDate: '2026-12-01', repeatWeekdays: [2], repeatEveryWeeks: 2, endDate: '2026-12-31' }
    expect(expand(spec, '2026-11-01', '2027-06-01').map((o) => o.startsAt.toISOString().slice(0, 10)))
      .toEqual(['2026-12-02', '2026-12-16', '2026-12-30'])
  })

  it('splits a window into back-to-back open slots', () => {
    const spec = { ...base, durationMinutes: 60, slotsPerDay: 3, startTime: '16:00' }
    const slots = expand(spec, '2026-12-01', '2026-12-01')
    expect(slots.map((s) => [s.startsAt.toISOString(), s.endsAt.toISOString()])).toEqual([
      ['2026-12-02T00:00:00.000Z', '2026-12-02T01:00:00.000Z'],
      ['2026-12-02T01:00:00.000Z', '2026-12-02T02:00:00.000Z'],
      ['2026-12-02T02:00:00.000Z', '2026-12-02T03:00:00.000Z'],
    ])
  })

  it('never lets slots spill past midnight', () => {
    expect(expand({ ...base, startTime: '22:00', durationMinutes: 60, slotsPerDay: 4 }, '2026-12-01', '2026-12-01')).toHaveLength(2)
  })
})
