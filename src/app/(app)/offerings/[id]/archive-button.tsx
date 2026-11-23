"use client"
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useCommand } from '@/lib/client/api'

export function ArchiveOfferingButton({ offeringId }: { offeringId: string }) {
  const router = useRouter()
  const archive = useCommand('offerings.archive')
  return (
    <Button variant="outline" size="sm" disabled={archive.pending} onClick={async () => {
      if (!window.confirm('Stop this series? Future sessions without bookings are removed. Booked sessions stay until you cancel them.')) return
      const result = await archive.run({ offeringId })
      if (!result) return
      if (result.keptWithBookings) window.alert(`${result.keptWithBookings} booked session(s) remain on your schedule. Cancel them individually to notify players.`)
      router.push('/schedule')
    }}>Stop series</Button>
  )
}
