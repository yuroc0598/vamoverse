// Resolves who is making the current request (route handlers and server components).
// Browsers authenticate with cookies; the native app sends `Authorization: Bearer <token>`.
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { authMode } from '../config'
import { db } from '../db'
import { ensureActor, loadActor, type Actor, type Identity } from '../modules/users/accounts'
import { DEV_SESSION_COOKIE, readDevSession } from './dev-session'

type SupabaseUser = { id: string; email?: string; phone?: string; user_metadata?: Record<string, string | undefined> }

function toIdentity(user: SupabaseUser): Identity {
  const meta = user.user_metadata ?? {}
  return { id: user.id, email: user.email, phone: user.phone || null, name: meta.full_name || meta.name || meta.display_name }
}

async function supabaseCookieIdentity(): Promise<Identity | null> {
  const { supabaseServerClient } = await import('./supabase')
  const { data } = await (await supabaseServerClient()).auth.getUser()
  return data.user ? toIdentity(data.user) : null
}

async function supabaseTokenIdentity(token: string): Promise<Identity | null> {
  const { supabaseTokenClient } = await import('./supabase')
  const { data } = await supabaseTokenClient().auth.getUser(token)
  return data.user ? toIdentity(data.user) : null
}

/**
 * The token from an `Authorization: Bearer` header: `undefined` when there is no bearer header
 * (other schemes are ignored), `''` when it is empty.
 */
export function bearerToken(authorization: string | null): string | undefined {
  const match = authorization?.match(/^Bearer(?:\s+(.*))?$/i)
  return match ? (match[1] ?? '').trim() : undefined
}

/** The actor for a bearer token: a dev-session value in dev, a Supabase access token otherwise. Invalid → null. */
async function actorFromBearer(token: string): Promise<Actor | null> {
  if (!token) return null
  if (authMode() === 'dev') {
    const userId = readDevSession(token)
    return userId ? loadActor(db, userId) : null
  }
  const identity = await supabaseTokenIdentity(token)
  return identity ? ensureActor(db, identity) : null
}

/** A bearer header decides the actor on its own (cookies are ignored, never a fallback); otherwise cookies do. */
export async function resolveActor(authorization: string | null, fromCookies: () => Promise<Actor | null>): Promise<Actor | null> {
  const token = bearerToken(authorization)
  return token === undefined ? fromCookies() : actorFromBearer(token)
}

/** The signed-in actor, resolved once per request (layouts and pages share it). */
export const currentActor = cache(async (): Promise<Actor | null> => {
  // Reading cookies first marks every page that checks the user as per-request (never prerendered).
  const [store, requestHeaders] = await Promise.all([cookies(), headers()])
  return resolveActor(requestHeaders.get('authorization'), async () => {
    if (authMode() === 'dev') {
      // Dev accounts are created by the dev sign-in route; a stale cookie means signed out.
      const userId = readDevSession(store.get(DEV_SESSION_COOKIE)?.value)
      return userId ? loadActor(db, userId) : null
    }
    const identity = await supabaseCookieIdentity()
    return identity ? ensureActor(db, identity) : null
  })
})
