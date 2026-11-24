// Player profiles: an adult's own profile and the juniors they manage.
import { z } from 'zod'
import { maybeOne, updateRow, type Db } from '../../db'
import { fail } from '../../errors'
import { gender, isoDate, personName, ratings } from '../../schemas'
import { OPEN_SQL } from '../bookings/status'
import type { Actor } from './accounts'

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
  })
  if (input.displayName) await renamePlayer(db, player.id, input.displayName)
  return (await getPlayer(db, player.id))!
}

/** Renames a player wherever the name shows: profile, account (for adults), and upcoming bookings. */
export async function renamePlayer(db: Db, playerId: string, name: string): Promise<void> {
  const [player] = await db.query<{ userId: string | null }>(
    `UPDATE players SET display_name = $2, updated_at = now() WHERE id = $1 RETURNING user_id AS "userId"`, [playerId, name])
  if (player?.userId) await updateRow(db, 'users', player.userId, { display_name: name })
  await db.query(`UPDATE bookings SET player_name = $2, updated_at = now() WHERE player_id = $1 AND status IN ${OPEN_SQL}`, [playerId, name])
}

/** Removes players' names from booking history (deleted juniors and accounts); attendance and revenue rows stay. */
export async function forgetPlayersInBookings(db: Db, playerIds: string[]): Promise<void> {
  if (playerIds.length) await db.query(`UPDATE bookings SET player_name = 'Removed player', updated_at = now() WHERE player_id = ANY($1)`, [playerIds])
}
