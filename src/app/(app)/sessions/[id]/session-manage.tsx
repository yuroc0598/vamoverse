"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckboxField, SelectField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'
import { ROSTER_PAYMENT_LABELS, ROSTER_STATUS_LABELS, formatMoney } from '@/lib/format'
import type { RosterEntry } from '@/server/modules/bookings/queries'

export function Roster({ entries, started }: { entries: RosterEntry[]; started: boolean }) {
  const router = useRouter()
  const approve = useCommand('bookings.approve')
  const decline = useCommand('bookings.decline')
  const attendance = useCommand('bookings.attendance')
  const cancel = useCommand('bookings.cancel', { success: 'Removed and refunded' })
  const markPaid = useCommand('bookings.markPaid', { success: 'Marked paid' })
  const waive = useCommand('bookings.waiveFee', { success: 'Fee waived' })
  const act = async (promise: Promise<unknown>) => { if (await promise) router.refresh() }

  if (!entries.length) return <p className="mb-4 text-sm text-muted-foreground">No one yet. Share the session link or add a student below.</p>
  return (
    <ul className="mb-4 divide-y rounded-xl border">
      {entries.map((e) => {
        const status = ROSTER_STATUS_LABELS[e.status] ?? { label: e.status, variant: 'muted' as const }
        const owes = e.paymentStatus === 'due' || e.paymentStatus === 'failed'
        return (
          <li key={e.bookingId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-medium">{e.playerName}{e.junior && <span className="text-muted-foreground"> · junior (parent: {e.contactName})</span>}</div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant={status.variant}>{status.label}</Badge>
                {ROSTER_PAYMENT_LABELS[e.paymentStatus] && <span>{ROSTER_PAYMENT_LABELS[e.paymentStatus]}{owes ? ` ${formatMoney(e.priceCents)}` : ''}</span>}
                {e.contactPhone && <a className="underline" href={`sms:${e.contactPhone}`}>Text</a>}
                {e.contactEmail && <a className="underline" href={`mailto:${e.contactEmail}`}>Email</a>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {e.status === 'requested' && <>
                <Button size="sm" onClick={() => act(approve.run({ bookingId: e.bookingId }))}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => act(decline.run({ bookingId: e.bookingId }))}>Decline</Button>
              </>}
              {started && (e.status === 'confirmed' || e.status === 'no_show' || e.status === 'attended') && <>
                {e.status !== 'attended' && <Button size="sm" variant="outline" onClick={() => act(attendance.run({ bookingId: e.bookingId, outcome: 'attended' }))}>Attended</Button>}
                {e.status !== 'no_show' && <Button size="sm" variant="outline" onClick={() => act(attendance.run({ bookingId: e.bookingId, outcome: 'no_show' }))}>No-show</Button>}
              </>}
              {owes && e.paymentRule === 'external' && <Button size="sm" variant="outline" onClick={() => act(markPaid.run({ bookingId: e.bookingId }))}>Mark paid</Button>}
              {owes && e.status !== 'confirmed' && <Button size="sm" variant="ghost" onClick={() => act(waive.run({ bookingId: e.bookingId }))}>Waive</Button>}
              {!started && ['confirmed', 'held', 'invited', 'offered', 'waitlisted'].includes(e.status) && (
                <Button size="sm" variant="ghost" onClick={() => {
                  if (window.confirm(`Remove ${e.playerName}? They’ll be notified and refunded in full.`)) void act(cancel.run({ bookingId: e.bookingId }))
                }}>Remove</Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function AddStudent({ sessionId, clients }: { sessionId: string; clients: { id: string; name: string }[] }) {
  const router = useRouter()
  const add = useCommand('bookings.addPlayer')
  const [playerId, setPlayerId] = useState(clients[0]?.id ?? '')
  const [allFuture, setAllFuture] = useState(false)
  if (!clients.length) return <p className="text-sm text-muted-foreground">Add students in Crew to book them here.</p>
  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={async (e) => {
      e.preventDefault()
      const result = await add.run({ sessionId, playerId, allFuture })
      if (!result) return
      const skipped = result.results.filter((r) => r.status === 'skipped').length
      window.alert(`Added to ${result.added} session${result.added === 1 ? '' : 's'}.${skipped ? ` ${skipped} skipped (full or not eligible).` : ''}`)
      router.refresh()
    }}>
      <SelectField className="flex-1" label="Add a student" value={playerId} onChange={(e) => setPlayerId(e.target.value)} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
      <CheckboxField label="Every week" checked={allFuture} onChange={(e) => setAllFuture(e.target.checked)} />
      <Button variant="outline" disabled={add.pending}>Add</Button>
    </form>
  )
}

export function EditSession(props: {
  sessionId: string; date: string; time: string; duration: number; capacity: number; note: string
  courtStatus: string; courtConfirmation: string; courtBookingUrl: string | null; courtBookingNote: string | null
}) {
  const router = useRouter()
  const save = useCommand('sessions.update')
  const [form, setForm] = useState({ date: props.date, time: props.time, duration: props.duration, capacity: props.capacity, note: props.note, courtStatus: props.courtStatus, courtConfirmation: props.courtConfirmation })
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      const result = await save.run({
        sessionId: props.sessionId, date: form.date, startTime: form.time, durationMinutes: form.duration, capacity: form.capacity,
        note: form.note || null, courtStatus: form.courtStatus as 'unknown', courtConfirmation: form.courtConfirmation || null,
      })
      if (!result) return
      if (result.notified) window.alert(`${result.notified} player${result.notified === 1 ? '' : 's'} notified of the new time.`)
      router.refresh()
    }}>
      <div className="grid gap-4 sm:grid-cols-4">
        <TextField label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <TextField label="Time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        <TextField label="Minutes" type="number" min={15} max={480} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
        <TextField label="Spots" type="number" min={1} max={40} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Court" value={form.courtStatus} onChange={(e) => setForm({ ...form, courtStatus: e.target.value })} options={[
          { value: 'unknown', label: 'Not set' }, { value: 'needs_booking', label: 'Needs booking' }, { value: 'booked', label: 'Booked' }, { value: 'walk_up', label: 'First-come courts' },
        ]} hint={props.courtBookingNote ? `Booking opens: ${props.courtBookingNote}` : undefined} />
        {form.courtStatus === 'booked' && <TextField label="Confirmation #" value={form.courtConfirmation} onChange={(e) => setForm({ ...form, courtConfirmation: e.target.value })} />}
      </div>
      {props.courtBookingUrl && form.courtStatus !== 'booked' && (
        <a href={props.courtBookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-court-500 underline">
          Book the court <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
      <TextField label="Note for players" placeholder="Bring water; we’re on court 4 today" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <Button disabled={save.pending}>{save.pending ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}

export function CancelSession({ sessionId, date }: { sessionId: string; date: string }) {
  const router = useRouter()
  const cancelOne = useCommand('sessions.cancel')
  const cancelDay = useCommand('sessions.cancelDay')
  const [reason, setReason] = useState('Rain')
  return (
    <div className="space-y-3">
      <TextField label="Reason (shared with players)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={cancelOne.pending} onClick={async () => {
          if (!window.confirm('Cancel this session and notify everyone?')) return
          const result = await cancelOne.run({ sessionId, reason })
          if (result) { window.alert(`Cancelled. ${result.notified} notified.`); router.refresh() }
        }}>Cancel this session</Button>
        <Button variant="outline" disabled={cancelDay.pending} onClick={async () => {
          if (!window.confirm(`Cancel ALL your sessions on ${date}?`)) return
          const result = await cancelDay.run({ date, reason })
          if (result) { window.alert(`Cancelled ${result.cancelled} sessions. ${result.notified} players notified.`); router.push('/schedule') }
        }}>Rain out the whole day</Button>
      </div>
    </div>
  )
}
