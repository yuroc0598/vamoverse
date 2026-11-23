// The assistant: Claude with the product's commands as tools. Lookups run immediately;
// changes become one pending action the user confirms, then run as the user.
import type Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_TIME_ZONE, formatDateTime } from '@/lib/time'
import { logger } from '@/lib/logger'
import { maybeOne, tx, type Db } from '../../db'
import { AppError, fail } from '../../errors'
import { newId } from '../../ids'
import { enforceRateLimit } from '../../ratelimit'
import type { Actor } from '../users/accounts'
import { modelClient } from './model'
import { describeAction } from './describe'
import { buildTools } from './tools'

type MessageParam = Anthropic.Beta.BetaMessageParam
type Content = Anthropic.Beta.BetaMessageContentParam
/** What we store: only user and assistant turns, appended in order. */
interface StoredMessage { role: 'user' | 'assistant'; content: Content }
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam

const MAX_TURNS = 8
const THREAD_MAX_MESSAGES = 60
const THREAD_IDLE_HOURS = 12
const MAX_RESULT_CHARS = 15_000
const ACTION_TTL_MINUTES = 30

const SYSTEM = `You are the assistant inside Vamoverse, an app where tennis coaches and paid hitting partners run lessons, clinics, and hitting sessions, and where players and parents book them.

How to work:
- Be brief and concrete. Plain words, no jargon, no markdown headings.
- Use tools to look things up. Never guess ids, times, names, prices, or who is booked; find them with a list or get tool first.
- Interpret dates and times in the user's time zone (given below). Session times you send to tools are local wall-clock dates (YYYY-MM-DD) and times (HH:MM).
- Money amounts in tools are in cents ($40 = 4000).
- To change anything, call the tool directly. Every change waits for the user to confirm it, so don't ask "should I?" first; propose it with a clear summary. You can propose several changes in one reply.
- Never say a change is done until you see the confirmation results.
- If something can't be done with your tools, say so briefly and point to where in the app to do it.
- Juniors are always managed by their parent or guardian; never contact or address a junior directly.`

export interface PendingAction {
  id: string
  /** `description` is written by the server from the real input; `note` is the model's wording. */
  actions: { command: string; description: string; note: string }[]
}

export interface AssistantReply {
  threadId: string
  reply: string
  pendingAction: PendingAction | null
}

interface StoredAction { toolUseId: string; command: string; input: Record<string, unknown>; summary: string; description: string }

function contextBlock(actor: Actor, timezone: string): string {
  const roles = [actor.providerId ? 'coach/hitter (provider)' : null, 'player', 'parent of any juniors they manage'].filter(Boolean).join(', ')
  return `Now: ${formatDateTime(new Date(), timezone, { year: 'numeric' })} (${timezone}). User: ${actor.displayName}; can act as: ${roles}.`
}

async function userTimezone(db: Db, actor: Actor): Promise<string> {
  if (!actor.providerId) return DEFAULT_TIME_ZONE
  return (await maybeOne<{ tz: string }>(db, `SELECT timezone AS tz FROM providers WHERE id = $1`, [actor.providerId]))?.tz ?? DEFAULT_TIME_ZONE
}

/** The thread the user is in: their latest one, unless it's long, idle, or they started over. */
async function activeThread(db: Db, userId: string): Promise<{ threadId: string; messages: number } | null> {
  return maybeOne(db,
    `SELECT m.thread_id AS "threadId", (SELECT count(*) FROM assistant_messages x WHERE x.thread_id = m.thread_id)::int AS messages
     FROM assistant_messages m JOIN users u ON u.id = m.user_id
     WHERE m.user_id = $1 AND m.created_at > now() - make_interval(hours => $2)
       AND (u.assistant_reset_at IS NULL OR m.created_at > u.assistant_reset_at)
     ORDER BY m.created_at DESC LIMIT 1`, [userId, THREAD_IDLE_HOURS])
}

