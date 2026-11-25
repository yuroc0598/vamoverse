"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckboxField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'

export function AccountForm(props: { displayName: string; notifyEmail: boolean; notifySms: boolean; notifyPush: boolean; hasPhone: boolean }) {
  const router = useRouter()
  const save = useCommand('account.update', { success: 'Saved' })
  const [form, setForm] = useState({ displayName: props.displayName, notifyEmail: props.notifyEmail, notifySms: props.notifySms, notifyPush: props.notifyPush })
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      if (await save.run(form)) router.refresh()
    }}>
      <TextField label="Name" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Reminders and updates</legend>
        <CheckboxField label="Email" checked={form.notifyEmail} onChange={(e) => setForm({ ...form, notifyEmail: e.target.checked })} />
        <CheckboxField label="Text message" hint={props.hasPhone ? undefined : 'Sign in with your phone number to get texts.'}
          checked={form.notifySms} disabled={!props.hasPhone} onChange={(e) => setForm({ ...form, notifySms: e.target.checked })} />
        <CheckboxField label="Push notifications" hint="On iPhones with the Vamoverse app, after you allow notifications."
          checked={form.notifyPush} onChange={(e) => setForm({ ...form, notifyPush: e.target.checked })} />
      </fieldset>
      <Button disabled={save.pending}>{save.pending ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}

export function DeleteAccount() {
  const router = useRouter()
  const remove = useCommand('account.delete')
  return (
    <Button variant="outline" disabled={remove.pending} onClick={async () => {
      const typed = window.prompt('This permanently deletes your account and your juniors’ data. Type DELETE to confirm.')
      if (typed !== 'DELETE') return
      if (await remove.run({ confirm: 'DELETE' })) {
        await fetch('/api/auth/signout', { method: 'POST' })
        router.replace('/')
      }
    }}>Delete my account</Button>
  )
}
