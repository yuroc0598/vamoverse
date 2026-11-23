// Player profiles: an adult's own profile and the juniors they manage.
import { z } from 'zod'
import { maybeOne, updateRow, type Db } from '../../db'
import { fail } from '../../errors'
import { gender, isoDate, personName, ratings } from '../../schemas'
import { setDisplayName, type Actor } from './accounts'

export interface Player {
  id: string
  userId: string | null
  guardianUserId: string | null
  displayName: string
  birthDate: string | null
  gender: 'male' | 'female' | 'nonbinary' | null
  utrSingles: number | null
  utrDoubles: number | null
  ntrp: number | null
  wtn: number | null
  utrProfileId: string | null
}

const PLAYER_COLUMNS = `p.id, p.user_id AS "userId", p.guardian_user_id AS "guardianUserId",
  p.display_name AS "displayName", p.birth_date AS "birthDate", p.gender,
  p.utr_singles AS "utrSingles", p.utr_doubles AS "utrDoubles", p.ntrp, p.wtn, p.utr_profile_id AS "utrProfileId"`

export async function getPlayer(db: Db, playerId: string): Promise<Player | null> {
  return maybeOne<Player>(db, `SELECT ${PLAYER_COLUMNS} FROM players p WHERE p.id = $1`, [playerId])
}

/** The player if the actor is that player or their guardian. */
export async function requireManagedPlayer(db: Db, actor: Actor, playerId: string): Promise<Player> {
  const player = await getPlayer(db, playerId)
  if (!player) throw fail.notFound('Player')
  if (player.userId !== actor.userId && player.guardianUserId !== actor.userId) throw fail.forbidden()
  return player
}

export async function listFamily(db: Db, actor: Actor): Promise<Player[]> {
  return db.query<Player>(
    `SELECT ${PLAYER_COLUMNS} FROM players p WHERE p.user_id = $1 OR p.guardian_user_id = $1
     ORDER BY p.guardian_user_id IS NOT NULL, p.display_name`, [actor.userId])
}

export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [y, m, d] = onDate.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export const playerUpdateInput = z.object({
  playerId: z.string(),
  displayName: personName.optional(),
  birthDate: isoDate.nullish(),
  gender,
  ...ratings,
  utrProfileId: z.string().trim().regex(/^\d{1,12}$/, 'UTR profile id is the number in your UTR profile link').nullish(),
})

export async function updatePlayer(db: Db, actor: Actor, input: z.output<typeof playerUpdateInput>): Promise<Player> {
  const player = await requireManagedPlayer(db, actor, input.playerId)
  if (player.guardianUserId && input.birthDate === null) throw fail.badRequest('Juniors need a birth date.')
  await updateRow(db, 'players', player.id, {
    birth_date: input.birthDate, gender: input.gender, utr_singles: input.utrSingles, utr_doubles: input.utrDoubles,
    ntrp: input.ntrp, wtn: input.wtn, utr_profile_id: input.utrProfileId,
    display_name: player.userId ? undefined : input.displayName, // an adult's name changes on the account too
  })
  if (input.displayName && player.userId) await setDisplayName(db, player.userId, input.displayName)
  return (await getPlayer(db, player.id))!
}
