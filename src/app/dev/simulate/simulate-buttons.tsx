"use client"
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { apiUrl } from '@/lib/client/api'

export function SimulateButtons({ action, id }: { action: string; id: string }) {
  const [pending, setPending] = useState(false)
  return (
    <div className="flex gap-3">
      <Button disabled={pending} onClick={async () => {
        setPending(true)
        const response = await fetch(apiUrl('/api/dev/simulate'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }),
        })
        const payload = await response.json()
        if (!response.ok) {
          setPending(false)
          return toast.error(payload.error?.message ?? 'Simulation failed')
        }
        window.location.assign(payload.data.redirect)
      }}>{pending ? 'Working…' : 'Complete'}</Button>
      <Button variant="outline" onClick={() => window.history.back()}>Go back</Button>
    </div>
  )
}
