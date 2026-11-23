"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckboxField, SelectField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'

const EMPTY = { displayName: '', birthDate: '', gender: '', signatureName: '', consent: false }

export function AddJuniorForm() {
  const router = useRouter()
  const add = useCommand('family.addJunior', { success: 'Junior added' })
  const [form, setForm] = useState(EMPTY)
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      const junior = await add.run({
        displayName: form.displayName, birthDate: form.birthDate,
        gender: (form.gender || null) as 'male' | 'female' | 'nonbinary' | null,
        signatureName: form.signatureName, consent: form.consent as true,
      })
      if (!junior) return
      setForm(EMPTY)
      router.refresh()
    }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Junior’s name" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <TextField label="Birth date" type="date" required value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        <SelectField label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}
          options={[{ value: '', label: 'Prefer not to say' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'nonbinary', label: 'Non-binary' }]} />
      </div>
      <div className="rounded-xl bg-gray-50 p-4 text-sm">
        <CheckboxField required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })}
          label="I am this junior’s parent or legal guardian and consent to Vamoverse storing their name, birth date, and tennis details so coaches can run sessions for them."
          hint="For players under 13, your first card payment also verifies this consent. You can remove the junior and their data at any time." />
        <TextField className="mt-3" label="Type your full name to sign" required value={form.signatureName} onChange={(e) => setForm({ ...form, signatureName: e.target.value })} />
      </div>
      <Button disabled={add.pending}>{add.pending ? 'Adding…' : 'Add junior'}</Button>
    </form>
  )
}

export function RemoveJuniorButton({ playerId, name }: { playerId: string; name: string }) {
  const router = useRouter()
  const remove = useCommand('family.removeJunior', { success: `${name} removed` })
  return (
    <Button variant="ghost" size="sm" disabled={remove.pending} onClick={async () => {
      if (!window.confirm(`Remove ${name} and delete their data?`)) return
      if (await remove.run({ playerId })) router.refresh()
    }}>Remove</Button>
  )
}
