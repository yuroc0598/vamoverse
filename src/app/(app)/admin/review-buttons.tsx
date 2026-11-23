"use client"
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useCommand } from '@/lib/client/api'

export function ReviewButtons({ providerId }: { providerId: string }) {
  const router = useRouter()
  const review = useCommand('admin.reviewSafety')
  const decide = async (approve: boolean) => { if (await review.run({ providerId, approve })) router.refresh() }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={review.pending} onClick={() => decide(true)}>Approve</Button>
      <Button size="sm" variant="outline" disabled={review.pending} onClick={() => decide(false)}>Reject</Button>
    </div>
  )
}
