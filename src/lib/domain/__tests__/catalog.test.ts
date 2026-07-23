import { describe, it, expect } from 'vitest'
import {
  CATALOG_PLAYERS,
  CATALOG_EVENTS,
  CATALOG_PAYMENTS,
  getPlayer,
  listCoachPaymentsUi,
  listHittingPartners,
  toApiEvent,
  toApiPayment,
  toApiPlayer,
} from '../catalog'

const ids = (arr: { id: string }[]) => arr.map((x) => x.id)
const hasDupes = (xs: string[]) => new Set(xs).size !== xs.length

describe('catalog: referential integrity (single source of truth)', () => {
  it('has no duplicate ids', () => {
    expect(hasDupes(ids(CATALOG_PLAYERS))).toBe(false)
    expect(hasDupes(ids(CATALOG_EVENTS))).toBe(false)
    expect(hasDupes(ids(CATALOG_PAYMENTS))).toBe(false)
  })

  it('every payment references real coach + student players', () => {
    for (const p of CATALOG_PAYMENTS) {
      expect(getPlayer(p.coachId), `coach ${p.coachId}`).toBeDefined()
      expect(getPlayer(p.studentId), `student ${p.studentId}`).toBeDefined()
    }
  })

  it('every parentId references a real parent player', () => {
    for (const p of CATALOG_PLAYERS) {
      if (p.parentId) {
        const parent = getPlayer(p.parentId)
        expect(parent, `parent ${p.parentId}`).toBeDefined()
        expect(parent?.role).toBe('parent')
      }
    }
  })

  it('all UTRs are within the valid 1-16.5 range', () => {
    for (const p of CATALOG_PLAYERS) {
      for (const utr of [p.utrSingles, p.utrDoubles].filter((x): x is number => x != null)) {
        expect(utr).toBeGreaterThanOrEqual(1)
        expect(utr).toBeLessThanOrEqual(16.5)
      }
    }
    for (const e of CATALOG_EVENTS) {
      if (e.levelMinUtr != null) expect(e.levelMinUtr).toBeGreaterThanOrEqual(1)
      if (e.levelMaxUtr != null) expect(e.levelMaxUtr).toBeLessThanOrEqual(16.5)
      if (e.levelMinUtr != null && e.levelMaxUtr != null) expect(e.levelMinUtr).toBeLessThanOrEqual(e.levelMaxUtr)
    }
  })
})

describe('catalog: adapters produce consumer-consistent shapes', () => {
  it('toApiEvent keeps is_paid in sync with price and start before end', () => {
    for (const e of CATALOG_EVENTS) {
      const api = toApiEvent(e)
      expect(api.is_paid).toBe(api.price_cents > 0)
      expect(new Date(api.start_at).getTime()).toBeLessThan(new Date(api.end_at).getTime())
      expect(api.capacity).toBeGreaterThan(0)
    }
  })

  it('toApiPlayer exposes required search fields', () => {
    const api = toApiPlayer(CATALOG_PLAYERS[1])
    expect(api.id).toBeTruthy()
    expect(api.gender).toMatch(/M|F|other|unspecified/)
    expect(typeof api.utr_singles).toBe('number')
    expect(typeof api.distance_miles).toBe('number')
  })

  it('toApiPayment attaches auto_capture_at only when an offset is set', () => {
    const withOffset = CATALOG_PAYMENTS.find((p) => p.autoCaptureOffsetMinutes != null)!
    const without = CATALOG_PAYMENTS.find((p) => p.autoCaptureOffsetMinutes == null)!
    expect(toApiPayment(withOffset).auto_capture_at).toBeTruthy()
    expect(toApiPayment(without).auto_capture_at).toBeUndefined()
  })

  it('listCoachPaymentsUi resolves student names (not raw ids) and scopes to coach', () => {
    const rows = listCoachPaymentsUi('coach_1')
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.coach_id).toBe('coach_1')
      expect(r.student_name).not.toMatch(/^student_/) // resolved to a display name
      expect(r.student_name).toBeTruthy()
    }
  })

  it('listHittingPartners excludes the viewer and parents', () => {
    const partners = listHittingPartners('student_1')
    const partnerIds = partners.map((p) => p.id)
    expect(partnerIds).not.toContain('student_1')
    expect(partnerIds).not.toContain('parent_1')
    expect(partners.length).toBeGreaterThan(0)
  })
})
