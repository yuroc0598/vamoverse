// Structured logging. Server: one JSON line per event (ship stdout to your log
// provider). Browser: console only — nothing is persisted on the device.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const IS_SERVER = typeof window === 'undefined'

const SECRET_KEY = /(password|secret|token|authorization|api[-_]?key|signature|cookie|card|cvc|ssn)/i
const PERSONAL_KEY = /^(email|phone|birth_?date|birthDate|dob|display_?name|displayName|signature_?name|name|body)$/i

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || process.env.NEXT_PUBLIC_LOG_LEVEL || '').toLowerCase()
  if (raw in WEIGHT) return raw as LogLevel
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Object]'
  if (value == null || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value
  }
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([k, v]) =>
    [k, SECRET_KEY.test(k) || PERSONAL_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1)]))
}

function emit(level: LogLevel, event: string, context?: Record<string, unknown>) {
  if (WEIGHT[level] < WEIGHT[minLevel()]) return
  const record = { level, event, ts: new Date().toISOString(), ...(context ? { context: redact(context) } : {}) }
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  if (IS_SERVER) sink(JSON.stringify(record))
  else sink(`[${level}] ${event}`, record.context ?? '')
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => emit('debug', event, context),
  info: (event: string, context?: Record<string, unknown>) => emit('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => emit('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => emit('error', event, context),
}

let installed = false
export function installGlobalErrorHandlers() {
  if (IS_SERVER || installed) return
  installed = true
  window.addEventListener('error', (e) => logger.error('window.error', { message: e.message, source: e.filename, line: e.lineno }))
  window.addEventListener('unhandledrejection', (e) => logger.error('window.unhandled_rejection', { reason: String(e.reason) }))
}
