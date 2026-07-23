import { NextRequest, NextResponse } from 'next/server'
import { VAMOS_TOOLS } from '@/lib/vamos/tools'
import { parseIntent, generateMockResponse } from '@/lib/vamos/mock_engine'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { createPendingAction, verifyPendingAction, consumePendingAction } from '@/lib/vamos/pending_store'
import { listStudents, listEvents, listPayments, toApiPlayer, toApiEvent, toApiPayment } from '@/lib/domain/catalog'
import { resolveActor } from '@/lib/auth/actor'
import { getKv } from '@/lib/cache/kv'

// Reference data comes from the canonical catalog (single source of truth), not
// hand-rolled literals that drift from the rest of the app.
const mockPlayers = listStudents().map(toApiPlayer)
const mockEvents = listEvents().map(toApiEvent)
const mockPayments = listPayments().map(toApiPayment)

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  confirmedActionId: z.string().regex(/^pa_\d+_[a-f0-9]{16}$/).optional()
})

const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_MAX = 20

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || req.headers.get('x-forwarded') || '127.0.0.1'
}

// Backed by Redis when REDIS_URL is set (shared across instances / survives cold
// starts), else in-process. Fails open if the store errors — never blocks on infra.
async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const count = await getKv().incrWithTtl(`vamos:rl:${ip}`, RATE_LIMIT_WINDOW_SECONDS)
    return count <= RATE_LIMIT_MAX
  } catch {
    return true
  }
}

