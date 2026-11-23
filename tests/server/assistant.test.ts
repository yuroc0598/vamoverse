import type Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { setModelClient, type ModelRequest } from '@/server/modules/assistant/model'
import { buildTools } from '@/server/modules/assistant/tools'
import { resetDb } from '../helpers/db'
import { makeProvider, makeSeries, makeUser } from '../helpers/factories'
import { as } from '../helpers/run'

type Block = Anthropic.Beta.BetaContentBlock

/** A model that replays scripted turns and records every request it receives. */
function scripted(turns: ((req: ModelRequest) => Block[])[]) {
  const requests: ModelRequest[] = []
  setModelClient({
    async create(req) {
      requests.push(structuredClone(req))
      const content = turns.shift()?.(req) ?? [{ type: 'text', text: 'ok', citations: null } as Block]
      return {
        id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content,
        stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      } as unknown as Anthropic.Beta.BetaMessage
    },
  })
  return requests
}

const text = (t: string) => ({ type: 'text', text: t, citations: null }) as Block
const tool = (id: string, name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id, name, input }) as Block
const lastToolResults = (req: ModelRequest) => (req.messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])

beforeEach(resetDb)
afterEach(() => setModelClient(null))

describe('assistant tools', () => {
  it('exposes only commands the user may run, with confirmation summaries on changes', async () => {
    const player = await makeUser('Maya')
    const coach = await makeProvider()
    const playerTools = buildTools(player).tools.map((t) => t.name)
    const coachTools = buildTools(coach)
    expect(playerTools).toContain('bookings__create')
    expect(playerTools).not.toContain('sessions__cancelDay')
    expect(playerTools).not.toContain('assistant__send')
    expect(coachTools.tools.map((t) => t.name)).toContain('sessions__cancelDay')
    const cancelDay = coachTools.tools.find((t) => t.name === 'sessions__cancelDay')!
    expect(cancelDay.input_schema.required).toEqual(expect.arrayContaining(['date', 'summary']))
    expect(coachTools.tools.find((t) => t.name === 'sessions__list')!.input_schema.required ?? []).not.toContain('summary')
    expect(coachTools.tools.every((t) => /^[a-zA-Z0-9_-]{1,64}$/.test(t.name))).toBe(true)
  })
})

