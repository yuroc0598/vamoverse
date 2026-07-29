export const AUTO_CAPTURE_DELAY_MINUTES_DEFAULT = 120

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
}

export function getAutoCaptureDelayMinutes(): number {
  if (isDemoMode()) return 2
  const raw = process.env.AUTO_CAPTURE_DELAY_MINUTES || process.env.NEXT_PUBLIC_AUTO_CAPTURE_DELAY_MINUTES || `${AUTO_CAPTURE_DELAY_MINUTES_DEFAULT}`
  const parsed = parseInt(raw, 10)
  if (isNaN(parsed) || parsed <= 0) return AUTO_CAPTURE_DELAY_MINUTES_DEFAULT
  return parsed
}

export function getAutoCaptureDelayMs(): number {
  return getAutoCaptureDelayMinutes() * 60 * 1000
}
