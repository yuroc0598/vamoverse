// Runs once when the server boots: fail closed if production is misconfigured.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return
  const { missingProductionConfig } = await import('@/server/config')
  const missing = missingProductionConfig()
  if (missing.length) throw new Error(`Production is not configured: missing ${missing.join(', ')}`)
}
