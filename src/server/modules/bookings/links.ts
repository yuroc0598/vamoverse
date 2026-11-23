// Signed links let someone manage a booking without signing in (guest checkout,
// links in emails and texts). The token only grants access to that one booking.
import { createHmac, timingSafeEqual } from 'crypto'
import { appUrl, secret } from '../../config'

function sign(bookingId: string): string {
  return createHmac('sha256', secret('LINK_SECRET')).update(`booking:${bookingId}`).digest('base64url').slice(0, 32)
}

export function bookingPath(bookingId: string): string {
  return `/b/${bookingId}?t=${sign(bookingId)}`
}

export function bookingUrl(bookingId: string): string {
  return `${appUrl()}${bookingPath(bookingId)}`
}

export function verifyBookingToken(bookingId: string, token: string | null | undefined): boolean {
  if (!token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(sign(bookingId))
  return a.length === b.length && timingSafeEqual(a, b)
}
