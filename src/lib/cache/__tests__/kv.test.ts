import { describe, it, expect } from 'vitest'
import { MemoryKv } from '../kv'

describe('MemoryKv (in-memory fallback)', () => {
  it('incrWithTtl increments and returns the running count', async () => {
    const kv = new MemoryKv()
    expect(await kv.incrWithTtl('a', 60)).toBe(1)
    expect(await kv.incrWithTtl('a', 60)).toBe(2)
    expect(await kv.incrWithTtl('a', 60)).toBe(3)
    expect(await kv.incrWithTtl('b', 60)).toBe(1) // independent key
  })

  it('incrWithTtl resets the window once the TTL elapses', async () => {
    const kv = new MemoryKv()
    expect(await kv.incrWithTtl('w', 0)).toBe(1) // ttl 0 -> immediately expired next call
    expect(await kv.incrWithTtl('w', 0)).toBe(1)
  })

  it('setNx returns true only the first time (dedup semantics)', async () => {
    const kv = new MemoryKv()
    expect(await kv.setNx('evt_1', 60)).toBe(true)
    expect(await kv.setNx('evt_1', 60)).toBe(false)
    expect(await kv.setNx('evt_2', 60)).toBe(true)
  })
})
