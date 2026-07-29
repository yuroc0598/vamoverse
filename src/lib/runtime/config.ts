export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function isDemoMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return true
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.includes('mock')) return true
  return !hasSupabaseConfig()
}

export function productionConfigErrors(): string[] {
  if (process.env.NODE_ENV !== 'production') return []
  const errors: string[] = []
  if (!hasSupabaseConfig()) errors.push('Supabase URL/anon key')
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL')
  if (!process.env.REDIS_URL) errors.push('REDIS_URL')
  return errors
}

export function requireProductionConfig(): void {
  const missing = productionConfigErrors()
  if (missing.length) {
    throw new Error(`Production runtime is not configured: missing ${missing.join(', ')}`)
  }
}
