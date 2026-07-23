import { Discipline } from '../types/enums'

type PlayerGender = { id: string; gender: 'M' | 'F' | 'other' | 'unspecified' }

// FIX H3: Define explicit behavior for other/unspecified - only eligible for open_*
// FIX: Ensure all disciplines have symmetric length guards + gender checks
export function validateDiscipline(discipline: Discipline, players: PlayerGender[]): { valid: boolean; error?: string } {
  if (players.length === 0) return { valid: true }

  const counts = {
    M: players.filter(p => p.gender === 'M').length,
    F: players.filter(p => p.gender === 'F').length,
    other: players.filter(p => p.gender === 'other' || p.gender === 'unspecified').length
  }

  const total = players.length
  const hasNonBinary = counts.other > 0

  // FIX H3: Non-binary/other can only play open_* disciplines
  const isOpenDiscipline = discipline.startsWith('open')
  if (hasNonBinary && !isOpenDiscipline) {
    return { 
      valid: false, 
      error: `Gender 'other/unspecified' only eligible for Open Singles/Doubles. ${discipline} requires M/F. Players can compete in open events - contact support for category questions.` 
    }
  }

  switch (discipline) {
    case 'mens_singles':
      if (total > 2) return { valid: false, error: "Men's Singles requires exactly 2 players max" }
      if (counts.M !== total) return { valid: false, error: "Men's Singles requires all male players (M)" }
      return { valid: true }
    
    case 'womens_singles':
      // FIX: Added symmetric length guard - was missing in spec v1 per review H3
      if (total > 2) return { valid: false, error: "Women's Singles requires exactly 2 players max" }
      if (counts.F !== total) return { valid: false, error: "Women's Singles requires all female players (F)" }
      return { valid: true }
    
    case 'mens_doubles':
      if (total > 4) return { valid: false, error: "Men's Doubles requires exactly 4 players max" }
      if (counts.M !== total) return { valid: false, error: "Men's Doubles requires all male players (4M)" }
      return { valid: true }
    
    case 'womens_doubles':
      if (total > 4) return { valid: false, error: "Women's Doubles requires exactly 4 players max" }
      if (counts.F !== total) return { valid: false, error: "Women's Doubles requires all female players (4F)" }
      return { valid: true }
    
    case 'mixed_doubles':
      if (total === 4) {
        if (counts.M !== 2 || counts.F !== 2) {
          return { valid: false, error: "Mixed Doubles requires 2M and 2F exactly (currently M:" + counts.M + " F:" + counts.F + ")" }
        }
        return { valid: true }
      }
      // Partial: max 2M/2F never 3 of same gender, and other count already blocked above unless open
      if (counts.M > 2 || counts.F > 2) {
        return { valid: false, error: `Mixed Doubles max 2M & 2F, you have M:${counts.M} F:${counts.F} Other:${counts.other} - too many of one gender` }
      }
      if (hasNonBinary) {
        return { valid: false, error: "Mixed Doubles requires strictly 2M/2F - other/unspecified not eligible, please use Open Doubles" }
      }
      return { valid: true }
    
    case 'open_singles':
      if (total > 2) return { valid: false, error: "Open Singles requires max 2 players" }
      return { valid: true }
    
    case 'open_doubles':
      if (total > 4) return { valid: false, error: "Open Doubles requires max 4 players" }
      return { valid: true }
    
    case 'open':
      if (total > 20) return { valid: false, error: "Open events max 20 players for safety" }
      return { valid: true }
    
    default:
      return { valid: true }
  }
}

// Test cases per review H3 recommendation
export const GENDER_TEST_CASES = [
  { discipline: 'mens_singles' as Discipline, players: [{id:'1', gender:'M' as const},{id:'2', gender:'M' as const}], expect: true },
  { discipline: 'mens_singles' as Discipline, players: [{id:'1', gender:'M' as const},{id:'2', gender:'F' as const}], expect: false },
  { discipline: 'womens_singles' as Discipline, players: [{id:'1', gender:'F' as const},{id:'2', gender:'F' as const},{id:'3', gender:'F' as const}], expect: false, reason: 'over capacity' },
  { discipline: 'mixed_doubles' as Discipline, players: [{id:'1', gender:'M' as const},{id:'2', gender:'M' as const},{id:'3', gender:'M' as const},{id:'4', gender:'F' as const}], expect: false, reason: '3M1F invalid' },
  { discipline: 'mixed_doubles' as Discipline, players: [{id:'1', gender:'M' as const},{id:'2', gender:'M' as const},{id:'3', gender:'F' as const},{id:'4', gender:'F' as const}], expect: true },
  { discipline: 'open_doubles' as Discipline, players: [{id:'1', gender:'other' as const},{id:'2', gender:'M' as const}], expect: true, reason: 'other allowed in open' },
  { discipline: 'mens_doubles' as Discipline, players: [{id:'1', gender:'other' as const}], expect: false, reason: 'other not allowed in mens' },
]

export function getCapacityForDiscipline(discipline: Discipline, eventType: string): number {
  if (eventType === 'custom_match') {
    if (['mens_singles', 'womens_singles', 'open_singles'].includes(discipline)) return 2
    if (['mens_doubles', 'womens_doubles', 'mixed_doubles', 'open_doubles'].includes(discipline)) return 4
    if (discipline === 'open') return 20 // open generic max 20 per validateDiscipline
  }
  if (eventType === 'private') return 1
  if (eventType === 'semi_private') return 4 // max
  if (eventType === 'group_clinic') return 8 // default, up to 12
  return 2
}

export function suggestBalancedTeams(players: {id: string, utr?: number, name: string}[]): {teamA: typeof players, teamB: typeof players, delta: number, suggestion?: string} {
  if (players.length !== 4) {
    return { teamA: players.slice(0,2), teamB: players.slice(2,4), delta: 0 }
  }

  const definedUtrs = players.filter(p => typeof p.utr === 'number' && Number.isFinite(p.utr)).map(p => p.utr as number)
  const avgUTR = definedUtrs.length > 0 ? definedUtrs.reduce((a,b)=>a+b,0)/definedUtrs.length : 5.0
  const getUtr = (p: {utr?: number}) => (typeof p.utr === 'number' && Number.isFinite(p.utr) ? p.utr : avgUTR)

  const combinations = [
    [[0,1],[2,3]],
    [[0,2],[1,3]],
    [[0,3],[1,2]]
  ]
  
  let best = { combo: combinations[0], delta: Infinity }
  
  for (const [aIdx, bIdx] of combinations) {
    const teamA = aIdx.map(i => players[i])
    const teamB = bIdx.map(i => players[i])
    const utrA = teamA.reduce((sum, p) => sum + getUtr(p), 0)
    const utrB = teamB.reduce((sum, p) => sum + getUtr(p), 0)
    const delta = Math.abs(utrA - utrB)
    if (delta < best.delta) {
      best = { combo: [aIdx, bIdx], delta }
    }
  }
  
  const teamA = best.combo[0].map(i => players[i])
  const teamB = best.combo[1].map(i => players[i])
  
  let suggestion: string | undefined
  if (best.delta > 1.0) {
    suggestion = `Unbalanced (Δ${best.delta.toFixed(1)}). Try swapping ${teamA[0].name} with ${teamB[0].name} for fairer match`
  } else if (best.delta < 0.3) {
    suggestion = `Balanced! Δ${best.delta.toFixed(1)} - great match`
  }
  
  return { teamA, teamB, delta: best.delta, suggestion }
}
