// Failure isolation for background work: one coach's bad data (or a processor outage for one
// item) must never stop the job for everyone else.
import { logger } from '@/lib/logger'

/** Runs `fn` for each item; failures are logged with the item's key and the rest continue. Returns the failure count. */
export async function forEachIsolated<T>(items: T[], event: string, key: (item: T) => string, fn: (item: T) => Promise<void>): Promise<number> {
  let failures = 0
  for (const item of items) {
    try {
      await fn(item)
    } catch (error) {
      failures++
      logger.error(event, { item: key(item), error })
    }
  }
  return failures
}

/** Runs one step of a job; a failure is logged and reported instead of aborting the remaining steps. */
export async function isolatedStep<T>(job: string, step: string, fn: () => Promise<T>): Promise<T | { failed: true }> {
  try {
    return await fn()
  } catch (error) {
    logger.error('job.step_failed', { job, step, error })
    return { failed: true }
  }
}
