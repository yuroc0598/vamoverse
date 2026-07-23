export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const IS_SERVER = typeof window === 'undefined'

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || process.env.NEXT_PUBLIC_LOG_LEVEL || '').toLowerCase()
  if (raw in LEVEL_WEIGHT) return raw as LogLevel
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

const SENSITIVE_KEY = /(password|passwd|secret|token|authorization|api[-_]?key|client[-_]?secret|signature|cookie|card|cvc|ssn)/i

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

export interface LogEntry {
  level: LogLevel
  event: string
  ts: string
  context?: Record<string, unknown>
}

const BUFFER_LIMIT = 200
const STORAGE_KEY = 'vamoverse_logs'
const buffer: LogEntry[] = []
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistedLoaded = false

function loadPersisted() {
  if (IS_SERVER || persistedLoaded) return
  persistedLoaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LogEntry[]
      if (Array.isArray(parsed)) {
        const capped = parsed.slice(-BUFFER_LIMIT)
        buffer.push(...capped)
      }
    }
  } catch {
  }
}

function schedulePersist() {
  if (IS_SERVER) return
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer))
    } catch {
    }
  }, 500)
}

function record(entry: LogEntry) {
  buffer.push(entry)
  while (buffer.length > BUFFER_LIMIT) {
    buffer.shift()
  }
  if (!IS_SERVER) {
    schedulePersist()
  }
}

export function getRecentLogs(opts?: { level?: LogLevel; limit?: number }): LogEntry[] {
  loadPersisted()
  const min = opts?.level ? LEVEL_WEIGHT[opts.level] : 0
  const filtered = buffer.filter((e) => LEVEL_WEIGHT[e.level] >= min)
  return opts?.limit ? filtered.slice(-opts.limit) : filtered
}

export function clearLogs() {
  buffer.length = 0
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!IS_SERVER) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
    }
  }
}

function emit(level: LogLevel, event: string, context?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel()]) return

  const safeContext = context ? (redact(context) as Record<string, unknown>) : undefined
  const ts = new Date().toISOString()

  if (!IS_SERVER) {
    loadPersisted()
    record({ level, event, ts, ...(safeContext ? { context: safeContext } : {}) })
  }

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

let globalHandlersInstalled = false

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

  const shouldExpose =
    process.env.NEXT_PUBLIC_EXPOSE_LOGS === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_EXPOSE_LOGS !== 'false')

  if (shouldExpose && typeof window !== 'undefined') {
    ;(window as any).__vamoLogs = getRecentLogs
    ;(window as any).__vamoClearLogs = clearLogs
  }
}
