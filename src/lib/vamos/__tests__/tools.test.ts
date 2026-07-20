import { describe, it, expect } from 'vitest'
import { VAMOS_TOOLS } from '../tools'

describe('VAMOS_TOOLS', () => {
  it('defines 8 tools', () => {
    expect(VAMOS_TOOLS.length).toBe(8)
  })

  it('has unique names', () => {
    const names = VAMOS_TOOLS.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('search_players has correct structure', () => {
    const tool = VAMOS_TOOLS.find(t => t.name === 'search_players')!
    expect(tool.parameters.type).toBe('object')
    expect(tool.parameters.properties.utr_min).toBeDefined()
    expect(tool.parameters.properties.gender.enum).toContain('M')
  })

  it('create_custom_match requires discipline, start_at, location_name', () => {
    const tool = VAMOS_TOOLS.find(t => t.name === 'create_custom_match')!
    expect(tool.parameters.required).toContain('discipline')
    expect(tool.parameters.required).toContain('start_at')
    expect(tool.parameters.required).toContain('location_name')
    expect(tool.parameters.properties.discipline.enum).toContain('mixed_doubles')
  })

  it('get_event_details requires event_id', () => {
    const tool = VAMOS_TOOLS.find(t => t.name === 'get_event_details')!
    expect(tool.parameters.required).toEqual(['event_id'])
  })

  it('all tools have description', () => {
    for (const tool of VAMOS_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(5)
    }
  })

  it('valid tools list includes expected names', () => {
    const expected = ['search_players', 'list_events', 'get_event_details', 'create_custom_match', 'invite_to_match', 'list_payments', 'create_payment', 'send_notification']
    for (const name of expected) {
      expect(VAMOS_TOOLS.some(t => t.name === name)).toBe(true)
    }
  })

  it('discipline enum values cover all 8 disciplines', () => {
    const tool = VAMOS_TOOLS.find(t => t.name === 'create_custom_match')!
    const enumVals = tool.parameters.properties.discipline.enum!
    expect(enumVals).toContain('mens_singles')
    expect(enumVals).toContain('womens_singles')
    expect(enumVals).toContain('mixed_doubles')
    expect(enumVals).toContain('open')
  })
})
