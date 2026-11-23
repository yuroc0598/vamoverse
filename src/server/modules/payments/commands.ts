import { z } from 'zod'
import { command } from '../../commands/define'
import { requireProvider } from '../providers/profile'
import { billingPortal, listMyPayments, moneySummary, refreshPayoutStatus, startPayoutOnboarding, startProSubscription } from './account'
import { defaultPaymentMethod } from './core'
import { effectivePlan, PLANS } from './plans'

export const paymentCommands = {
  'payouts.connect': command({
    summary: 'Get the link to set up (or finish setting up) payouts to your bank.',
    access: 'provider',
    mutates: true,
    assistant: false,
    input: z.object({}),
    run: async ({ actor, db }) => ({ url: await startPayoutOnboarding(db, actor.providerId) }),
  }),

  'payouts.refresh': command({
    summary: 'Re-check whether your payout account can take payments.',
    access: 'provider',
    mutates: true,
    assistant: false,
    input: z.object({}),
    run: ({ actor, db }) => refreshPayoutStatus(db, actor.providerId),
  }),

  'plan.get': command({
    summary: 'Your current plan (Free with a per-payment fee, or Pro monthly with no fee) and the options.',
    access: 'provider',
    mutates: false,
    input: z.object({}),
    run: async ({ actor, db }) => {
      const provider = await requireProvider(db, actor.providerId)
      return { current: effectivePlan(provider), status: provider.planStatus, plans: PLANS }
    },
  }),

  'plan.subscribe': command({
    summary: 'Get the checkout link to switch to Pro.',
    access: 'provider',
    mutates: true,
    assistant: false,
    input: z.object({}),
    run: async ({ actor, db }) => ({ url: await startProSubscription(db, actor.providerId) }),
  }),

  'plan.manage': command({
    summary: 'Get the link to manage or cancel your Pro subscription.',
    access: 'provider',
    mutates: true,
    assistant: false,
    input: z.object({}),
    run: async ({ actor, db }) => ({ url: await billingPortal(db, actor.providerId) }),
  }),

  'money.summary': command({
    summary: 'Your money: collected, refunded, fees in the last N days (default 30), and who still owes you.',
    access: 'provider',
    mutates: false,
    input: z.object({ days: z.number().int().min(1).max(366).default(30) }),
    run: ({ actor, db }, { days }) => moneySummary(db, actor.providerId, days),
  }),

  'payments.mine': command({
    summary: 'Your payments and receipts, and the card on file.',
    access: 'user',
    mutates: false,
    input: z.object({}),
    run: async ({ actor, db }) => ({ payments: await listMyPayments(db, actor), card: await defaultPaymentMethod(db, actor.userId) }),
  }),
}
