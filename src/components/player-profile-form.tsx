"use client"
// One form for any player profile you manage: your own or a junior's.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SelectField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'
import type { Player } from '@/server/modules/users/players'

export function PlayerProfileForm({ player, showName = false }: { player: Player; showName?: boolean }) {
  const router = useRouter()
  const save = useCommand('players.update', { success: 'Profile saved' })
  const [form, setForm] = useState({
    displayName: player.displayName,
    birthDate: player.birthDate ?? '',
    gender: player.gender ?? '',
    ntrp: player.ntrp?.toString() ?? '',
    utrSingles: player.utrSingles?.toString() ?? '',
    utrDoubles: player.utrDoubles?.toString() ?? '',
    utrProfileId: player.utrProfileId ?? '',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value })
  const isJunior = Boolean(player.guardianUserId)

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      const result = await save.run({
        playerId: player.id,
        displayName: showName ? form.displayName : undefined,
        birthDate: isJunior ? form.birthDate : undefined,
        gender: (form.gender || null) as Player['gender'],
        // Sent as typed; the server parses them (empty clears) and explains anything that isn't a number.
        ntrp: form.ntrp,
        utrSingles: form.utrSingles,
        utrDoubles: form.utrDoubles,
        utrProfileId: form.utrProfileId.trim() || null,
      })
      if (result) router.refresh()
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {showName && <TextField label="Name" required value={form.displayName} onChange={set('displayName')} />}
        {isJunior && <TextField label="Birth date" type="date" required value={form.birthDate} onChange={set('birthDate')} />}
        <SelectField label="Gender" hint="Only used for men’s, women’s, and mixed sessions." value={form.gender} onChange={set('gender')}
          options={[{ value: '', label: 'Prefer not to say' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'nonbinary', label: 'Non-binary' }]} />
        <TextField label="NTRP (optional)" inputMode="decimal" placeholder="e.g. 3.5" value={form.ntrp} onChange={set('ntrp')} />
        <TextField label="UTR singles (optional)" inputMode="decimal" value={form.utrSingles} onChange={set('utrSingles')} />
        <TextField label="UTR doubles (optional)" inputMode="decimal" value={form.utrDoubles} onChange={set('utrDoubles')} />
        <TextField label="UTR profile number (optional)" hint="The number at the end of your UTR profile link. Shown as self-reported."
          inputMode="numeric" value={form.utrProfileId} onChange={set('utrProfileId')} />
      </div>
      <p className="text-xs text-muted-foreground">Ratings are self-reported. Coaches can always approve players outside a session’s level range.</p>
      <Button disabled={save.pending}>{save.pending ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
