"use client"
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Native share sheet on phones (WhatsApp, Messages…), copy-link elsewhere. */
export function ShareButton({ title, url }: { title: string; url?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={async () => {
      const link = url ?? window.location.href
      if (navigator.share) {
        await navigator.share({ title, url: link }).catch(() => undefined)
        return
      }
      await navigator.clipboard.writeText(link)
      toast.success('Link copied')
    }}>
      <Share2 className="mr-2 h-4 w-4" aria-hidden /> Share
    </Button>
  )
}
