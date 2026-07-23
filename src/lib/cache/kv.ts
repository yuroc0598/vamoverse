// Small KV abstraction for cross-instance state (rate limits, webhook dedup).
// Uses Redis when REDIS_URL is set — so the counters survive cold starts and are
// shared across serverless instances — otherwise an in-process Map (fine for the
// single-process mock/dev default). Server-only.

export interface Kv {
  readonly kind: 'redis' | 'memory'
  /** Increment key, setting a TTL on first creation. Returns the new count. */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>
  /** Set key only if absent, with TTL. Returns true if it was set (i.e. first time). */
  setNx(key: string, ttlSeconds: number): Promise<boolean>
}

class MemoryKv implements Kv {
  readonly kind = 'memory' as const
  private store = new Map<string, { value: number; expiresAt: number }>()

  private sweepIfNeeded() {
    if (this.store.size <= 5000) return
    const now = Date.now()
    for (const [k, v] of this.store) if (v.expiresAt <= now) this.store.delete(k)
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now()
    const entry = this.store.get(key)
    if (!entry || entry.expiresAt <= now) {
      this.store.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 })
      this.sweepIfNeeded()
      return 1
    }
    entry.value++
    return entry.value
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now()
    const entry = this.store.get(key)
    if (entry && entry.expiresAt > now) return false
    this.store.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 })
    this.sweepIfNeeded()
    return true
  }
}

class RedisKv implements Kv {
  readonly kind = 'redis' as const
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: any) {
    this.client = client
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key)
    if (count === 1) await this.client.expire(key, ttlSeconds)
    return count
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX')
    return res === 'OK'
  }
}

let instance: Kv | null = null

export function getKv(): Kv {
  if (instance) return instance
  if (process.env.REDIS_URL) {
    try {
      // Lazy require so ioredis is never bundled unless Redis is configured.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Redis = require('ioredis')
      const client = new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 })
      instance = new RedisKv(client)
    } catch {
      instance = new MemoryKv()
    }
  } else {
    instance = new MemoryKv()
  }
  return instance
}

export function _resetKvForTests() {
  instance = null
}

export { MemoryKv }
