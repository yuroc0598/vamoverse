// Provider plans. Free: no monthly fee, small platform fee per payment.
// Pro: flat monthly subscription, no platform fee. Card processing applies to both.
export type PlanId = 'free' | 'pro'

export const PLANS: Record<PlanId, { label: string; monthlyCents: number; feeBps: number; summary: string }> = {
  free: { label: 'Free', monthlyCents: 0, feeBps: 200, summary: '$0/month · 2% per payment' },
  pro: { label: 'Pro', monthlyCents: 3900, feeBps: 0, summary: '$39/month · no per-payment fee' },
}

export function effectivePlan(provider: { plan: PlanId; planStatus: string | null }): PlanId {
  return provider.plan === 'pro' && (provider.planStatus === 'active' || provider.planStatus === 'past_due') ? 'pro' : 'free'
}

export function platformFeeCents(plan: PlanId, amountCents: number): number {
  return Math.round((amountCents * PLANS[plan].feeBps) / 10_000)
}
