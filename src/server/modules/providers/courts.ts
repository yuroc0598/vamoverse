// A provider's regular courts: where sessions happen and how the court is booked.
import { z } from 'zod'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { newId } from '../../ids'
import { optionalText } from '../../schemas'

export interface Court {
  id: string
  name: string
  address: string | null
  notes: string | null
  bookingUrl: string | null
  bookingNote: string | null
}

const COURT_COLUMNS = `id, name, address, notes, booking_url AS "bookingUrl", booking_note AS "bookingNote"`

export const courtInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  address: optionalText(200),
  notes: optionalText(500),
  bookingUrl: z.url({ protocol: /^https$/, error: 'Use an https:// link' }).nullish().transform((v) => v || null),
  bookingNote: optionalText(200),
})

export async function listCourts(db: Db, providerId: string): Promise<Court[]> {
  return db.query<Court>(`SELECT ${COURT_COLUMNS} FROM courts WHERE provider_id = $1 ORDER BY name`, [providerId])
}

export async function getCourt(db: Db, providerId: string, courtId: string): Promise<Court | null> {
  return maybeOne<Court>(db, `SELECT ${COURT_COLUMNS} FROM courts WHERE id = $1 AND provider_id = $2`, [courtId, providerId])
}

export async function saveCourt(db: Db, providerId: string, input: z.output<typeof courtInput>): Promise<Court> {
  const values = [input.name, input.address, input.notes, input.bookingUrl, input.bookingNote]
  if (input.id) {
    const rows = await db.query<Court>(
      `UPDATE courts SET name = $3, address = $4, notes = $5, booking_url = $6, booking_note = $7
       WHERE id = $1 AND provider_id = $2 RETURNING ${COURT_COLUMNS}`, [input.id, providerId, ...values])
    if (!rows[0]) throw fail.notFound('Court')
    return rows[0]
  }
  const rows = await db.query<Court>(
    `INSERT INTO courts (id, provider_id, name, address, notes, booking_url, booking_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COURT_COLUMNS}`, [newId('crt'), providerId, ...values])
  return rows[0]
}

export async function deleteCourt(db: Db, providerId: string, courtId: string): Promise<void> {
  await db.query(`DELETE FROM courts WHERE id = $1 AND provider_id = $2`, [courtId, providerId])
}
