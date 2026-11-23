// Payment history rows, shared by the coach's Money page and a player's receipts.
import { formatMoney, PAYMENT_PURPOSE_LABELS } from '@/lib/format'
import { formatDateTime } from '@/lib/time'

interface Row { id: string; purpose: string; status: string; amountCents: number; refundedCents: number; createdAt: Date }

export function PaymentRows<T extends Row>({ payments, who, timeZone }: { payments: T[]; who: (p: T) => string; timeZone: string }) {
  if (!payments.length) return <p className="text-sm text-muted-foreground">No payments yet.</p>
  return (
    <ul className="divide-y text-sm">
      {payments.map((p) => (
        <li key={p.id} className="flex justify-between gap-3 py-2">
          <span>
            {who(p)} · {PAYMENT_PURPOSE_LABELS[p.purpose] ?? p.purpose} · {formatDateTime(p.createdAt, timeZone)}
            {p.status === 'failed' ? ' · failed' : p.refundedCents ? ` · refunded ${formatMoney(p.refundedCents)}` : ''}
            {p.status === 'disputed' ? ' · disputed' : ''}
          </span>
          <span className="font-medium">{formatMoney(p.amountCents)}</span>
        </li>
      ))}
    </ul>
  )
}
