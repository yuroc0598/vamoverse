// Devices that receive push notifications (the native iOS app). A token belongs to whoever
// signed in on that device last; unregistering happens on sign-out, and APNs tells us (410)
// when an app was deleted.
import { z } from 'zod'
import type { Db } from '../../db'
import { newId } from '../../ids'

export const deviceToken = z.string().trim().toLowerCase().regex(/^[0-9a-f]{64,200}$/, 'That isn’t a device token.')

export const registerInput = z.object({
  token: deviceToken,
  /** APNs environment the token is for: sandbox (development builds) or production. */
  environment: z.enum(['sandbox', 'production']),
})

export interface Device { token: string; environment: 'sandbox' | 'production' }

/** Saves the token for this user, moving it from whoever had it before. */
export async function registerDevice(db: Db, userId: string, input: z.output<typeof registerInput>): Promise<void> {
  await db.query(
    `INSERT INTO devices (id, user_id, token, environment) VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, environment = EXCLUDED.environment, last_seen_at = now()`,
    [newId('dev'), userId, input.token, input.environment])
}

/** Removes the token if it belongs to this user. Returns whether it did. */
export async function unregisterDevice(db: Db, userId: string, token: string): Promise<boolean> {
  return (await db.query(`DELETE FROM devices WHERE token = $1 AND user_id = $2 RETURNING id`, [token, userId])).length > 0
}

export async function devicesFor(db: Db, userId: string): Promise<Device[]> {
  return db.query<Device>(`SELECT token, environment FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC`, [userId])
}

/** APNs said the app is gone from that device (410) or the token is invalid. */
export async function forgetDevice(db: Db, token: string): Promise<void> {
  await db.query(`DELETE FROM devices WHERE token = $1`, [token])
}
