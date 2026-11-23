import { notFound } from 'next/navigation'
import { CenteredPage } from '@/components/brand'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/format'
import { devPaymentsEnabled } from '@/server/config'
import { db } from '@/server/db'
import { getPayment } from '@/server/modules/payments/core'
import { SimulateButtons } from './simulate-buttons'

const TITLES = {
  checkout: 'Test checkout',
  connect: 'Test payout setup',
  subscribe: 'Test Pro subscription',
  cancel_subscription: 'Test subscription management',
} as const

export default async function SimulatePage({ searchParams }: { searchParams: Promise<{ action?: string; id?: string }> }) {
  const { action, id } = await searchParams
  if (!devPaymentsEnabled()) notFound()
  if (!action || !id || !(action in TITLES)) notFound()
  const payment = action === 'checkout' ? await getPayment(db, id) : null
  const description = action === 'checkout'
    ? payment?.purpose === 'card_setup' ? 'Save a test card (Visa •••• 4242). You’ll be charged after the session.' : `Pay ${formatMoney(payment?.amountCents ?? 0)} with a test card (Visa •••• 4242).`
    : action === 'connect' ? 'Pretend you completed Stripe’s payout onboarding.'
      : action === 'subscribe' ? 'Start Pro at $39/month (test).' : 'Cancel Pro and return to the Free plan (test).'
  return (
    <CenteredPage>
      <Card>
        <CardHeader>
          <CardTitle>{TITLES[action as keyof typeof TITLES]}</CardTitle>
          <CardDescription>Development mode: no real money moves. In production this is Stripe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{description}</p>
          <SimulateButtons action={action} id={id} />
        </CardContent>
      </Card>
    </CenteredPage>
  )
}
