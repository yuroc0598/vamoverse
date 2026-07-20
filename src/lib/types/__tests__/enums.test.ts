import { describe, it, expect } from 'vitest'
import { DISCIPLINE_LABELS, DISCIPLINE_ICONS, EVENT_TYPE_LABELS } from '../enums'

describe('DISCIPLINE_LABELS', () => {
  it('covers all 8 disciplines', () => {
    const expected = ['mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles', 'open_singles', 'open_doubles', 'open']
    for (const d of expected) {
      expect(DISCIPLINE_LABELS[d as keyof typeof DISCIPLINE_LABELS]).toBeTruthy()
    }
  })
  it('mixed doubles label correct', () => {
    expect(DISCIPLINE_LABELS.mixed_doubles).toBe('Mixed Doubles')
  })
})

describe('DISCIPLINE_ICONS', () => {
  it('has icons for all disciplines', () => {
    expect(DISCIPLINE_ICONS.mens_singles).toBeTruthy()
    expect(DISCIPLINE_ICONS.womens_doubles).toBeTruthy()
    expect(DISCIPLINE_ICONS.mixed_doubles).toContain('♂')
    expect(DISCIPLINE_ICONS.mixed_doubles).toContain('♀')
  })
})

describe('EVENT_TYPE_LABELS', () => {
  it('covers main event types', () => {
    expect(EVENT_TYPE_LABELS.private).toBe('Private Lesson')
    expect(EVENT_TYPE_LABELS.group_clinic).toBe('Group Clinic')
    expect(EVENT_TYPE_LABELS.custom_match).toBe('Custom Match')
    expect(EVENT_TYPE_LABELS.social_mixer).toBe('Social Mixer')
  })
  it('does not use deprecated social label', () => {
    // Old bug was 'social' not 'social_mixer'
    expect((EVENT_TYPE_LABELS as any).social).toBeUndefined()
  })
})
