import { describe, it, expect } from 'vitest'
import { parseIntent, generateMockResponse } from '../mock_engine'

describe('parseIntent', () => {
  describe('list_events', () => {
    it('detects my schedule', () => {
      expect(parseIntent('what is my schedule').intent).toBe('list_events')
    })
    it('detects next lesson', () => {
      expect(parseIntent('when is my next lesson?').intent).toBe('list_events')
    })
    it('detects calendar', () => {
      expect(parseIntent('show my calendar').intent).toBe('list_events')
    })
    it('detects upcoming', () => {
      expect(parseIntent('upcoming events?').intent).toBe('list_events')
    })
  })

  describe('search_players', () => {
    it('detects find player', () => {
      expect(parseIntent('find player for doubles').intent).toBe('search_players')
    })
    it('parses UTR range', () => {
      const res = parseIntent('find me a player UTR 4-5 near Fremont')
      expect(res.intent).toBe('search_players')
      expect(res.entities.utr_min).toBe(4)
      expect(res.entities.utr_max).toBe(5)
    })
    it('parses single UTR with +/-0.5', () => {
      const res = parseIntent('looking for UTR 4.5 partner')
      expect(res.entities.utr_min).toBe(4.0)
      expect(res.entities.utr_max).toBe(5.0)
    })
    it('parses mixed doubles discipline', () => {
      const res = parseIntent('find mixed doubles game')
      expect(res.entities.discipline).toBe('mixed_doubles')
    })
    it('parses gender mens/womens', () => {
      const mens = parseIntent('find mens doubles player UTR 4-5')
      expect(mens.entities.gender).toBe('M')
      const womens = parseIntent('find womens doubles')
      expect(womens.entities.gender).toBe('F')
    })
    it('handles both mens and womens as any (fixed)', () => {
      const both = parseIntent('find mens and womens doubles players')
      expect(both.entities.gender).toBe('any')
    })
    it('detects hitting partner', () => {
      expect(parseIntent('need a hitting partner').intent).toBe('search_players')
    })
  })

  describe('list_payments', () => {
    it('detects owe', () => {
      expect(parseIntent('who owes me?').intent).toBe('list_payments')
    })
    it('detects payment', () => {
      expect(parseIntent('show my payments').intent).toBe('list_payments')
    })
    it('detects revenue', () => {
      expect(parseIntent('what is my revenue?').intent).toBe('list_payments')
    })
  })

  describe('create_payment_draft', () => {
    it('detects charge intent', () => {
      const res = parseIntent('charge $40 for stringing')
      expect(res.intent).toBe('create_payment_draft')
      // Should parse amount
      expect(res.entities.amount).toBe(4000)
    })
  })

  describe('create_match_draft', () => {
    it('detects book match', () => {
      expect(parseIntent('book a match tomorrow').intent).toBe('create_match_draft')
    })
    it('detects create clinic', () => {
      expect(parseIntent('create a clinic for Saturday').intent).toBe('create_match_draft')
    })
  })

  describe('general_chat', () => {
    it('fallback', () => {
      expect(parseIntent('hello how are you').intent).toBe('general_chat')
    })
  })
})

describe('generateMockResponse', () => {
  it('list_events with results', () => {
    const intent = { intent: 'list_events' as const, entities: {}, confidence: 0.9 }
    const toolResults = { events: [{ title: 'Clinic', start_at: new Date().toISOString() }] }
    const res = generateMockResponse(intent, toolResults)
    expect(res.response).toMatch(/Found|upcoming|2 upcoming/i)
  })
  it('search_players with UTR', () => {
    const intent = { intent: 'search_players' as const, entities: { utr_min: 4, utr_max: 5 }, confidence: 0.85 }
    const res = generateMockResponse(intent)
    expect(res.response).toMatch(/Found 3 players/)
    expect(res.response).toMatch(/UTR 4-5/)
  })
  it('list_payments with payments', () => {
    const intent = { intent: 'list_payments' as const, entities: {}, confidence: 0.8 }
    const toolResults = { payments: [{ amount_cents: 8000, status: 'requires_capture' }] }
    const res = generateMockResponse(intent, toolResults)
    expect(res.response).toContain('1 payments')
  })
  it('create_match_draft requires confirmation', () => {
    const intent = { intent: 'create_match_draft' as const, entities: { discipline: 'mixed_doubles' }, confidence: 0.75 }
    const res = generateMockResponse(intent)
    expect(res.requiresConfirmation).toBe(true)
    expect(res.pendingAction?.tool).toBe('create_custom_match')
  })
  it('create_payment_draft', () => {
    const intent = { intent: 'create_payment_draft' as const, entities: { amount: 4000 }, confidence: 0.7 }
    const res = generateMockResponse(intent)
    expect(res.requiresConfirmation).toBe(true)
    expect(res.response.toLowerCase()).toMatch(/charge/)
    expect(res.pendingAction?.tool).toBe('create_payment')
  })
  it('general_chat fallback', () => {
    const intent = { intent: 'general_chat' as const, entities: {}, confidence: 0.5 }
    const res = generateMockResponse(intent)
    expect(res.response).toMatch(/Vamos!/)
  })
})
