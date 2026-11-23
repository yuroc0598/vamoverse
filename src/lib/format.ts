// Display formatting shared by server-rendered pages and client components.
export const OFFERING_KINDS = ['private', 'semi_private', 'group', 'hitting'] as const
export type OfferingKind = (typeof OFFERING_KINDS)[number]
export type PaymentRule = 'free' | 'pay_now' | 'pay_after' | 'external'
export type LevelSystem = 'utr' | 'ntrp' | 'wtn'

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
}

export const KIND_LABELS: Record<OfferingKind, string> = {
  private: 'Private lesson', semi_private: 'Semi-private', group: 'Group clinic', hitting: 'Hitting session',
}

export const PAYMENT_RULE_LABELS: Record<PaymentRule, string> = {
  free: 'Free', pay_now: 'Pay when booking', pay_after: 'Card charged after the session', external: 'Pay the coach directly',
}

export function priceLabel(priceCents: number, rule: PaymentRule): string {
  if (rule === 'free') return 'Free'
  const price = formatMoney(priceCents)
  return rule === 'pay_after' ? `${price} · charged after` : rule === 'external' ? `${price} · pay coach directly` : price
}

export function levelLabel(system: LevelSystem | null, min: number | null, max: number | null): string | null {
  if (!system || (min === null && max === null)) return null
  const name = system.toUpperCase()
  if (min !== null && max !== null) return `${name} ${min}–${max}`
  return min !== null ? `${name} ${min}+` : `${name} up to ${max}`
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function seatsLabel(seatsTaken: number, capacity: number, waitlist = 0): string {
  if (capacity === 1) return seatsTaken ? 'Booked' : 'Open'
  const left = Math.max(0, capacity - seatsTaken)
  if (left === 0) return waitlist ? `Full · ${waitlist} waiting` : 'Full · join the waitlist'
  return `${left} of ${capacity} spots left`
}

export function policyLabel(windowHours: number, lateFeePct: number, noShowPct: number): string {
  const free = windowHours === 0 ? 'Free cancellation any time before start' : `Free cancellation up to ${windowHours} hours before`
  const late = lateFeePct ? `${lateFeePct}% fee for later cancellations` : 'no late-cancel fee'
  const noShow = noShowPct ? `${noShowPct}% for no-shows` : 'no no-show fee'
  return `${free}; ${late}; ${noShow}.`
}

export const PAYMENT_PURPOSE_LABELS: Record<string, string> = {
  booking: 'Session', package: 'Package', late_cancel_fee: 'Late-cancel fee', no_show_fee: 'No-show fee',
}
