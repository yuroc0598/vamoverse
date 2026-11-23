"use client"
// Create or edit a session series. Defaults (capacity, price) come from the
// provider's rate card so most sessions are three taps.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckboxField, ChoiceGroup, MoneyField, SelectField, TextAreaField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'
import { KIND_LABELS, WEEKDAY_LABELS, type OfferingKind, type PaymentRule } from '@/lib/format'
import { weekdayOf } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { Court } from '@/server/modules/providers/courts'
import type { ProviderSettings } from '@/server/modules/providers/profile'
import type { Offering } from '@/server/modules/schedule/offerings'

type Repeat = 'once' | 'weekly' | 'slots'

const DEFAULT_CAPACITY: Record<OfferingKind, number> = { private: 1, semi_private: 2, group: 8, hitting: 1 }

function defaultPrice(kind: OfferingKind, s: ProviderSettings): number | null {
  return { private: s.ratePrivateCents, semi_private: s.rateSemiPrivateCents, group: s.rateGroupCents, hitting: s.rateHittingCents }[kind]
}

export function OfferingForm({ settings, courts, offering, today }: {
  settings: ProviderSettings; courts: Court[]; offering?: Offering; today: string
}) {
  const router = useRouter()
  const create = useCommand('offerings.create', { success: 'Published' })
  const update = useCommand('offerings.update', { success: 'Saved' })
  const kinds = (Object.keys(KIND_LABELS) as OfferingKind[]).filter((k) => (k === 'hitting' ? settings.offersHitting : settings.offersCoaching))
  const initialKind = offering?.kind ?? kinds[0]
  const [form, setForm] = useState({
    kind: initialKind,
    title: offering?.title ?? KIND_LABELS[initialKind],
    description: offering?.description ?? '',
    repeat: (offering ? (offering.slotsPerDay > 1 ? 'slots' : offering.repeatWeekdays ? 'weekly' : 'once') : 'weekly') as Repeat,
    startDate: offering?.startDate ?? today,
    startTime: offering?.startTime ?? '18:00',
    durationMinutes: offering?.durationMinutes ?? 60,
    slotsPerDay: offering?.slotsPerDay ?? 4,
    repeatWeekdays: offering?.repeatWeekdays ?? [weekdayOf(today)],
    repeatEveryWeeks: offering?.repeatEveryWeeks ?? 1,
    endDate: offering?.endDate ?? '',
    capacity: offering?.capacity ?? DEFAULT_CAPACITY[initialKind],
    paymentRule: (offering?.paymentRule ?? (settings.chargesEnabled ? 'pay_now' : 'external')) as PaymentRule,
    priceCents: offering?.priceCents ?? defaultPrice(initialKind, settings),
    acceptsCredits: offering?.acceptsCredits ?? false,
    levelSystem: offering?.levelSystem ?? '',
    levelMin: offering?.levelMin?.toString() ?? '',
    levelMax: offering?.levelMax?.toString() ?? '',
    discipline: offering?.discipline ?? '',
    audience: offering?.audience ?? 'adults',
    visibility: offering?.visibility ?? 'public',
    courtId: offering?.courtId ?? courts[0]?.id ?? '',
    locationName: offering?.locationName ?? '',
    locationNote: offering?.locationNote ?? '',
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const oneOnOne = form.kind === 'private' || form.kind === 'hitting'

  function chooseKind(kind: OfferingKind) {
    setForm((f) => ({
      ...f, kind, capacity: DEFAULT_CAPACITY[kind], priceCents: defaultPrice(kind, settings),
      title: Object.values(KIND_LABELS).includes(f.title) ? KIND_LABELS[kind] : f.title,
      repeat: f.repeat === 'slots' && !(kind === 'private' || kind === 'hitting') ? 'weekly' : f.repeat,
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const payload = {
      title: form.title, description: form.description || null,
      discipline: (form.discipline || null) as Offering['discipline'], audience: form.audience,
      capacity: form.repeat === 'slots' ? 1 : form.capacity,
      priceCents: form.paymentRule === 'free' ? 0 : form.priceCents ?? 0, paymentRule: form.paymentRule,
      acceptsCredits: form.paymentRule !== 'free' && form.acceptsCredits,
      levelSystem: (form.levelSystem || null) as Offering['levelSystem'],
      levelMin: form.levelSystem ? num(form.levelMin) : null, levelMax: form.levelSystem ? num(form.levelMax) : null,
      visibility: form.visibility, courtId: form.courtId || null,
      locationName: form.courtId ? null : form.locationName || null, locationNote: form.locationNote || null,
      startDate: form.startDate, startTime: form.startTime, durationMinutes: form.durationMinutes,
      slotsPerDay: form.repeat === 'slots' ? form.slotsPerDay : 1,
      repeatWeekdays: form.repeat === 'once' ? null : form.repeatWeekdays,
      repeatEveryWeeks: form.repeatEveryWeeks, endDate: form.endDate || null,
    }
    if (offering) {
      const result = await update.run({ offeringId: offering.id, ...payload })
      if (!result) return
      if (result.keptWithBookings) window.alert(`${result.keptWithBookings} booked session(s) kept their original time. Move them individually if needed.`)
      router.refresh()
    } else {
      const result = await create.run({ kind: form.kind, ...payload })
      if (result) router.push(`/offerings/${result.offering.id}`)
    }
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      {!offering && kinds.length > 1 && (
        <ChoiceGroup label="What are you offering?" value={form.kind} onChange={chooseKind}
          options={kinds.map((k) => ({ value: k, label: KIND_LABELS[k] }))} />
      )}
      <TextField label="Title" required value={form.title} onChange={(e) => set('title', e.target.value)} />

      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">When</legend>
        <ChoiceGroup label="How often" value={form.repeat} onChange={(v) => set('repeat', v)} options={[
          { value: 'once', label: 'One time' },
          { value: 'weekly', label: 'Every week' },
          ...(oneOnOne ? [{ value: 'slots' as Repeat, label: 'Open slots', hint: 'Players pick a time inside your window' }] : []),
        ]} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label={form.repeat === 'once' ? 'Date' : 'Starting'} type="date" required min={offering ? undefined : today} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          <TextField label={form.repeat === 'slots' ? 'First slot starts' : 'Start time'} type="time" required value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
          <SelectField label={form.repeat === 'slots' ? 'Each slot' : 'Length'} value={String(form.durationMinutes)} onChange={(e) => set('durationMinutes', Number(e.target.value))}
            options={[30, 45, 60, 75, 90, 120, 180].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
        </div>
        {form.repeat === 'slots' && (
          <SelectField label="Slots per day" value={String(form.slotsPerDay)} onChange={(e) => set('slotsPerDay', Number(e.target.value))}
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}` }))} />
        )}
        {form.repeat !== 'once' && (
          <div className="space-y-3">
            <div role="group" aria-label="Days" className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, day) => {
                const on = form.repeatWeekdays.includes(day)
                return (
                  <button key={label} type="button" aria-pressed={on} onClick={() => set('repeatWeekdays', on ? form.repeatWeekdays.filter((d) => d !== day) : [...form.repeatWeekdays, day])}
                    className={cn('h-10 w-12 rounded-lg border text-sm', on ? 'border-clay-500 bg-clay-500 text-white' : 'bg-white')}>{label}</button>
                )
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Repeats" value={String(form.repeatEveryWeeks)} onChange={(e) => set('repeatEveryWeeks', Number(e.target.value))}
                options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? 'Every week' : `Every ${n} weeks` }))} />
              <TextField label="Ends (optional)" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">Price</legend>
        <SelectField label="How players pay" value={form.paymentRule} onChange={(e) => set('paymentRule', e.target.value as PaymentRule)} options={[
          { value: 'pay_now', label: 'Pay when booking' },
          { value: 'pay_after', label: 'Card saved, charged after the session' },
          { value: 'external', label: 'Pay me directly (cash, Venmo, Zelle)' },
          { value: 'free', label: 'Free' },
        ]} hint={!settings.chargesEnabled && (form.paymentRule === 'pay_now' || form.paymentRule === 'pay_after') ? 'Connect payouts in Settings to take card payments.' : undefined} />
        {form.paymentRule !== 'free' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField label="Price per player" required cents={form.priceCents} onCents={(v) => set('priceCents', v)} />
            <CheckboxField className="sm:pt-8" label="Package credits can be used" checked={form.acceptsCredits} onChange={(e) => set('acceptsCredits', e.target.checked)} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">Who</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {!oneOnOne && form.repeat !== 'slots' && (
            <TextField label="Players per session" type="number" min={form.kind === 'semi_private' ? 2 : 1} max={form.kind === 'semi_private' ? 4 : 40}
              required value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} />
          )}
          {!oneOnOne && (
            <SelectField label="Format" value={form.discipline} onChange={(e) => set('discipline', e.target.value as typeof form.discipline)} options={[
              { value: '', label: 'Any' }, { value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' },
              { value: 'womens_doubles', label: 'Women’s doubles' }, { value: 'mens_doubles', label: 'Men’s doubles' }, { value: 'mixed_doubles', label: 'Mixed doubles' },
            ]} />
          )}
          <SelectField label="Level guide" value={form.levelSystem} onChange={(e) => set('levelSystem', e.target.value as typeof form.levelSystem)}
            hint="Players outside the range can request to join; you approve." options={[
              { value: '', label: 'All levels' }, { value: 'ntrp', label: 'NTRP' }, { value: 'utr', label: 'UTR' }, { value: 'wtn', label: 'WTN' },
            ]} />
          {form.levelSystem && (
            <div className="grid grid-cols-2 gap-3">
              <TextField label="From" inputMode="decimal" value={form.levelMin} onChange={(e) => set('levelMin', e.target.value)} />
              <TextField label="To" inputMode="decimal" value={form.levelMax} onChange={(e) => set('levelMax', e.target.value)} />
            </div>
          )}
          <SelectField label="For" value={form.audience} onChange={(e) => set('audience', e.target.value as typeof form.audience)}
            hint={settings.safetyStatus !== 'verified' ? 'Junior sessions unlock after your safety check.' : undefined}
            options={[{ value: 'adults', label: 'Adults' }, { value: 'juniors', label: 'Juniors' }, { value: 'all', label: 'Adults and juniors' }]} />
          <SelectField label="Who can see it" value={form.visibility} onChange={(e) => set('visibility', e.target.value as typeof form.visibility)} options={[
            { value: 'public', label: 'Anyone with my page link' },
            { value: 'clients', label: 'Only my students' },
            { value: 'invite', label: 'Only players I add' },
          ]} />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">Where</legend>
        <SelectField label="Court" value={form.courtId} onChange={(e) => set('courtId', e.target.value)}
          options={[...courts.map((c) => ({ value: c.id, label: c.name })), { value: '', label: 'Somewhere else' }]} />
        {!form.courtId && <TextField label="Location" placeholder="Central Park courts" value={form.locationName} onChange={(e) => set('locationName', e.target.value)} />}
        <TextField label="Note for players (optional)" placeholder="Bring water; balls provided" value={form.locationNote} onChange={(e) => set('locationNote', e.target.value)} />
      </fieldset>

      <TextAreaField label="Description (optional)" value={form.description} onChange={(e) => set('description', e.target.value)} />
      <Button className="w-full sm:w-auto" disabled={create.pending || update.pending}>
        {offering ? (update.pending ? 'Saving…' : 'Save changes') : create.pending ? 'Publishing…' : 'Publish'}
      </Button>
    </form>
  )
}
