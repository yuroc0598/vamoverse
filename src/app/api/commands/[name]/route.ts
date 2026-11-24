// The single endpoint for product actions: POST /api/commands/<name> with a JSON body.
import { NextResponse, after, type NextRequest } from 'next/server'
import { currentActor } from '@/server/auth/session'
import { getCommand, runCommand } from '@/server/commands/run'
import { deliverPending } from '@/server/modules/notifications/dispatcher'
import { db } from '@/server/db'
import { fail } from '@/server/errors'
import { errorResponse, isSameOrigin, requestMeta } from '@/server/http'
import { enforceRateLimit } from '@/server/ratelimit'

/** The assistant can make several model calls in one request. */
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const meta = requestMeta(req)
  try {
    if (!isSameOrigin(req)) throw fail.forbidden('Cross-site request blocked.')
    const { name } = await params
    const actor = await currentActor()
    await enforceRateLimit(db, `cmd:${actor?.userId ?? meta.ip ?? 'anon'}`, 240, 60)
    const body = await req.json().catch(() => {
      throw fail.badRequest('Request body must be JSON.')
    })
    const result = await runCommand(name, body, { actor, ...meta })
    // Changes usually notify someone: deliver right after responding (cron is the safety net).
    if (getCommand(name)?.mutates) after(() => deliverPending(db).catch(() => undefined))
    return NextResponse.json({ data: result ?? null })
  } catch (error) {
    return errorResponse(error, meta.requestId, 'commands.failed')
  }
}
