// Juniors are created and managed only by a guardian, with a signed consent. Juniors never
// sign in, so no personal information is collected from children themselves; the guardian
// provides it. A guardian's first card payment is recorded as additional verification.
import { z } from 'zod'
import { DEFAULT_TIME_ZONE, todayIn } from '@/lib/time'
import { maybeOne, tx, type Db } from '../../db'
import { fail } from '../../errors'
import { newId } from '../../ids'
import { gender, isoDate, personName } from '../../schemas'
import { OPEN_SQL } from '../bookings/status'
import type { Actor } from './accounts'
import { ageOn, getPlayer, requireManagedPlayer, type Player } from './players'

export const addJuniorInput = z.object({
  displayName: personName,
  birthDate: isoDate,
  gender,
  signatureName: personName,
  consent: z.literal(true, { error: 'Guardian consent is required' }),
})

export interface Consent {
  attestedAt: Date
  verifiedAt: Date | null
}

export async function addJunior(db: Db, actor: Actor, input: z.output<typeof addJuniorInput>, ip: string | null): Promise<Player> {
  if (!actor.adultConfirmed) throw fail.forbidden('Only adults can add juniors.')
  const age = ageOn(input.birthDate, todayIn(DEFAULT_TIME_ZONE))
  if (age < 0) throw fail.badRequest('Birth date is in the future.')
  if (age >= 18) throw fail.badRequest('Players 18 and older should create their own account.')
  const playerId = newId('ply')
  await tx(async (t) => {
    await t.query(
      `INSERT INTO players (id, guardian_user_id, display_name, birth_date, gender) VALUES ($1, $2, $3, $4, $5)`,
      [playerId, actor.userId, input.displayName, input.birthDate, input.gender ?? null])
    await t.query(
      `INSERT INTO guardian_consents (id, player_id, guardian_user_id, signature_name, ip) VALUES ($1, $2, $3, $4, $5)`,
      [newId('csn'), playerId, actor.userId, input.signatureName, ip])
  })
  return (await getPlayer(db, playerId))!
}

/** Deletes a junior and their data. Upcoming bookings must be cancelled first. */
export async function removeJunior(db: Db, actor: Actor, playerId: string): Promise<void> {
  const player = await requireManagedPlayer(db, actor, playerId)
  if (!player.guardianUserId) throw fail.badRequest('You can only remove juniors you manage.')
  const upcoming = await maybeOne(db,
    `SELECT 1 FROM bookings b JOIN sessions s ON s.id = b.session_id
     WHERE b.player_id = $1 AND s.starts_at > now() AND b.status IN ${OPEN_SQL}`,
    [playerId])
  if (upcoming) throw fail.conflict('Cancel this junior’s upcoming bookings first.')
  await db.query(`DELETE FROM players WHERE id = $1`, [playerId])
}

export async function getConsent(db: Db, playerId: string): Promise<Consent | null> {
  return maybeOne<Consent>(db,
    `SELECT attested_at AS "attestedAt", verified_at AS "verifiedAt" FROM guardian_consents
     WHERE player_id = $1 AND revoked_at IS NULL`, [playerId])
}

/** Called when a guardian's card payment succeeds. */
export async function markGuardianVerified(db: Db, guardianUserId: string, paymentId: string): Promise<void> {
  await db.query(
    `UPDATE guardian_consents SET verified_at = now(), verified_payment_id = $2
     WHERE guardian_user_id = $1 AND verified_at IS NULL AND revoked_at IS NULL`, [guardianUserId, paymentId])
}

/** A junior may be booked only while their guardian's consent is active. */
export async function assertJuniorBookable(db: Db, player: Player): Promise<void> {
  if (!player.guardianUserId) return
  if (!(await getConsent(db, player.id))) throw fail.forbidden('Guardian consent is missing for this junior.')
}