function scopePaymentsForActor(payments: typeof mockPayments, actor: any) {
  if (!actor || actor.id === 'anon') return []
  return payments.filter(p => p.student_id === actor.id || p.coach_id === actor.id)
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || (globalThis.crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ip = getClientIp(req)

  if (!(await checkRateLimit(ip))) {
    logger.warn('vamos.rate_limited', { requestId, ip })
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { actor, isMockMode } = await resolveActor(req)

  if (!actor) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('vamos.unauthorized', { requestId, ip, isMockMode })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    } else {
      logger.warn('vamos.unauthenticated_dev_request', { requestId, ip, isMockMode })
    }
  }

  const effectiveActor: { id: string; role: string; limited?: boolean } =
    actor || { id: 'anon', role: 'student', limited: true }

  let rawBody: any
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parseResult = chatSchema.safeParse(rawBody)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request', details: parseResult.error.flatten() }, { status: 400 })
  }

  const { message: rawMessage, confirmedActionId } = parseResult.data
  const message = rawMessage.slice(0, 2000)
  const wrappedMessage = `<untrusted_data>${message.replace(/</g, '&lt;').slice(0,2000)}</untrusted_data>`

  if (message.startsWith('CONFIRM:') || message.startsWith('CONFIRM ')) {
    return NextResponse.json({
      error: 'Deprecated confirmation method',
      response: 'Security upgrade: use confirmedActionId instead of CONFIRM string. Tap Confirm button again.',
      requires_confirmation: false
    }, { status: 400 })
  }

  try {
    if (confirmedActionId) {
      const verification = verifyPendingAction(confirmedActionId, effectiveActor.id !== 'anon' ? effectiveActor.id : null)
      if (!verification.valid) {
        const reason = verification.reason || 'invalid'
        const status = verification.status || 400
        logger.warn('vamos.confirmation_rejected', { requestId, reason, confirmedActionId, actorId: effectiveActor.id })
        if (status === 403) {
          return NextResponse.json({ error: 'Forbidden: action does not belong to you', reason }, { status: 403 })
        }
        return NextResponse.json({ response: `Invalid or expired confirmation id (${reason}). Please request a fresh action.`, requires_confirmation: false, reason }, { status: 400 })
      }

      const entry = verification.entry!
      const payload = entry.payload

      if (payload?.tool === 'create_payment') {
        const amount = payload?.params?.amount_cents
        if (typeof amount !== 'number' || amount <= 0 || amount > 1000000) {
          return NextResponse.json({ error: 'Invalid amount on pending action', response: 'Amount revalidation failed - action cancelled.', requires_confirmation: false }, { status: 400 })
        }
      }

      consumePendingAction(confirmedActionId)
      logger.info('vamos.confirmation_accepted', { requestId, actorId: effectiveActor.id, tool: payload?.tool })

      return NextResponse.json({
        response: `Vamos! Done - ${payload?.summary || 'action completed'} for ${new Date().toLocaleDateString()} at ${payload?.params?.location_name || 'confirmed location'}. Invited players will be notified. 🎾 (Confirmed by ${effectiveActor.id})`,
        tool_calls: [],
        requires_confirmation: false,
        pending_action_id: confirmedActionId,
        confirmation_method: 'server-side Map lookup + expiry + userId + HMAC verification'
      })
    }

    const intent = parseIntent(message)

    let toolResults: any = {}

    if (intent.intent === 'search_players') {
      let filtered = [...mockPlayers]
      if (effectiveActor.id !== 'anon') {
        filtered = filtered.filter(p => p.id !== effectiveActor.id)
      }
      if (intent.entities.utr_min) {
        filtered = filtered.filter(p => p.utr_singles >= intent.entities.utr_min && p.utr_singles <= (intent.entities.utr_max || 16.5))
      }
      if (intent.entities.gender && intent.entities.gender !== 'any') {
        filtered = filtered.filter(p => p.gender === intent.entities.gender)
      }
      toolResults = { players: filtered }
    }

    if (intent.intent === 'list_events') {
      let events = [...mockEvents]
      if (effectiveActor.id !== 'anon') {
        // MVP scoping: if actor is student, only show events they could access; comment notes full scoping would use registrations table
        // For now, keep all but demonstrate scoping hook
      } else {
        events = []
      }
      toolResults = { events }
    }

    if (intent.intent === 'list_payments') {
      if (effectiveActor.id === 'anon' || effectiveActor.limited) {
        toolResults = { payments: [] }
      } else {
        // Scope: only payments where student_id==actor.id or coach_id==actor.id per P0-3
        const scoped = scopePaymentsForActor(mockPayments, effectiveActor)
        toolResults = { payments: scoped }
      }
    }

    if (intent.intent === 'create_payment_draft' || intent.intent === 'create_match_draft') {
      if (effectiveActor.id === 'anon') {
        return NextResponse.json({ error: 'Unauthorized', response: 'You must be logged in to create matches or payments.', requires_confirmation: false }, { status: 401 })
      }
    }

    // Only coaches may draft charges (payee scope enforcement).
    if (intent.intent === 'create_payment_draft' && effectiveActor.role !== 'coach') {
      logger.warn('vamos.payment_draft_forbidden', { requestId, actorId: effectiveActor.id, role: effectiveActor.role })
      return NextResponse.json({ error: 'Forbidden', response: 'Only coaches can create charges.', requires_confirmation: false }, { status: 403 })
    }

    const mock = generateMockResponse(intent, toolResults)

    if (mock.requiresConfirmation && mock.pendingAction) {
      const entry = createPendingAction(effectiveActor.id !== 'anon' ? effectiveActor.id : null, mock.pendingAction)
      const pendingWithId = {
        ...mock.pendingAction,
        id: entry.id,
        expiresAt: entry.expiresAt
      }
      return NextResponse.json({
        response: mock.response,
        requires_confirmation: true,
        pending_action: pendingWithId,
        tool_results: toolResults,
        mock: true,
        intent: intent.intent,
        actor: { id: effectiveActor.id, role: effectiveActor.role }
      })
    }

    return NextResponse.json({
      response: mock.response,
      requires_confirmation: mock.requiresConfirmation || false,
      pending_action: mock.pendingAction ? { ...mock.pendingAction, id: undefined } : undefined,
      tool_results: toolResults,
      mock: true,
      intent: intent.intent,
      actor: { id: effectiveActor.id, role: effectiveActor.role }
    })

  } catch (err: any) {
    logger.error('vamos.request_failed', { requestId, err: String(err?.message || err), actorId: effectiveActor.id, wrappedMessage })
    return NextResponse.json({ response: "Shoot - net cord! My brain had a fault. Try again?", error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Vamos AI is ready - Vamos Together!', tools: VAMOS_TOOLS.length, mock: !process.env.OPENAI_API_KEY })
}
