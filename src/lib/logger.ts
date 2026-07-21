// Lightweight isomorphic logger — works in Next.js server (API routes,
// middleware) and in the browser/Capacitor WebView. Wraps console with:
//   - levels (debug < info < warn < error), filtered by LOG_LEVEL
//   - structured JSON output on the server (greppable / aggregator-friendly)
//   - human-readable output in the browser (dev console)
//   - a redaction helper so we never dump secrets/PII into logs
//
// Usage:
//   import { logger } from '@/lib/logger'
//   logger.info('vamos.request', { intent })
//   logger.error('cron.capture_failed', { err })

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

// Server logs JSON; browser logs readable lines. `window` is undefined on the server.
const IS_SERVER = typeof window === 'undefined'

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || process.env.NEXT_PUBLIC_LOG_LEVEL || '').toLowerCase()
  if (raw in LEVEL_WEIGHT) return raw as LogLevel
  // Default: quieter in production, chatty in dev.
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

// Keys whose values should never be logged in full.
const SENSITIVE_KEY = /(password|passwd|secret|token|authorization|api[-_]?key|client[-_]?secret|signature|cookie|card|cvc|ssn)/i

/**
 * Redact secrets/PII from a value before logging. Recurses into plain objects
 * and arrays; masks values under sensitive keys and truncates long strings.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Object]'
  if (value == null) return value
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…[truncated ${value.length} chars]` : value
  }
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1)
  }
  return out
}

// --- On-device log buffer -------------------------------------------------
// Keeps the most recent entries so they can be inspected on-device — essential
// in the iOS/Capacitor WebView where attaching a JS console is awkward. Buffer
// lives in memory and is mirrored to localStorage so it survives a reload/crash.
export interface LogEntry {
  level: LogLevel
  event: string
  ts: string
  context?: Record<string, unknown>
}

const BUFFER_LIMIT = 200
const STORAGE_KEY = 'vamoverse_logs'
const buffer: LogEntry[] = []

function loadPersisted() {
  if (IS_SERVER || buffer.length) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) buffer.push(...(JSON.parse(raw) as LogEntry[]))
  } catch {
    // ignore — a corrupt/oversized buffer must never break logging itself
  }
}

function record(entry: LogEntry) {
  buffer.push(entry)
  if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT)
  if (!IS_SERVER) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer))
    } catch {
      // storage full/unavailable — keep the in-memory buffer, drop persistence
    }
  }
}

/** Most recent log entries (newest last), optionally filtered by minimum level. */
export function getRecentLogs(opts?: { level?: LogLevel; limit?: number }): LogEntry[] {
  loadPersisted()
  const min = opts?.level ? LEVEL_WEIGHT[opts.level] : 0
  const filtered = buffer.filter((e) => LEVEL_WEIGHT[e.level] >= min)
  return opts?.limit ? filtered.slice(-opts.limit) : filtered
}

/** Clear the on-device log buffer (memory + persisted copy). */
export function clearLogs() {
  buffer.length = 0
  if (!IS_SERVER) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

function emit(level: LogLevel, event: string, context?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel()]) return

  const safeContext = context ? (redact(context) as Record<string, unknown>) : undefined
  const ts = new Date().toISOString()

  // Retain a copy on-device for after-the-fact inspection (browser/WebView only).
  if (!IS_SERVER) {
    loadPersisted()
    record({ level, event, ts, ...(safeContext ? { context: safeContext } : {}) })
  }

  // console.error/warn map to their own streams; debug -> log for wide support.
  const sink =
    level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.log : console.info

  if (IS_SERVER) {
    const rec = { level, event, ts, ...(safeContext ? { context: safeContext } : {}) }
    sink(JSON.stringify(rec))
  } else {
    const prefix = `[${level.toUpperCase()}] ${event}`
    if (safeContext) sink(prefix, safeContext)
    else sink(prefix)
  }
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => emit('debug', event, context),
  info: (event: string, context?: Record<string, unknown>) => emit('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => emit('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => emit('error', event, context),
}

// Guard so double-mounts (React strict mode, fast refresh) don't stack handlers.
let globalHandlersInstalled = false

/**
 * Catch errors that escape try/catch — uncaught exceptions and unhandled promise
 * rejections — so they land in the log buffer instead of vanishing. Browser-only;
 * call once on app start.
 */
export function installGlobalErrorHandlers() {
  if (IS_SERVER || globalHandlersInstalled) return
  globalHandlersInstalled = true

  window.addEventListener('error', (e) => {
    logger.error('window.uncaught_error', {
      message: e.message,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
      err: e.error,
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    logger.error('window.unhandled_rejection', { reason: e.reason })
  })

  // Convenience accessors for inspecting logs from a console / Safari Web
  // Inspector while debugging on device: `__vamoLogs()` / `__vamoClearLogs()`.
  ;(window as any).__vamoLogs = getRecentLogs
  ;(window as any).__vamoClearLogs = clearLogs
}
