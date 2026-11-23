// Shared HTTP plumbing for route handlers: request metadata, CSRF origin check,
// and turning errors into JSON responses without leaking internals.
import { NextResponse, type NextRequest } from 'next/server'
import { AppError } from './errors'
import { logger } from '@/lib/logger'

export function requestMeta(req: NextRequest) {
  return {
    requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
    ip: req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || null,
  }
}

/** Rejects cross-site requests that carry cookies (CSRF). Native shells send no Origin. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host'))
  } catch {
    return false
  }
}

export function errorResponse(error: unknown, requestId: string, event: string): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status })
  }
  logger.error(event, { requestId, error })
  return NextResponse.json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, { status: 500 })
}
