export type Compatibility = 'good' | 'stretch' | 'mismatch' | 'unknown'

export function getCompatibility(playerUTR: number | undefined, eventMin: number | undefined, eventMax: number | undefined): { status: Compatibility; label: string; delta: number } {
  if (playerUTR == null || eventMin == null || eventMax == null) {
    return { status: 'unknown', label: 'Level not set', delta: 0 }
  }
  // Additional guard: non-finite or out of realistic UTR range still computes delta but treat missing as unknown
  if (!isFinite(playerUTR) || !isFinite(eventMin) || !isFinite(eventMax)) {
    return { status: 'unknown', label: 'Level not set', delta: 0 }
  }

  const eventAvg = (eventMin + eventMax) / 2
  const delta = Math.abs(playerUTR - eventAvg)

  if (delta < 0.5) {
    return { status: 'good', label: `Good Match • Δ${delta.toFixed(1)}`, delta }
  }
  if (delta <= 1.0) {
    return { status: 'stretch', label: `Stretch • Δ${delta.toFixed(1)}`, delta }
  }
  return { status: 'mismatch', label: `Mismatch • Δ${delta.toFixed(1)}`, delta }
}

export function getCompatibilityColor(status: Compatibility) {
  switch(status) {
    case 'good': return 'bg-green-100 text-green-800 border-green-200'
    case 'stretch': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'mismatch': return 'bg-red-100 text-red-800 border-red-200'
    default: return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

export function parseUTR(input: string): number | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  const num = parseFloat(trimmed)
  // FIX N15/M6: UTR up to 16.5 not 10.5 - real UTR goes to 16.5 for college/pro, was incorrectly capped at 10.5
  if (isNaN(num) || num < 1 || num > 16.5) return null
  return Math.round(num * 100) / 100
}

export function getNTRPLabel(ntrp?: number): string {
  if (!ntrp) return 'Unrated'
  const labels: Record<string, string> = {
    '1.0': 'Beginner - Just starting',
    '2.0': 'Beginner - Needs on-court experience',
    '2.5': 'Beginner - Learning to judge ball',
    '3.0': 'Intermediate - Fairly consistent',
    '3.5': 'Intermediate - Improved stroke',
    '4.0': 'Advanced - Dependable strokes',
    '4.5': 'Advanced - Good footwork',
    '5.0': 'Expert - Good shot anticipation',
    '5.5': 'Expert - Power/consistency as weapons',
    '6.0': 'Expert - Tournament experience',
    '7.0': 'World Class'
  }
  return labels[ntrp.toFixed(1)] || `${ntrp} - ${ntrp < 3 ? 'Beginner' : ntrp < 4 ? 'Intermediate' : 'Advanced'}`
}

export function formatUTRHistory(history: {date: string, utr_singles?: number, utr_doubles?: number}[]) {
  return history.map(h => ({
    date: new Date(h.date).toLocaleDateString(),
    singles: h.utr_singles,
    doubles: h.utr_doubles
  }))
}
