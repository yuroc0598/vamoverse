import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function generateMockId(prefix = 'mock') {
  // Use crypto.randomUUID if available for better uniqueness, fallback to Math.random
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID().split('-')[0]}_${Date.now()}`
    }
  } catch {}
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`
}
