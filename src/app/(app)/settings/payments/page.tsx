import { Section } from '@/components/page'
import { PaymentRows } from '@/components/payment-rows'
import { DEFAULT_TIME_ZONE } from '@/lib/time'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'

export default async function MyPaymentsPage() {
  const actor = await requireOnboarded()
  const { payments, card } = await runAs(actor)('payments.mine', {})
  return (
    <>
      <Section title="Card on file" description="Used for sessions charged after they happen and for any fees, per each coach’s policy.">
        <p className="text-sm">{card ? `${card.brand ?? 'Card'} •••• ${card.last4}` : 'No card saved yet. You’ll add one the first time you book a pay-after session.'}</p>
      </Section>
      <Section title="Receipts">
        <PaymentRows payments={payments} who={(p) => p.providerName} timeZone={DEFAULT_TIME_ZONE} />
      </Section>
    </>
  )
}
