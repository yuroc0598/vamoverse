// Provider profiles (coaches and paid hitters): setup, business settings, public page.
import { z } from 'zod'
import { maybeOne, updateRow, type Db } from '../../db'
import { fail, isUniqueViolation } from '../../errors'
import { newId } from '../../ids'
import { cents, optionalText, timeZone } from '../../schemas'
import type { Actor } from '../users/accounts'

export interface ProviderSettings {
  id: string
  userId: string
  slug: string
  displayName: string
  offersCoaching: boolean
  offersHitting: boolean
  headline: string | null
  bio: string | null
  homeArea: string | null
  timezone: string
  ratePrivateCents: number | null
  rateSemiPrivateCents: number | null
  rateGroupCents: number | null
  rateHittingCents: number | null
  cancelWindowHours: number
  lateCancelFeePct: number
  noShowFeePct: number
  listed: boolean
  plan: 'free' | 'pro'
  planStatus: 'active' | 'past_due' | 'canceled' | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  stripeAccountId: string | null
  safetyStatus: 'none' | 'pending' | 'verified' | 'rejected'
}

const PROVIDER_COLUMNS = `pr.id, pr.user_id AS "userId", pr.slug, u.display_name AS "displayName",
  pr.offers_coaching AS "offersCoaching", pr.offers_hitting AS "offersHitting", pr.headline, pr.bio,
  pr.home_area AS "homeArea", pr.timezone, pr.rate_private_cents AS "ratePrivateCents",
  pr.rate_semi_private_cents AS "rateSemiPrivateCents", pr.rate_group_cents AS "rateGroupCents",
  pr.rate_hitting_cents AS "rateHittingCents", pr.cancel_window_hours AS "cancelWindowHours",
  pr.late_cancel_fee_pct AS "lateCancelFeePct", pr.no_show_fee_pct AS "noShowFeePct", pr.listed,
  pr.plan, pr.plan_status AS "planStatus", pr.charges_enabled AS "chargesEnabled",
  pr.payouts_enabled AS "payoutsEnabled", pr.stripe_account_id AS "stripeAccountId", pr.safety_status AS "safetyStatus"`

async function getProvider(db: Db, providerId: string): Promise<ProviderSettings | null> {
  return maybeOne<ProviderSettings>(db,
    `SELECT ${PROVIDER_COLUMNS} FROM providers pr JOIN users u ON u.id = pr.user_id WHERE pr.id = $1`, [providerId])
}

export async function requireProvider(db: Db, providerId: string): Promise<ProviderSettings> {
  const provider = await getProvider(db, providerId)
  if (!provider) throw fail.notFound('Coach')
  return provider
}

function slugify(name: string): string {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
  return base.length >= 3 ? base : `pro-${base || 'coach'}`
}

export const providerSetupInput = z.object({
  offersCoaching: z.boolean(),
  offersHitting: z.boolean(),
}).refine((v) => v.offersCoaching || v.offersHitting, 'Choose coaching, hitting, or both')

export async function createProvider(db: Db, actor: Actor, input: z.output<typeof providerSetupInput>): Promise<string> {
  if (actor.providerId) {
    await updateRow(db, 'providers', actor.providerId, { offers_coaching: input.offersCoaching, offers_hitting: input.offersHitting })
    return actor.providerId
  }
  if (!actor.adultConfirmed) throw fail.forbidden('Coaches and hitters must be adults.')
  const base = slugify(actor.displayName)
  // ON CONFLICT DO NOTHING (not catch-and-retry) so this is safe inside a caller's transaction.
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const rows = await db.query<{ id: string }>(
      `INSERT INTO providers (id, user_id, slug, offers_coaching, offers_hitting) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [newId('pro'), actor.userId, slug, input.offersCoaching, input.offersHitting])
    if (rows[0]) return rows[0].id
  }
  throw fail.conflict('Could not create a profile link. Try again.')
}

const pct = z.number().int().min(0).max(100)

export const providerUpdateInput = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,39}$/, 'Use 3–40 letters, numbers, or dashes').optional(),
  offersCoaching: z.boolean().optional(),
  offersHitting: z.boolean().optional(),
  headline: optionalText(120).optional(),
  bio: optionalText(2000).optional(),
  homeArea: optionalText(120).optional(),
  timezone: timeZone.optional(),
  ratePrivateCents: cents.nullish(),
  rateSemiPrivateCents: cents.nullish(),
  rateGroupCents: cents.nullish(),
  rateHittingCents: cents.nullish(),
  cancelWindowHours: z.number().int().min(0).max(168).optional(),
  lateCancelFeePct: pct.optional(),
  noShowFeePct: pct.optional(),
  listed: z.boolean().optional(),
})

export async function updateProvider(db: Db, providerId: string, input: z.output<typeof providerUpdateInput>): Promise<ProviderSettings> {
  const current = await requireProvider(db, providerId)
  const coaching = input.offersCoaching ?? current.offersCoaching
  const hitting = input.offersHitting ?? current.offersHitting
  if (!coaching && !hitting) throw fail.badRequest('Offer coaching, hitting, or both.')
  try {
    await updateRow(db, 'providers', providerId, {
      slug: input.slug, offers_coaching: input.offersCoaching, offers_hitting: input.offersHitting,
      headline: input.headline, bio: input.bio, home_area: input.homeArea, timezone: input.timezone,
      rate_private_cents: input.ratePrivateCents, rate_semi_private_cents: input.rateSemiPrivateCents,
      rate_group_cents: input.rateGroupCents, rate_hitting_cents: input.rateHittingCents,
      cancel_window_hours: input.cancelWindowHours, late_cancel_fee_pct: input.lateCancelFeePct,
      no_show_fee_pct: input.noShowFeePct, listed: input.listed,
    })
  } catch (error) {
    if (isUniqueViolation(error, 'providers_slug_key')) throw fail.conflict('That profile link is taken.')
    throw error
  }
  return requireProvider(db, providerId)
}

export interface PublicProvider {
  id: string
  slug: string
  displayName: string
  avatarUrl: string | null
  offersCoaching: boolean
  offersHitting: boolean
  headline: string | null
  bio: string | null
  homeArea: string | null
  timezone: string
  ratePrivateCents: number | null
  rateHittingCents: number | null
  cancelWindowHours: number
  lateCancelFeePct: number
  noShowFeePct: number
  safetyVerified: boolean
  acceptsPayments: boolean
}

async function getPublicProvider(db: Db, slug: string): Promise<PublicProvider | null> {
  return maybeOne<PublicProvider>(db,
    `SELECT pr.id, pr.slug, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
       pr.offers_coaching AS "offersCoaching", pr.offers_hitting AS "offersHitting", pr.headline, pr.bio,
       pr.home_area AS "homeArea", pr.timezone, pr.rate_private_cents AS "ratePrivateCents",
       pr.rate_hitting_cents AS "rateHittingCents", pr.cancel_window_hours AS "cancelWindowHours",
       pr.late_cancel_fee_pct AS "lateCancelFeePct", pr.no_show_fee_pct AS "noShowFeePct",
       pr.safety_status = 'verified' AS "safetyVerified", pr.charges_enabled AS "acceptsPayments"
     FROM providers pr JOIN users u ON u.id = pr.user_id WHERE pr.slug = $1`, [slug.toLowerCase()])
}

export async function requirePublicProvider(db: Db, slug: string): Promise<PublicProvider> {
  const provider = await getPublicProvider(db, slug)
  if (!provider) throw fail.notFound('Coach')
  return provider
}
