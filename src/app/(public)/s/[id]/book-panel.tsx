"use client"
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckboxField, SelectField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'
import type { PaymentRule } from '@/lib/format'

interface Props {
  sessionId: string
  signedIn: boolean
  family: { id: string; name: string; junior: boolean }[]
  credits: number
  full: boolean
  paymentRule: PaymentRule
}

export function BookPanel({ sessionId, signedIn, family, credits, full, paymentRule }: Props) {
  const router = useRouter()
  const book = useCommand('bookings.create')
  const [playerId, setPlayerId] = useState(family[0]?.id ?? '')
  const [useCredit, setUseCredit] = useState(true)
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' })
  const label = full ? 'Join the waitlist' : paymentRule === 'pay_now' && !(credits && useCredit) ? 'Book and pay' : paymentRule === 'pay_after' ? 'Book (pay after)' : 'Book'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const result = await book.run(signedIn
      ? { sessionId, playerId, useCredit }
      : { sessionId, guest: { name: guest.name, email: guest.email || null, phone: guest.phone || null } })
    if (!result) return
    if (result.checkoutUrl) window.location.assign(result.checkoutUrl)
    else router.push(result.manageUrl)
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-6">
      <h2 className="font-semibold">{full ? 'This session is full' : 'Book your spot'}</h2>
      {full && <p className="text-sm text-muted-foreground">Join the waitlist. If a spot opens we’ll text and email you right away; nothing is charged until then.</p>}
      {signedIn ? (
        <>
          {family.length > 1 && (
            <SelectField label="Who’s playing?" value={playerId} onChange={(e) => setPlayerId(e.target.value)}
              options={family.map((p) => ({ value: p.id, label: p.junior ? `${p.name} (junior)` : `${p.name} (me)` }))} />
          )}
          {credits > 0 && <CheckboxField label={`Use a package credit (${credits} left)`} checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">No account needed. <Link className="underline" href={`/login?next=/s/${sessionId}`}>Sign in</Link> to book for your kids or use package credits.</p>
          <TextField label="Your name" autoComplete="name" required value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Email" type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
            <TextField label="Mobile (for reminders)" type="tel" autoComplete="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
          </div>
        </>
      )}
      <Button className="w-full" disabled={book.pending}>{book.pending ? 'Booking…' : label}</Button>
    </form>
  )
}
