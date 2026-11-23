// Scheduled work. `frequent` runs every few minutes; `hourly` once an hour.
import { logger } from '@/lib/logger'
import { db } from './db'
import { completeSessions, expireHolds } from './modules/bookings/engine'
import { deliverPending } from './modules/notifications/dispatcher'
import { enqueueReminders } from './modules/notifications/reminders'
import { runEffects, runPaymentJobs } from './modules/payments/settlement'
import { extendAllSessions } from './modules/schedule/offerings'
import { pruneRateLimits } from './ratelimit'

type Job = () => Promise<Record<string, unknown>>

export const JOBS: Record<'frequent' | 'hourly', Job> = {
  frequent: async () => ({
    expiredHolds: await expireHolds(db),
    payments: await runPaymentJobs(db),
    reminders: await enqueueReminders(db),
    delivered: await deliverPending(db, 200),
  }),
  hourly: async () => {
    const effects = await completeSessions(db)
    await runEffects(db, effects)
    const sessionsGenerated = await extendAllSessions(db)
    await pruneRateLimits(db)
    return { charges: effects.charges.length, sessionsGenerated }
  },
}

export async function runJob(name: keyof typeof JOBS): Promise<Record<string, unknown>> {
  const started = Date.now()
  const result = await JOBS[name]()
  logger.info('job.completed', { job: name, ms: Date.now() - started, ...result })
  return result
}
