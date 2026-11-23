"use client"
// Opens (or reuses) a conversation and navigates to it. Used on Crew, sessions, coach pages.
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCommand } from '@/lib/client/api'

export function StartThreadButton({ target, label = 'Message', variant = 'outline' }: {
  target: { playerId: string } | { offeringId: string } | { providerId: string }
  label?: string
  variant?: 'outline' | 'ghost' | 'default'
}) {
  const router = useRouter()
  const start = useCommand('messages.start')
  return (
    <Button size="sm" variant={variant} disabled={start.pending} onClick={async () => {
      const result = await start.run(target)
      if (result) router.push(`/messages/${result.threadId}`)
    }}>
      <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />{label}
    </Button>
  )
}
