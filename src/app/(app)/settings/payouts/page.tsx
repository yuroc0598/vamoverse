import { Section } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/format'
import { requireProviderPage } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { PackagesManager, PayoutsButton, PlanButtons } from './payouts-forms'

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ returned?: string; subscribed?: string }> }) {
  const actor = await requireProviderPage()
  const run = runAs(actor)
  const params = await searchParams
  const settings = params.returned ? { ...(await run('provider.settings', {})), ...(await run('payouts.refresh', {})) } : await run('provider.settings', {})
  const [plan, packages] = await Promise.all([run('plan.get', {}), run('packages.list', {})])
  return (
    <>
      {params.subscribed && <p className="rounded-xl bg-green-50 p-4 text-sm text-green-900">You’re on Pro. No more per-payment platform fees.</p>}
      <Section title="Payouts" description="Card payments go straight to your bank through Stripe. Processing fees are deducted by Stripe.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant={settings.chargesEnabled ? 'success' : 'warning'}>
            {settings.chargesEnabled ? (settings.payoutsEnabled ? 'Taking payments · payouts on' : 'Taking payments · finish bank details') : settings.stripeAccountId ? 'Setup not finished' : 'Not connected'}
          </Badge>
          <PayoutsButton connected={settings.chargesEnabled && settings.payoutsEnabled} />
        </div>
      </Section>
      <Section title="Plan" description="Switch any time. Card processing fees apply on both plans.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['free', 'pro'] as const).map((id) => (
            <div key={id} className={`rounded-xl border p-4 ${plan.current === id ? 'border-clay-500 ring-1 ring-clay-500' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{plan.plans[id].label}</span>
                {plan.current === id && <Badge>Current</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{plan.plans[id].summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {id === 'free' ? 'Best while you’re starting out.' : `Saves money once you take more than ${formatMoney(Math.round(plan.plans.pro.monthlyCents / (plan.plans.free.feeBps / 10_000)))} a month in card payments.`}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4"><PlanButtons current={plan.current} /></div>
      </Section>
      <Section title="Packages" description="Sell prepaid credits (e.g. 10 privates). Credits apply automatically when students book, and late cancels use up the credit.">
        <PackagesManager packages={packages} canSell={settings.chargesEnabled} />
      </Section>
    </>
  )
}
