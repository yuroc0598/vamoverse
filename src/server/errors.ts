// Errors that are safe to show to the user. Anything else becomes a generic 500.
export type ErrorCode =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'payment_required' | 'rate_limited' | 'unavailable'

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409,
  payment_required: 402, rate_limited: 429, unavailable: 503,
}

export class AppError extends Error {
  readonly status: number
  constructor(readonly code: ErrorCode, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.status = STATUS[code]
  }
}

export const fail = {
  badRequest: (message: string, details?: unknown) => new AppError('bad_request', message, details),
  unauthorized: (message = 'Please sign in.') => new AppError('unauthorized', message),
  forbidden: (message = "You don't have access to that.") => new AppError('forbidden', message),
  notFound: (what: string) => new AppError('not_found', `${what} not found.`),
  conflict: (message: string) => new AppError('conflict', message),
  paymentRequired: (message: string) => new AppError('payment_required', message),
  rateLimited: () => new AppError('rate_limited', 'Too many requests. Try again shortly.'),
  unavailable: (message: string) => new AppError('unavailable', message),
}

/** Postgres unique-violation (23505) → friendly conflict. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = error as { code?: string; constraint?: string }
  return e?.code === '23505' && (!constraint || e.constraint === constraint)
}
