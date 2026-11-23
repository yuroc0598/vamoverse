"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SelectField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'

export function SafetyForm({ status }: { status: 'none' | 'pending' | 'verified' | 'rejected' }) {
  const router = useRouter()
  const submit = useCommand('safety.submit', { success: 'Submitted for review' })
  const [method, setMethod] = useState<'usta_safe_play' | 'background_check'>('usta_safe_play')
  const [reference, setReference] = useState('')
  if (status === 'verified') return <p className="text-sm text-green-800">Approved. You can offer sessions for juniors.</p>
  if (status === 'pending') return <p className="text-sm">Submitted. We’ll notify you once it’s reviewed, usually within a business day.</p>
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault()
      if (await submit.run({ method, reference })) router.refresh()
    }}>
      {status === 'rejected' && <p className="text-sm text-red-700">We couldn’t verify the last submission. Check the details and try again.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Proof" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} options={[
          { value: 'usta_safe_play', label: 'USTA Safe Play (current)' },
          { value: 'background_check', label: 'Background check + SafeSport training' },
        ]} />
        <TextField label={method === 'usta_safe_play' ? 'USTA member number' : 'Screening provider and reference'} required value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <Button variant="outline" disabled={submit.pending}>Submit for review</Button>
    </form>
  )
}
