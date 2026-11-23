"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckboxField, MoneyField, SelectField, TextAreaField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'
import { US_TIME_ZONES } from '@/lib/time'
import type { Court } from '@/server/modules/providers/courts'
import type { ProviderSettings } from '@/server/modules/providers/profile'

export function ProviderSetupForm() {
  const router = useRouter()
  const setup = useCommand('provider.setup', { success: 'You’re set up' })
  const [coaching, setCoaching] = useState(true)
  const [hitting, setHitting] = useState(false)
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      if (await setup.run({ offersCoaching: coaching, offersHitting: hitting })) router.refresh()
    }}>
      <CheckboxField label="I coach tennis" checked={coaching} onChange={(e) => setCoaching(e.target.checked)} />
      <CheckboxField label="I’m a paid hitting partner" checked={hitting} onChange={(e) => setHitting(e.target.checked)} />
      <Button disabled={setup.pending || (!coaching && !hitting)}>Get started</Button>
    </form>
  )
}

const pctOptions = [0, 25, 50, 75, 100].map((v) => ({ value: String(v), label: v === 0 ? 'No fee' : `${v}% of the price` }))
const windowOptions = [0, 12, 24, 48, 72].map((v) => ({ value: String(v), label: v === 0 ? 'Any time before start' : `${v} hours before` }))

export function BusinessForm({ settings }: { settings: ProviderSettings }) {
  const router = useRouter()
  const save = useCommand('provider.update', { success: 'Saved' })
  const [form, setForm] = useState({
    slug: settings.slug, headline: settings.headline ?? '', bio: settings.bio ?? '', homeArea: settings.homeArea ?? '',
    timezone: settings.timezone, offersCoaching: settings.offersCoaching, offersHitting: settings.offersHitting,
    ratePrivateCents: settings.ratePrivateCents, rateSemiPrivateCents: settings.rateSemiPrivateCents,
    rateGroupCents: settings.rateGroupCents, rateHittingCents: settings.rateHittingCents,
    cancelWindowHours: settings.cancelWindowHours, lateCancelFeePct: settings.lateCancelFeePct,
    noShowFeePct: settings.noShowFeePct, listed: settings.listed,
  })
  const text = (key: 'slug' | 'headline' | 'bio' | 'homeArea') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value })

  return (
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault()
      if (await save.run(form)) router.refresh()
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <CheckboxField label="I coach" checked={form.offersCoaching} onChange={(e) => setForm({ ...form, offersCoaching: e.target.checked })} />
        <CheckboxField label="I offer paid hitting" checked={form.offersHitting} onChange={(e) => setForm({ ...form, offersHitting: e.target.checked })} />
        <TextField label="Headline" placeholder="USPTA pro · adult & junior development" value={form.headline} onChange={text('headline')} />
        <TextField label="Area" placeholder="Fremont & San Jose" value={form.homeArea} onChange={text('homeArea')} />
        <TextField label="Profile link" hint="vamoverse.app/p/your-link" value={form.slug} onChange={text('slug')} />
        <SelectField label="Time zone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} options={US_TIME_ZONES} />
      </div>
      <TextAreaField label="About you" value={form.bio} onChange={text('bio')} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Rates (per player, per session)</legend>
        {form.offersCoaching && <>
          <MoneyField label="Private lesson" cents={form.ratePrivateCents} onCents={(v) => setForm({ ...form, ratePrivateCents: v })} />
          <MoneyField label="Semi-private" cents={form.rateSemiPrivateCents} onCents={(v) => setForm({ ...form, rateSemiPrivateCents: v })} />
          <MoneyField label="Group clinic" cents={form.rateGroupCents} onCents={(v) => setForm({ ...form, rateGroupCents: v })} />
        </>}
        {form.offersHitting && <MoneyField label="Hitting session" cents={form.rateHittingCents} onCents={(v) => setForm({ ...form, rateHittingCents: v })} />}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Cancellation policy</legend>
        <SelectField label="Free cancellation until" value={String(form.cancelWindowHours)} options={windowOptions}
          onChange={(e) => setForm({ ...form, cancelWindowHours: Number(e.target.value) })} />
        <SelectField label="Late cancellation" value={String(form.lateCancelFeePct)} options={pctOptions}
          onChange={(e) => setForm({ ...form, lateCancelFeePct: Number(e.target.value) })} />
        <SelectField label="No-show" value={String(form.noShowFeePct)} options={pctOptions}
          onChange={(e) => setForm({ ...form, noShowFeePct: Number(e.target.value) })} />
      </fieldset>
      <p className="text-xs text-muted-foreground">Late cancels use a package credit, or charge the card on file. You can waive any fee with one tap.</p>

      <CheckboxField label="Show me in Find (players searching for coaches and hitters)" checked={form.listed}
        onChange={(e) => setForm({ ...form, listed: e.target.checked })} />
      <Button disabled={save.pending}>{save.pending ? 'Saving…' : 'Save settings'}</Button>
    </form>
  )
}

const EMPTY_COURT = { name: '', address: '', notes: '', bookingUrl: '', bookingNote: '' }

export function CourtsManager({ courts }: { courts: Court[] }) {
  const router = useRouter()
  const save = useCommand('courts.save', { success: 'Court saved' })
  const remove = useCommand('courts.delete')
  const [form, setForm] = useState(EMPTY_COURT)
  const set = (key: keyof typeof EMPTY_COURT) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })
  return (
    <div className="space-y-4">
      {courts.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {courts.map((court) => (
            <li key={court.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-medium">{court.name}</div>
                {court.address && <div className="text-muted-foreground">{court.address}</div>}
                {court.bookingNote && <div className="text-xs text-muted-foreground">Booking: {court.bookingNote}</div>}
              </div>
              <Button variant="ghost" size="sm" disabled={remove.pending}
                onClick={async () => { if (await remove.run({ courtId: court.id })) router.refresh() }}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault()
        if (!(await save.run(form))) return
        setForm(EMPTY_COURT)
        router.refresh()
      }}>
        <TextField label="Court name" required placeholder="Mitchell Park, courts 1–4" value={form.name} onChange={set('name')} />
        <TextField label="Address" value={form.address} onChange={set('address')} />
        <TextField label="Notes for players" placeholder="Park in the back lot" value={form.notes} onChange={set('notes')} />
        <TextField label="Court booking link (optional)" type="url" placeholder="https://" value={form.bookingUrl} onChange={set('bookingUrl')} />
        <TextField label="When booking opens (optional)" placeholder="7 days ahead at 8am" value={form.bookingNote} onChange={set('bookingNote')} />
        <div className="flex items-end"><Button variant="outline" disabled={save.pending}>Add court</Button></div>
      </form>
    </div>
  )
}
