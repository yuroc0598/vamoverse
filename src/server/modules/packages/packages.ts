// Prepaid packages ("10-lesson pack"): providers define them, players buy them, bookings spend credits.
import { z } from 'zod'
import { OFFERING_KINDS, type OfferingKind } from '@/lib/format'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { newId } from '../../ids'
import { positiveCents } from '../../schemas'

export interface Package {
  id: string
  providerId: string
  name: string
  credits: number
  priceCents: number
  validDays: number | null
  kinds: OfferingKind[]
  active: boolean
}

export interface PackagePurchase {
  id: string
  packageId: string
  providerId: string
  providerName: string
  ownerUserId: string
  name: string
  kinds: OfferingKind[]
  creditsTotal: number
  creditsUsed: number
  status: 'pending' | 'active' | 'refunded' | 'canceled'
  expiresAt: Date | null
}

const PACKAGE_COLUMNS = `k.id, k.provider_id AS "providerId", k.name, k.credits, k.price_cents AS "priceCents",
  k.valid_days AS "validDays", k.kinds, k.active`

const PURCHASE_SELECT = `SELECT pp.id, pp.package_id AS "packageId", pp.provider_id AS "providerId", u.display_name AS "providerName",
  pp.owner_user_id AS "ownerUserId", k.name, pp.kinds, pp.credits_total AS "creditsTotal", pp.credits_used AS "creditsUsed",
  pp.status, pp.expires_at AS "expiresAt"
  FROM package_purchases pp JOIN packages k ON k.id = pp.package_id
  JOIN providers pr ON pr.id = pp.provider_id JOIN users u ON u.id = pr.user_id`

export const packageInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  credits: z.number().int().min(1).max(100),
  priceCents: positiveCents,
  validDays: z.number().int().min(7).max(730).nullish().transform((v) => v ?? null),
  kinds: z.array(z.enum(OFFERING_KINDS)).min(1),
  active: z.boolean().default(true),
})

export async function listPackages(db: Db, providerId: string, opts: { activeOnly?: boolean } = {}): Promise<Package[]> {
  return db.query<Package>(
    `SELECT ${PACKAGE_COLUMNS} FROM packages k WHERE k.provider_id = $1 ${opts.activeOnly ? 'AND k.active' : ''} ORDER BY k.price_cents`, [providerId])
}

export async function getPackage(db: Db, packageId: string): Promise<Package | null> {
  return maybeOne<Package>(db, `SELECT ${PACKAGE_COLUMNS} FROM packages k WHERE k.id = $1`, [packageId])
}

export async function savePackage(db: Db, providerId: string, input: z.output<typeof packageInput>): Promise<Package> {
  const values = [input.name, input.credits, input.priceCents, input.validDays, input.kinds, input.active]
  const rows = input.id
    ? await db.query<Package>(
      `UPDATE packages k SET name = $3, credits = $4, price_cents = $5, valid_days = $6, kinds = $7, active = $8
       WHERE k.id = $1 AND k.provider_id = $2 RETURNING ${PACKAGE_COLUMNS}`, [input.id, providerId, ...values])
    : await db.query<Package>(
      `INSERT INTO packages AS k (id, provider_id, name, credits, price_cents, valid_days, kinds, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${PACKAGE_COLUMNS}`, [newId('pkg'), providerId, ...values])
  if (!rows[0]) throw fail.notFound('Package')
  return rows[0]
}

/** Creates a pending purchase (activated when its payment succeeds). */
export async function createPurchase(db: Db, pkg: Package, ownerUserId: string): Promise<string> {
  if (!pkg.active) throw fail.conflict('This package is no longer offered.')
  const id = newId('pkp')
  await db.query(
    `INSERT INTO package_purchases (id, package_id, provider_id, owner_user_id, kinds, credits_total) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, pkg.id, pkg.providerId, ownerUserId, pkg.kinds, pkg.credits])
  return id
}

export async function activatePurchase(db: Db, purchaseId: string): Promise<void> {
  await db.query(
    `UPDATE package_purchases pp SET status = 'active',
       expires_at = CASE WHEN k.valid_days IS NULL THEN NULL ELSE now() + make_interval(days => k.valid_days) END
     FROM packages k WHERE pp.id = $1 AND k.id = pp.package_id AND pp.status = 'pending'`, [purchaseId])
}

/** Locks and returns the credit that expires soonest for this provider and kind. */
export async function lockUsableCredit(db: Db, ownerUserId: string, providerId: string, kind: OfferingKind): Promise<string | null> {
  const row = await maybeOne<{ id: string }>(db,
    `SELECT id FROM package_purchases
     WHERE owner_user_id = $1 AND provider_id = $2 AND status = 'active' AND credits_used < credits_total
       AND $3 = ANY(kinds) AND (expires_at IS NULL OR expires_at > now())
     ORDER BY expires_at NULLS LAST, created_at LIMIT 1 FOR UPDATE`, [ownerUserId, providerId, kind])
  return row?.id ?? null
}

export async function spendCredit(db: Db, purchaseId: string): Promise<void> {
  await db.query(`UPDATE package_purchases SET credits_used = credits_used + 1 WHERE id = $1`, [purchaseId])
}

export async function returnCredit(db: Db, purchaseId: string): Promise<void> {
  await db.query(`UPDATE package_purchases SET credits_used = GREATEST(0, credits_used - 1) WHERE id = $1`, [purchaseId])
}

export async function creditBalance(db: Db, ownerUserId: string, providerId: string, kind: OfferingKind): Promise<number> {
  const row = await maybeOne<{ left: number }>(db,
    `SELECT COALESCE(sum(credits_total - credits_used), 0)::int AS left FROM package_purchases
     WHERE owner_user_id = $1 AND provider_id = $2 AND status = 'active' AND $3 = ANY(kinds) AND (expires_at IS NULL OR expires_at > now())`,
    [ownerUserId, providerId, kind])
  return row?.left ?? 0
}

export async function listPurchases(db: Db, where: { ownerUserId?: string; providerId?: string }): Promise<PackagePurchase[]> {
  return db.query<PackagePurchase>(
    `${PURCHASE_SELECT} WHERE pp.status IN ('active','refunded') AND ($1::text IS NULL OR pp.owner_user_id = $1) AND ($2::text IS NULL OR pp.provider_id = $2)
     ORDER BY pp.created_at DESC LIMIT 200`, [where.ownerUserId ?? null, where.providerId ?? null])
}
