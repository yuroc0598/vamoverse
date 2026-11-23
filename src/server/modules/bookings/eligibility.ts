// Who may take a seat in a session. Hard rules (audience, gendered formats) block;
// level guidance never blocks — out-of-range or unrated players request and the coach approves.
import type { Player } from '../users/players'
import type { SessionView } from '../schedule/sessions'

export type Eligibility = { ok: true; needsApproval: boolean; reason?: string } | { ok: false; reason: string }

const LEVEL_FIELD = { ntrp: 'ntrp', wtn: 'wtn' } as const

function playerRating(player: Player, session: Pick<SessionView, 'levelSystem' | 'discipline'>): number | null {
  if (!session.levelSystem) return null
  if (session.levelSystem === 'utr') {
    const doubles = session.discipline?.includes('doubles')
    return (doubles ? player.utrDoubles ?? player.utrSingles : player.utrSingles ?? player.utrDoubles) ?? null
  }
  return player[LEVEL_FIELD[session.levelSystem]] ?? null
}

/** `sameGenderSeats`: seats already held by players of this player's gender (mixed formats only). */
export function checkEligibility(session: SessionView, player: Player, sameGenderSeats = 0): Eligibility {
  const junior = player.guardianUserId !== null
  if (junior && session.audience === 'adults') return { ok: false, reason: 'This session is for adults.' }
  if (!junior && session.audience === 'juniors') return { ok: false, reason: 'This session is for juniors.' }

  const format = session.discipline
  if (format === 'mens_doubles' || format === 'womens_doubles' || format === 'mixed_doubles') {
    if (!player.gender || player.gender === 'nonbinary') {
      return { ok: false, reason: player.gender ? 'This format is for men’s and women’s spots; choose an open session.' : 'Add your gender in your profile to join men’s, women’s, or mixed sessions.' }
    }
    if (format === 'mens_doubles' && player.gender !== 'male') return { ok: false, reason: 'This is a men’s session.' }
    if (format === 'womens_doubles' && player.gender !== 'female') return { ok: false, reason: 'This is a women’s session.' }
    if (format === 'mixed_doubles' && sameGenderSeats >= Math.ceil(session.capacity / 2)) {
      return { ok: false, reason: `The ${player.gender === 'male' ? 'men’s' : 'women’s'} spots in this mixed session are full.` }
    }
  }

  if (session.levelSystem) {
    const rating = playerRating(player, session)
    const name = session.levelSystem.toUpperCase()
    if (rating === null) return { ok: true, needsApproval: true, reason: `No ${name} on your profile, so the coach will confirm your spot.` }
    if ((session.levelMin !== null && rating < session.levelMin) || (session.levelMax !== null && rating > session.levelMax)) {
      return { ok: true, needsApproval: true, reason: `Your ${name} ${rating} is outside this session’s range, so the coach will confirm your spot.` }
    }
  }
  return { ok: true, needsApproval: false }
}
