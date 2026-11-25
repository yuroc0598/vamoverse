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

/**
 * A self-reported rating, as typed: a number, or text from a form ("3.5", "3,5"; empty clears it).
 * Parsing happens here so the web and the native app get the same message for anything else.
 */
const rating = (name: string, min: number, max: number, step?: number) => z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value
    const text = value.trim().replace(',', '.')
    return text === '' ? null : Number(text)
  },
  (step ? z.number({ error: 'Ratings must be numbers, like 3.5.' }).multipleOf(step, `${name} goes in steps of ${step}.`) : z.number({ error: 'Ratings must be numbers, like 3.5.' }))
    .min(min, `${name} is between ${min} and ${max}.`).max(max, `${name} is between ${min} and ${max}.`).nullish(),
)

export const ratings = {
  utrSingles: rating('UTR', 1, 16.5),
  utrDoubles: rating('UTR', 1, 16.5),
  ntrp: rating('NTRP', 1, 7, 0.5),
  wtn: rating('WTN', 1, 40),
}

export const gender = z.enum(['male', 'female', 'nonbinary']).nullish()
export const profileSlug = z.string().min(1).max(40)
