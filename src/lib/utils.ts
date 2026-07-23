import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number, currency = 'USD') {
  if (typeof cents !== 'number' || Number.isNaN(cents) || !Number.isFinite(cents)) {
    return "$0"
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function formatDate(date: Date | string) {
  try {
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return "N/A"
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return "N/A"
  }
}

export function generateMockId(prefix = 'mock') {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID().split('-')[0]}_${Date.now()}`
    }
  } catch {}
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function safeToLocaleString(date: string | Date | undefined, fallback = "N/A"): string {
  if (!date) return fallback
  try {
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return fallback
    return d.toLocaleString()
  } catch {
    return fallback
  }
}
