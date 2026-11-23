// Development payment simulator endpoint (404 unless payments run in dev mode).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/server/db'
import { fail } from '@/server/errors'
import { errorResponse, isSameOrigin, requestMeta } from '@/server/http'
import { simulate } from '@/server/modules/payments/simulator'

const input = z.object({ action: z.enum(['checkout', 'connect', 'subscribe', 'cancel_subscription']), id: z.string().min(1) })

export async function POST(req: NextRequest) {
  const meta = requestMeta(req)
  try {
    if (!isSameOrigin(req)) throw fail.forbidden()
    const parsed = input.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) throw fail.badRequest('Invalid simulation')
    return NextResponse.json({ data: { redirect: await simulate(db, parsed.data.action, parsed.data.id) } })
  } catch (error) {
    return errorResponse(error, meta.requestId, 'dev.simulate_failed')
  }
}
