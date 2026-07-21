"use client"
import { useEffect } from "react"
import { logger } from "@/lib/logger"
import { Button } from "@/components/ui/button"

// Route-segment error boundary. Next.js renders this when a render/effect throws
// below the root layout. We log it (so it lands in the on-device buffer too) and
// offer a recovery action instead of a blank screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("react.render_error", { err: error, digest: error.digest })
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-4xl">🎾</div>
      <h1 className="text-lg font-semibold">Net cord — something broke</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        We hit an unexpected error. It&apos;s been logged. Try again?
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
