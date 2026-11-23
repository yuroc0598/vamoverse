import { NextResponse, type NextRequest } from 'next/server'
import { DEV_SESSION_COOKIE } from '@/server/auth/dev-session'
import { authMode } from '@/server/config'
import { isSameOrigin } from '@/server/http'

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: 'forbidden', message: 'Blocked' } }, { status: 403 })
  if (authMode() === 'supabase') {
    const { supabaseServerClient } = await import('@/server/auth/supabase')
    await (await supabaseServerClient()).auth.signOut()
  }
  const response = NextResponse.json({ data: { ok: true } })
  response.cookies.delete(DEV_SESSION_COOKIE)
  return response
}
