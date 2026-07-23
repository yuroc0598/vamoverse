// Shared server-side actor resolution used by API routes. Prefers a real Supabase
// session; falls back to the signed-ish mock cookie/header in mock mode. Previously
// this logic was duplicated inside the Vamos route.
import type { NextRequest } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface Actor {
  id: string
  email: string
  role: string
  display_name: string
}

export function isMockModeFromEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (process.env.NODE_ENV === 'production' && !url) return false // fail closed in prod
  return !url || url.includes('localhost') || url.includes('mock')
}

export function tryParseMockUser(raw: string | null | undefined): Actor | null {
  if (!raw) return null
  const candidates = [raw]
  try { candidates.push(decodeURIComponent(raw)) } catch { /* ignore */ }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c)
      if (parsed && typeof parsed === 'object' && parsed.id) {
        return {
          id: String(parsed.id),
          role: parsed.role || 'student',
          email: parsed.email || '',
          display_name: parsed.display_name || parsed.name || String(parsed.id),
        }
      }
    } catch { /* ignore */ }
  }
  const trimmed = raw.trim()
  if (trimmed && trimmed.length <= 200 && !trimmed.startsWith('{') && !trimmed.includes(' ')) {
    return { id: trimmed, role: 'student', email: '', display_name: trimmed }
  }
  return null
}

export async function resolveActor(req: NextRequest): Promise<{ actor: Actor | null; isMockMode: boolean }> {
  const isMockMode = isMockModeFromEnv()
  let actor: Actor | null = null

  try {
    const supabase = (await createServerSupabaseClient()) as any
    const { data } = await supabase.auth?.getUser?.()
    if (data?.user) {
      actor = {
        id: data.user.id,
        email: data.user.email || '',
        role: data.user.user_metadata?.role || data.user.app_metadata?.role || 'student',
        display_name: data.user.user_metadata?.display_name || data.user.email || data.user.id,
      }
    }
  } catch (e) {
    logger.debug('actor.supabase_auth_failed', { error: String(e) })
  }

  if (!actor) {
    const fromCookie = tryParseMockUser(req.cookies.get('vamoverse_mock_session')?.value)
    const fromHeader = tryParseMockUser(req.headers.get('x-mock-user'))
    actor = fromCookie || fromHeader
    if (actor && !isMockMode) {
      logger.warn('actor.mock_actor_outside_mock_mode', { actorId: actor.id })
    }
  }

  return { actor, isMockMode }
}
