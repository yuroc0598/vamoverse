// Development-only sign-in (no email delivery needed). Disabled whenever Supabase is configured.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { DEV_SESSION_COOKIE, createDevSession } from '@/server/auth/dev-session'
import { authMode } from '@/server/config'
import { db } from '@/server/db'
import { fail } from '@/server/errors'
import { errorResponse, isSameOrigin, requestMeta } from '@/server/http'
import { newId } from '@/server/ids'
import { ensureActor, findUserIdByContact } from '@/server/modules/users/accounts'

const input = z.object({ email: z.email(), name: z.string().trim().max(80).optional() })

export async function POST(req: NextRequest) {
  const meta = requestMeta(req)
  try {
    if (authMode() !== 'dev' || !isSameOrigin(req)) throw fail.notFound('Page')
    const parsed = input.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) throw fail.badRequest('Enter a valid email.')
    const { email, name } = parsed.data
    const userId = (await findUserIdByContact(db, { email })) ?? newId('usr')
    await ensureActor(db, { id: userId, email, name })
    const session = createDevSession(userId)
    const response = NextResponse.json({ data: { ok: true } })
    response.cookies.set(DEV_SESSION_COOKIE, session.value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: session.maxAge })
    return response
  } catch (error) {
    return errorResponse(error, meta.requestId, 'auth.dev_failed')
  }
}