describe('assistant conversations', () => {
  it('runs lookups immediately and answers from real data', async () => {
    const coach = await makeProvider()
    await makeSeries(coach, { title: 'Tuesday Clinic' })
    const requests = scripted([
      () => [tool('t1', 'sessions__list', { days: 7 })],
      (req) => [text(lastToolResults(req)[0].content!.toString().includes('Tuesday Clinic') ? 'You have Tuesday Clinic this week.' : 'Nothing found.')],
    ])
    const reply = await as(coach)('assistant.send', { text: 'What do I have this week?' })
    expect(reply).toMatchObject({ reply: 'You have Tuesday Clinic this week.', pendingAction: null })
    expect(requests).toHaveLength(2)
    expect(requests[0].output_config).toEqual({ effort: 'medium' })
  })

  it('never runs a change until the user confirms, then runs it as the user exactly once', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    scripted([
      () => [text('I’ll cancel it.'), tool('t1', 'sessions__cancel', { sessionId, reason: 'Rain', summary: 'Cancel tonight’s clinic (rain)' })],
      () => [text('Confirm and I’ll cancel tonight’s clinic and tell everyone.')],
    ])
    const reply = await as(coach)('assistant.send', { text: 'Rain tonight, cancel my clinic' })
    expect(reply.pendingAction?.actions).toEqual([{
      command: 'sessions.cancel', note: 'Cancel tonight’s clinic (rain)',
      description: expect.stringMatching(/^Cancel one session \(rain, illness\): Clinic, .* · reason: Rain$/),
    }])
    expect(await db.query(`SELECT status FROM sessions WHERE id = $1`, [sessionId])).toEqual([{ status: 'scheduled' }])

    const stranger = await makeProvider('Other')
    await expect(as(stranger)('assistant.resolve', { actionId: reply.pendingAction!.id, decision: 'confirm' })).rejects.toMatchObject({ code: 'conflict' })
    const { outcomes } = await as(coach)('assistant.resolve', { actionId: reply.pendingAction!.id, decision: 'confirm' })
    expect(outcomes).toEqual([{ summary: expect.stringContaining('Cancel one session'), ok: true, message: 'Done' }])
    expect(await db.query(`SELECT status FROM sessions WHERE id = $1`, [sessionId])).toEqual([{ status: 'cancelled' }])
    await expect(as(coach)('assistant.resolve', { actionId: reply.pendingAction!.id, decision: 'confirm' })).rejects.toMatchObject({ code: 'conflict' })
  })

  it('enforces permissions when a confirmed change runs, and reports tool errors to the model', async () => {
    const coach = await makeProvider()
    const other = await makeProvider('Other')
    const { sessionIds: [othersSession] } = await makeSeries(other)
    const requests = scripted([
      () => [tool('t1', 'sessions__get', { sessionId: 'ses_missing' })],
      () => [tool('t2', 'sessions__cancel', { sessionId: othersSession, summary: 'Cancel a session' })],
      () => [text('Confirm?')],
    ])
    const reply = await as(coach)('assistant.send', { text: 'cancel that session' })
    expect(lastToolResults(requests[1])[0]).toMatchObject({ is_error: true, content: 'Session not found.' })
    const { outcomes } = await as(coach)('assistant.resolve', { actionId: reply.pendingAction!.id, decision: 'confirm' })
    expect(outcomes[0]).toMatchObject({ ok: false, message: 'Session not found.' })
    expect(await db.query(`SELECT status FROM sessions WHERE id = $1`, [othersSession])).toEqual([{ status: 'scheduled' }])
  })

  it('keeps history append-only, replays it in order, and starts over on reset', async () => {
    const maya = await makeUser('Maya')
    const requests = scripted([() => [text('Hi Maya!')], () => [text('You have nothing booked.')], () => [text('Fresh start.')]])
    await as(maya)('assistant.send', { text: 'hello' })
    await as(maya)('assistant.send', { text: 'what do I have?' })
    expect(requests[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(requests[1].messages[1].content).toEqual([text('Hi Maya!')])
    expect((await as(maya)('assistant.history', {})).messages.map((m) => m.text)).toEqual(['hello', 'Hi Maya!', 'what do I have?', 'You have nothing booked.'])
    await as(maya)('assistant.reset', {})
    expect((await as(maya)('assistant.history', {})).messages).toEqual([])
    await as(maya)('assistant.send', { text: 'again' })
    expect(requests[2].messages).toHaveLength(1)
  })

  it('treats a new message as declining an unconfirmed proposal', async () => {
    const coach = await makeProvider()
    const { sessionIds: [sessionId] } = await makeSeries(coach)
    const requests = scripted([
      () => [tool('t1', 'sessions__cancel', { sessionId, summary: 'Cancel it' })],
      () => [text('Confirm?')],
      () => [text('OK, leaving it.')],
    ])
    const first = await as(coach)('assistant.send', { text: 'cancel' })
    await as(coach)('assistant.send', { text: 'actually never mind' })
    expect(requests[2].messages.at(-1)!.content).toBe('(I didn\'t confirm the proposed changes.) actually never mind')
    await expect(as(coach)('assistant.resolve', { actionId: first.pendingAction!.id, decision: 'confirm' })).rejects.toMatchObject({ code: 'conflict' })
  })

  it('reports when the assistant is not configured', async () => {
    const maya = await makeUser('Maya')
    await expect(as(maya)('assistant.send', { text: 'hi' })).rejects.toMatchObject({ code: 'unavailable' })
    expect((await as(maya)('assistant.history', {})).enabled).toBe(false)
  })
})
