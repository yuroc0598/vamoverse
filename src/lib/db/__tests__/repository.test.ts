import { describe, it, expect, beforeEach } from 'vitest'
import { getRepository, _resetRepositoryForTests } from '../repository'
import { clearMockRegistrations } from '@/lib/utils/capacity'

// With no DATABASE_URL, getRepository() returns the in-memory MockRepository.
describe('getRepository -> MockRepository (no DATABASE_URL)', () => {
  beforeEach(() => {
    _resetRepositoryForTests()
    clearMockRegistrations()
    delete process.env.DATABASE_URL
  })

  it('selects the mock backend when DATABASE_URL is unset', async () => {
    const repo = await getRepository()
    expect(repo.kind).toBe('mock')
  })

  it('registers up to capacity then waitlists (evt_2 capacity 4)', async () => {
    const repo = await getRepository()
    const occ = 'evt_2_occ_test'
    const statuses: string[] = []
    for (let i = 0; i < 6; i++) {
      const r = await repo.registerForOccurrence(occ, `stu_${i}`, 'evt_2')
      statuses.push(r.status)
    }
    expect(statuses.filter((s) => s === 'registered')).toHaveLength(4)
    expect(statuses.filter((s) => s === 'waitlisted')).toHaveLength(2)

    const counts = await repo.getOccurrenceCounts(occ)
    expect(counts.registered).toBe(4)
    expect(counts.waitlisted).toBe(2)
    expect(counts.capacity).toBe(4)
  })

  it('is idempotent for an already-registered student', async () => {
    const repo = await getRepository()
    const occ = 'evt_1_occ_test'
    const first = await repo.registerForOccurrence(occ, 'stu_x', 'evt_1')
    const again = await repo.registerForOccurrence(occ, 'stu_x', 'evt_1')
    expect(again.registrationId).toBe(first.registrationId)
    const counts = await repo.getOccurrenceCounts(occ)
    expect(counts.registered).toBe(1)
  })
})
