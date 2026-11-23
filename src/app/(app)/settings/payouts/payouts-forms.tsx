"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckboxField, MoneyField, SelectField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'
import { KIND_LABELS, OFFERING_KINDS, formatMoney, type OfferingKind } from '@/lib/format'
import type { CommandInput } from '@/server/commands/registry'
import type { Package } from '@/server/modules/packages/packages'

/** Runs a command that returns a hosted URL and sends the browser there. */
function useRedirect<N extends 'payouts.connect' | 'plan.subscribe' | 'plan.manage'>(name: N) {
  const command = useCommand(name)
  return { pending: command.pending, go: async () => { const r = await command.run({} as CommandInput<N>); if (r) window.location.assign(r.url) } }
}

export function PayoutsButton({ connected }: { connected: boolean }) {
  const connect = useRedirect('payouts.connect')
  return <Button variant={connected ? 'outline' : 'default'} disabled={connect.pending} onClick={connect.go}>{connected ? 'Update bank details' : 'Connect payouts'}</Button>
}

export function PlanButtons({ current }: { current: 'free' | 'pro' }) {
  const subscribe = useRedirect('plan.subscribe')
  const manage = useRedirect('plan.manage')
  return current === 'free'
    ? <Button disabled={subscribe.pending} onClick={subscribe.go}>Switch to Pro</Button>
    : <Button variant="outline" disabled={manage.pending} onClick={manage.go}>Manage or cancel Pro</Button>
}

const EMPTY = { name: '', credits: 10, priceCents: null as number | null, validDays: '180', kinds: ['private'] as OfferingKind[] }

export function PackagesManager({ packages, canSell }: { packages: Package[]; canSell: boolean }) {
  const router = useRouter()
  const save = useCommand('packages.save', { success: 'Package saved' })
  const [form, setForm] = useState(EMPTY)
  return (
    <div className="space-y-4">
      {packages.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {packages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className={p.active ? '' : 'text-muted-foreground line-through'}>
                <span className="font-medium">{p.name}</span> · {p.credits} credits · {formatMoney(p.priceCents)}{p.validDays ? ` · ${p.validDays} days` : ''} · {p.kinds.map((k) => KIND_LABELS[k]).join(', ')}
              </span>
              <Button size="sm" variant="ghost" onClick={async () => { if (await save.run({ ...p, active: !p.active })) router.refresh() }}>{p.active ? 'Stop selling' : 'Sell again'}</Button>
            </li>
          ))}
        </ul>
      )}
      {!canSell && <p className="text-sm text-muted-foreground">Connect payouts to sell packages.</p>}
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        const saved = await save.run({ name: form.name, credits: form.credits, priceCents: form.priceCents ?? 0, validDays: form.validDays ? Number(form.validDays) : null, kinds: form.kinds })
        if (!saved) return
        setForm(EMPTY)
        router.refresh()
      }}>
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField className="sm:col-span-2" label="Name" placeholder="10 private lessons" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Credits" type="number" min={1} max={100} required value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} />
          <MoneyField label="Price" required cents={form.priceCents} onCents={(v) => setForm({ ...form, priceCents: v })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Expires" value={form.validDays} onChange={(e) => setForm({ ...form, validDays: e.target.value })}
            options={[{ value: '90', label: 'After 3 months' }, { value: '180', label: 'After 6 months' }, { value: '365', label: 'After 1 year' }, { value: '', label: 'Never' }]} />
          <fieldset className="flex flex-wrap gap-3 pt-6">
            <legend className="sr-only">Used for</legend>
            {OFFERING_KINDS.map((k) => (
              <CheckboxField key={k} label={KIND_LABELS[k]} checked={form.kinds.includes(k)}
                onChange={(e) => setForm({ ...form, kinds: e.target.checked ? [...form.kinds, k] : form.kinds.filter((x) => x !== k) })} />
            ))}
          </fieldset>
        </div>
        <Button variant="outline" disabled={!canSell || save.pending || !form.kinds.length}>Add package</Button>
      </form>
    </div>
  )
}
