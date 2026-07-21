"use client"
import { useEffect } from "react"
import { logger } from "@/lib/logger"

// Last-resort boundary: catches errors thrown by the root layout itself. It
// replaces the whole document, so it must render its own <html>/<body> and can't
// rely on app styles/components.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("react.global_error", { err: error, digest: error.digest })
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem", padding: "1.5rem", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem" }}>🎾</div>
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Vamoverse crashed</h1>
        <p style={{ fontSize: "0.875rem", color: "#666", maxWidth: "24rem" }}>
          A fatal error occurred and has been logged. Please reload.
        </p>
        <button onClick={reset} style={{ padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid #ccc", cursor: "pointer" }}>
          Reload
        </button>
      </body>
    </html>
  )
}
