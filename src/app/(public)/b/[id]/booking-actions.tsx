"use client"
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiUrl, useCommand } from '@/lib/client/api'
import type { PaymentRule } from '@/lib/format'
import type { BookingStatus } from '@/server/modules/bookings/status'

export function BookingActions({ bookingId, token, status, paymentRule, cancelSummary, canCancel }: {
  bookingId: string; token: string | null; status: BookingStatus; paymentRule: PaymentRule; cancelSummary: string | null; canCancel: boolean
}) {
  const router = useRouter()
  const checkout = useCommand('bookings.checkout')
  const cancel = useCommand('bookings.cancel', { success: 'Cancelled' })
  const decline = useCommand('bookings.declineInvite', { success: 'Declined' })
  const accept = useCommand('bookings.acceptInvite')
  const acceptInvite = async (allInSeries: boolean) => {
    const result = await accept.run({ bookingId, token, allInSeries })
    if (!result) return
    if (result.checkoutUrl) window.location.assign(result.checkoutUrl)
    else router.refresh()
  }
  const needsPayment = status === 'held' || status === 'offered' || status === 'invited'
  const calendarHref = apiUrl(`/api/bookings/${bookingId}/calendar${token ? `?t=${token}` : ''}`)

  return (
    <div className="space-y-3">
      {status === 'invited' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button disabled={accept.pending} onClick={() => acceptInvite(false)}>Confirm</Button>
          <Button variant="outline" disabled={accept.pending} onClick={() => acceptInvite(true)}>Confirm every week</Button>
        </div>
      )}
      {needsPayment && status !== 'invited' && (
        <Button className="w-full" disabled={checkout.pending} onClick={async () => {
          const result = await checkout.run({ bookingId, token })
          if (result) window.location.assign(result.checkoutUrl)
        }}>{paymentRule === 'pay_now' ? 'Pay to confirm' : 'Save a card to confirm'}</Button>
      )}
      {status === 'invited' && (
        <Button variant="outline" className="w-full" disabled={decline.pending}
          onClick={async () => { if (await decline.run({ bookingId, token })) router.refresh() }}>Can’t make it</Button>
      )}
      {(status === 'confirmed' || needsPayment) && (
        <a href={calendarHref} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold hover:bg-gray-50">
          <CalendarPlus className="h-4 w-4" aria-hidden /> Add to calendar
        </a>
      )}
      {canCancel && status !== 'invited' && (
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 text-sm text-muted-foreground">{status === 'waitlisted' || status === 'requested' ? 'Leave anytime, free.' : `Cancel: ${cancelSummary}`}</p>
          <Button variant="outline" className="w-full" disabled={cancel.pending} onClick={async () => {
            if (!window.confirm(`Cancel this booking? ${cancelSummary ?? ''}`)) return
            if (await cancel.run({ bookingId, token })) router.refresh()
          }}>{status === 'waitlisted' ? 'Leave the waitlist' : status === 'requested' ? 'Withdraw request' : 'Cancel booking'}</Button>
        </div>
      )}
    </div>
  )
}
