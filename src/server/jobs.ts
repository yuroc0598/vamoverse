// Scheduled work. `frequent` runs every few minutes; `hourly` once an hour.
import { logger } from '@/lib/logger'
import { db } from './db'
import { completeSessions, expireHolds } from './modules/bookings/engine'
import { deliverPending } from './modules/notifications/dispatcher'
import { enqueueReminders } from './modules/notifications/reminders'
import { runEffects, runPaymentJobs } from './modules/payments/settlement'
import { extendAllSessions } from './modules/schedule/offerings'
import { isolatedStep } from './isolate'
import { pruneRateLimits } from './ratelimit'

type Job = () => Promise<Record<string, unknown>>

/** Each step is isolated: one failing step is logged and the others still run. */
export const JOBS: Record<'frequent' | 'hourly', Job> = {
  frequent: async () => ({
    expiredHolds: await isolatedStep('frequent', 'expireHolds', () => expireHolds(db)),
    payments: await isolatedStep('frequent', 'payments', () => runPaymentJobs(db)),
    reminders: await isolatedStep('frequent', 'reminders', () => enqueueReminders(db)),
    delivered: await isolatedStep('frequent', 'delivery', () => deliverPending(db, 200)),
  }),
  hourly: async () => ({
    completed: await isolatedStep('hourly', 'completeSessions', async () => {
      const effects = await completeSessions(db)
      await runEffects(db, effects)
      return effects.charges.length
    }),
    sessionsGenerated: await isolatedStep('hourly', 'extendSessions', () => extendAllSessions(db)),
    pruned: await isolatedStep('hourly', 'pruneRateLimits', () => pruneRateLimits(db)),
  }),
}

export async function runJob(name: keyof typeof JOBS): Promise<Record<string, unknown>> {
  const started = Date.now()
  const result = await JOBS[name]()
  logger.info('job.completed', { job: name, ms: Date.now() - started, ...result })
  return result
}
