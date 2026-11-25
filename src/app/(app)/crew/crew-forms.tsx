"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TextAreaField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'
import { parseContacts } from '@/lib/contacts'

export function ImportContacts() {
  const router = useRouter()
  const importInvites = useCommand('clients.import')
  const [text, setText] = useState('')
  const { rows, skipped } = parseContacts(text)
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault()
      const result = await importInvites.run({ contacts: rows })
      if (!result) return
      const failed = result.failed.length ? ` Couldn’t add: ${result.failed.map((f) => `${f.name} (${f.reason})`).join(', ')}.` : ''
      window.alert(`Saved ${result.added} invite${result.added === 1 ? '' : 's'}.${result.duplicates ? ` ${result.duplicates} already invited.` : ''}${failed} Send them from the list below.`)
      setText('')
      router.refresh()
    }}>
      <TextAreaField label="Students" placeholder={'Maya Chen, maya@example.com\nSam Lee, (415) 555-0100'} value={text} onChange={(e) => setText(e.target.value)} />
      {text && <p className="text-xs text-muted-foreground">{rows.length} ready to add{skipped.length ? ` · ${skipped.length} line(s) need an email or phone` : ''}</p>}
      <Button disabled={!rows.length || importInvites.pending}>{importInvites.pending ? 'Saving…' : `Save ${rows.length || ''} invite${rows.length === 1 ? '' : 's'}`}</Button>
    </form>
  )
}

export function ClientNotes({ playerId, notes }: { playerId: string; notes: string }) {
  const save = useCommand('clients.update', { success: 'Notes saved' })
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(notes)
  if (!open) {
    return (
      <button className="mt-1 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
        {notes ? `Notes: ${notes}` : '+ Private notes'}
      </button>
    )
  }
  return (
    <form className="mt-2 flex gap-2" onSubmit={async (e) => {
      e.preventDefault()
      if (await save.run({ playerId, notes: value || null })) setOpen(false)
    }}>
      <label htmlFor={`notes-${playerId}`} className="sr-only">Private notes</label>
      <input id={`notes-${playerId}`} autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="h-9 flex-1 rounded-lg border px-3 text-sm" placeholder="Only you can see this" />
      <Button size="sm" disabled={save.pending}>Save</Button>
    </form>
  )
}

/** Opens the coach's own Messages or mail app with the invite filled in; Vamoverse sends nothing on their behalf. */
export function InviteRow({ invite }: { invite: { id: string; name: string; email: string | null; phone: string | null; subject: string; message: string } }) {
  const router = useRouter()
  const remove = useCommand('clients.removeInvite')
  const { subject, message } = invite
  return (
    <li className="flex items-center justify-between gap-3 p-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{invite.name}</div>
        <div className="truncate text-xs text-muted-foreground">{[invite.email, invite.phone].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="flex shrink-0 gap-3">
        {invite.phone && <a className="text-court-500 underline" href={`sms:${invite.phone}?&body=${encodeURIComponent(message)}`}>Text</a>}
        {invite.email && <a className="text-court-500 underline" href={`mailto:${invite.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>Email</a>}
        <button className="text-muted-foreground hover:text-foreground" disabled={remove.pending}
          onClick={async () => { if (await remove.run({ inviteId: invite.id })) router.refresh() }}>Remove</button>
      </div>
    </li>
  )
}
