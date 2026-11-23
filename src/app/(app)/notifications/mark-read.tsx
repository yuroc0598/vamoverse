"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { call } from '@/lib/client/api'

/** Opening the list marks everything read (the badge clears on the next navigation). */
export function MarkReadOnView() {
  const router = useRouter()
  useEffect(() => {
    void call('notifications.markRead', {}).then(() => router.refresh())
  }, [router])
  return null
}