async function currentThread(db: Db, userId: string): Promise<string> {
  const active = await activeThread(db, userId)
  return active && active.messages < THREAD_MAX_MESSAGES ? active.threadId : newId('ath')
}

async function history(db: Db, userId: string, threadId: string): Promise<StoredMessage[]> {
  return db.query<StoredMessage>(
    `SELECT role, content FROM assistant_messages WHERE user_id = $1 AND thread_id = $2 ORDER BY created_at`, [userId, threadId])
}

async function append(db: Db, userId: string, threadId: string, message: StoredMessage): Promise<void> {
  await db.query(`INSERT INTO assistant_messages (id, user_id, thread_id, role, content) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [newId('asm'), userId, threadId, message.role, JSON.stringify(message.content)])
}

function serializeResult(result: unknown): string {
  const text = JSON.stringify(result ?? null)
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated; ask a narrower question)` : text
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
}

/** Closes any unconfirmed proposal in the thread (the user moved on). Returns whether one was open. */
async function dropOpenAction(db: Db, userId: string, threadId: string): Promise<boolean> {
  const rows = await db.query(`UPDATE assistant_pending_actions SET consumed_at = now() WHERE user_id = $1 AND thread_id = $2 AND consumed_at IS NULL RETURNING id`, [userId, threadId])
  return rows.length > 0
}

export async function sendToAssistant(db: Db, actor: Actor, text: string, ip: string | null): Promise<AssistantReply> {
  await enforceRateLimit(db, `assistant:${actor.userId}`, 60, 3600)
  const model = modelClient()
  const threadId = await currentThread(db, actor.userId)
  const timezone = await userTimezone(db, actor)
  const { tools, byName } = buildTools(actor)
  const { runCommand } = await import('../../commands/run')

  const abandoned = await dropOpenAction(db, actor.userId, threadId)
  const userMessage: StoredMessage = { role: 'user', content: abandoned ? `(I didn't confirm the proposed changes.) ${text}` : text }
  const messages: MessageParam[] = [...(await history(db, actor.userId, threadId)), userMessage]
  await append(db, actor.userId, threadId, userMessage)

  const proposed: StoredAction[] = []
  let reply = ''
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await model.create({
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: contextBlock(actor, timezone) }],
      tools,
      messages,
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
    })
    const assistantMessage: StoredMessage = { role: 'assistant', content: response.content as Content }
    messages.push(assistantMessage)
    await append(db, actor.userId, threadId, assistantMessage)
    reply = textOf(response.content) || reply

    if (response.stop_reason === 'refusal') { reply = 'I can’t help with that one.'; break }
    if (response.stop_reason === 'pause_turn') continue
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason !== 'tool_use' || !toolUses.length) break

    const results: ToolResult[] = []
    for (const use of toolUses) {
      const tool = byName.get(use.name)
      const { summary, ...input } = (use.input ?? {}) as Record<string, unknown>
      if (!tool) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Unknown tool.' })
      } else if (tool.mutates) {
        proposed.push({
          toolUseId: use.id, command: tool.command, input, summary: typeof summary === 'string' ? summary.slice(0, 200) : '',
          description: await describeAction(actor, tool.command, input),
        })
        results.push({ type: 'tool_result', tool_use_id: use.id, content: 'Not run yet: waiting for the user to confirm. Tell them in one line what will happen when they confirm.' })
      } else {
        try {
          results.push({ type: 'tool_result', tool_use_id: use.id, content: serializeResult(await runCommand(tool.command, input, { actor, ip, requestId: `assistant:${use.id}` })) })
        } catch (error) {
          const message = error instanceof AppError ? error.message : 'That lookup failed.'
          if (!(error instanceof AppError)) logger.error('assistant.tool_failed', { tool: tool.command, error })
          results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: message })
        }
      }
    }
    const toolMessage: StoredMessage = { role: 'user', content: results }
    messages.push(toolMessage)
    await append(db, actor.userId, threadId, toolMessage)
  }

  let pendingAction: PendingAction | null = null
  if (proposed.length) {
    const id = newId('act')
    await db.query(
      `INSERT INTO assistant_pending_actions (id, user_id, thread_id, actions, expires_at) VALUES ($1, $2, $3, $4::jsonb, now() + make_interval(mins => $5))`,
      [id, actor.userId, threadId, JSON.stringify(proposed), ACTION_TTL_MINUTES])
    pendingAction = { id, actions: proposed.map(toCard) }
  }
  return { threadId, reply: reply || (pendingAction ? 'Here’s what I’ll do. Confirm to go ahead.' : 'Done.'), pendingAction }
}

