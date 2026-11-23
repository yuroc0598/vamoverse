import Link from 'next/link'
import { PageHeader, Section } from '@/components/page'
import { PaymentRows } from '@/components/payment-rows'
import { formatMoney } from '@/lib/format'
import { formatDateTime } from '@/lib/time'
import { requireProviderPage } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'

export default async function MoneyPage() {
  const actor = await requireProviderPage()
  const run = runAs(actor)
  const [money, settings, plan, sold] = await Promise.all([run('money.summary', {}), run('provider.settings', {}), run('plan.get', {}), run('credits.sold', {})])
  const tz = settings.timezone
  const net = money.collectedCents - money.refundedCents - money.feesCents
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Money" description="Last 30 days. Card processing is deducted by Stripe before payout." />
      {!settings.chargesEnabled && (
        <Link href="/settings/payouts" className="block rounded-xl bg-amber-50 p-4 text-sm hover:bg-amber-100">Connect payouts to take card payments →</Link>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Collected', money.collectedCents], ['Refunded', money.refundedCents],
          [plan.current === 'pro' ? 'Platform fees (Pro: none)' : `Platform fees (${plan.plans.free.feeBps / 100}%)`, money.feesCents], ['Net', net],
        ].map(([label, cents]) => (
          <div key={label} className="rounded-2xl border bg-white p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-bold">{formatMoney(cents as number)}</div>
          </div>
        ))}
      </div>
      <Section title={`Owed to you (${formatMoney(money.owedCents)})`} description="Mark cash/Venmo payments as paid from the session page.">
        {money.owed.length === 0 ? <p className="text-sm text-muted-foreground">Everyone’s paid up.</p> : (
          <ul className="divide-y text-sm">
            {money.owed.map((o) => (
              <li key={o.bookingId} className="flex justify-between gap-3 py-2">
                <span>{o.playerName} · {o.sessionTitle} · {formatDateTime(o.startsAt, tz)}{o.paymentStatus === 'failed' ? ' · card failed' : o.paymentRule === 'external' ? ' · pay outside app' : ''}</span>
                <span className="font-medium">{formatMoney(o.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Recent payments">
        <PaymentRows payments={money.recent} who={(p) => p.payerName} timeZone={tz} />
      </Section>
      {sold.length > 0 && (
        <Section title="Packages sold">
          <ul className="divide-y text-sm">
            {sold.map((p) => <li key={p.id} className="py-2">{p.name} · {p.creditsTotal - p.creditsUsed} of {p.creditsTotal} credits left</li>)}
          </ul>
        </Section>
      )}
    </div>
  )
}
