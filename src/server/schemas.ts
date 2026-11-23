// Reusable input fragments so every command validates the same things the same way.
import { z } from 'zod'
import { isValidTimeZone } from '@/lib/time'

export const personName = z.string().trim().min(1, 'Required').max(80)
export const isoDate = z.iso.date()
export const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
export const cents = z.number().int().min(0).max(1_000_000)
export const positiveCents = cents.min(100, 'Minimum is $1')
export const timeZone = z.string().refine(isValidTimeZone, 'Unknown time zone')
export const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null)

export const ratings = {
  utrSingles: z.number().min(1).max(16.5).nullish(),
  utrDoubles: z.number().min(1).max(16.5).nullish(),
  ntrp: z.number().min(1).max(7).multipleOf(0.5).nullish(),
  wtn: z.number().min(1).max(40).nullish(),
}

export const gender = z.enum(['male', 'female', 'nonbinary']).nullish()
export const profileSlug = z.string().min(1).max(40)