const toCard = (a: StoredAction) => ({ command: a.command, description: a.description, note: a.summary })

export interface ActionOutcome { summary: string; ok: boolean; message: string }

/** Runs (confirm) or discards (cancel) a proposal exactly once, as the user who received it. */
export async function resolveAction(db: Db, actor: Actor, actionId: string, decision: 'confirm' | 'cancel', ip: string | null): Promise<ActionOutcome[]> {
  const claimed = await tx((t) => t.query<{ threadId: string; actions: StoredAction[] }>(
    `UPDATE assistant_pending_actions SET consumed_at = now()
     WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL AND expires_at > now()
     RETURNING thread_id AS "threadId", actions`, [actionId, actor.userId]))
  if (!claimed[0]) throw fail.conflict('That request expired or was already handled. Ask again.')
  const { threadId, actions } = claimed[0]
  if (decision === 'cancel') {
    await append(db, actor.userId, threadId, { role: 'user', content: 'I cancelled those changes; don’t make them.' })
    return actions.map((a) => ({ summary: a.description, ok: false, message: 'Cancelled' }))
  }
  const { runCommand } = await import('../../commands/run')
  const outcomes: ActionOutcome[] = []
  for (const action of actions) {
    try {
      const result = await runCommand(action.command, action.input, { actor, ip, requestId: `assistant:${actionId}` })
      const message = (result as { message?: string; summary?: string } | null)?.message ?? (result as { summary?: string } | null)?.summary ?? 'Done'
      outcomes.push({ summary: action.description, ok: true, message })
    } catch (error) {
      outcomes.push({ summary: action.description, ok: false, message: error instanceof AppError ? error.message : 'Something went wrong.' })
      if (!(error instanceof AppError)) logger.error('assistant.action_failed', { command: action.command, error })
    }
  }
  await append(db, actor.userId, threadId, {
    role: 'user',
    content: `I confirmed. Results:\n${outcomes.map((o) => `- ${o.summary}: ${o.ok ? 'done' : 'failed'} (${o.message})`).join('\n')}`,
  })
  return outcomes
}

/** Visible conversation for the chat panel (text only; tool traffic hidden). */
export async function visibleHistory(db: Db, actor: Actor): Promise<{ threadId: string | null; messages: { role: 'user' | 'assistant'; text: string }[]; pendingAction: PendingAction | null }> {
  const last = await activeThread(db, actor.userId)
  if (!last) return { threadId: null, messages: [], pendingAction: null }
  const rows = await history(db, actor.userId, last.threadId)
  const messages = rows.flatMap((m) => {
    const text = typeof m.content === 'string' ? m.content : textOf(m.content as Anthropic.Beta.BetaContentBlock[])
    return text ? [{ role: m.role, text }] : []
  })
  const open = await maybeOne<{ id: string; actions: StoredAction[] }>(db,
    `SELECT id, actions FROM assistant_pending_actions WHERE user_id = $1 AND thread_id = $2 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`,
    [actor.userId, last.threadId])
  return { threadId: last.threadId, messages, pendingAction: open ? { id: open.id, actions: open.actions.map(toCard) } : null }
}

/** Starts a fresh conversation (history is never edited, only left behind). */
export async function newThread(db: Db, actor: Actor): Promise<void> {
  await db.query(`UPDATE assistant_pending_actions SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL`, [actor.userId])
  await db.query(`UPDATE users SET assistant_reset_at = clock_timestamp() WHERE id = $1`, [actor.userId])
}
