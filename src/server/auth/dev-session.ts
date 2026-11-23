// Development-only sign-in: an HMAC-signed cookie carrying a user id.
// Never used in production (authMode() is 'supabase' or throws there).
import { createHmac, timingSafeEqual } from 'crypto'
import { secret } from '../config'

export const DEV_SESSION_COOKIE = 'vamo_dev_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function sign(payload: string): string {
  return createHmac('sha256', secret('DEV_SESSION_SECRET')).update(payload).digest('base64url')
}

export function createDevSession(userId: string, now = Date.now()): { value: string; maxAge: number } {
  const payload = `${userId}.${Math.floor(now / 1000) + MAX_AGE_SECONDS}`
  return { value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE_SECONDS }
}

export function readDevSession(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null
  const lastDot = value.lastIndexOf('.')
  if (lastDot < 0) return null
  const payload = value.slice(0, lastDot)
  const given = Buffer.from(value.slice(lastDot + 1))
  const expected = Buffer.from(sign(payload))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  const [userId, expires] = payload.split('.')
  if (!userId || Number(expires) * 1000 < now) return null
  return userId
}
