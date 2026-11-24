// Resolves who is making the current request (route handlers and server components).
import { cache } from 'react'
import { cookies } from 'next/headers'
import { authMode } from '../config'
import { db } from '../db'
import { ensureActor, loadActor, type Actor, type Identity } from '../modules/users/accounts'
import { DEV_SESSION_COOKIE, readDevSession } from './dev-session'

async function supabaseIdentity(): Promise<Identity | null> {
  const { supabaseServerClient } = await import('./supabase')
  const { data } = await (await supabaseServerClient()).auth.getUser()
  const user = data.user
  if (!user) return null
  const meta = user.user_metadata ?? {}
  return { id: user.id, email: user.email, phone: user.phone || null, name: meta.full_name || meta.name || meta.display_name }
}

/** The signed-in actor, resolved once per request (layouts and pages share it). */
export const currentActor = cache(async (): Promise<Actor | null> => {
  // Reading cookies first marks every page that checks the user as per-request (never prerendered).
  const store = await cookies()
  if (authMode() === 'dev') {
    // Dev accounts are created by the dev sign-in route; a stale cookie means signed out.
    const userId = readDevSession(store.get(DEV_SESSION_COOKIE)?.value)
    return userId ? loadActor(db, userId) : null
  }
  const identity = await supabaseIdentity()
  return identity ? ensureActor(db, identity) : null
})
