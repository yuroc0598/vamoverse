// Runtime configuration. Read at call time (tests change env per case).
// Development falls back to local implementations (signed dev sessions, simulated
// checkout, logged email/SMS); production refuses to start without real providers.

const env = (name: string) => process.env[name]?.trim() || undefined

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function appUrl(): string {
  return (env('APP_URL') || env('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000').replace(/\/$/, '')
}

export function supabaseConfig() {
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return url && anonKey ? { url, anonKey, serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY') } : null
}

export type AuthMode = 'supabase' | 'dev'
export function authMode(): AuthMode {
  if (supabaseConfig()) return 'supabase'
  if (isProduction()) throw new Error('Supabase auth is not configured')
  return 'dev'
}

export type PaymentsMode = 'stripe' | 'dev'
export function paymentsMode(): PaymentsMode {
  if (env('STRIPE_SECRET_KEY')) return 'stripe'
  if (isProduction()) throw new Error('Stripe is not configured')
  return 'dev'
}

/** The local payment simulator: development only, and only when Stripe isn't configured. Never throws. */
export const devPaymentsEnabled = (): boolean => !isProduction() && !env('STRIPE_SECRET_KEY')

export const emailMode = (): 'resend' | 'log' => (env('RESEND_API_KEY') ? 'resend' : 'log')
export const smsMode = (): 'twilio' | 'log' | 'off' =>
  env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM') ? 'twilio' : isProduction() ? 'off' : 'log'
export const aiEnabled = (): boolean => Boolean(env('ANTHROPIC_API_KEY'))

/** Apple Team ID: APNs provider tokens and the universal-links file (apple-app-site-association). */
export const appleTeamId = (): string | undefined => env('APPLE_TEAM_ID')

/** APNs token auth (.p8 key). APNS_PRIVATE_KEY may use literal "\n" for line breaks (one-line env vars). */
export function apnsConfig() {
  const keyId = env('APNS_KEY_ID')
  const privateKey = env('APNS_PRIVATE_KEY')?.replace(/\\n/g, '\n')
  const teamId = appleTeamId()
  return keyId && privateKey && teamId ? { keyId, privateKey, teamId, topic: env('APNS_TOPIC') || 'com.vamoverse.app' } : null
}

/** Push to the native app: APNs when configured, the log in development, off in production without keys. PUSH_MODE overrides. */
export function pushMode(): 'apns' | 'log' | 'off' {
  const forced = env('PUSH_MODE')
  if (forced === 'apns' || forced === 'log' || forced === 'off') return forced
  return apnsConfig() ? 'apns' : isProduction() ? 'off' : 'log'
}

export function secret(name: 'CRON_SECRET' | 'DEV_SESSION_SECRET' | 'LINK_SECRET'): string {
  const value = env(name)
  if (value) return value
  if (isProduction()) throw new Error(`${name} is required in production`)
  return `development-only-${name.toLowerCase()}`
}

const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL', 'APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRO_PRICE_ID', 'CRON_SECRET', 'LINK_SECRET',
  'RESEND_API_KEY', 'EMAIL_FROM',
]

export function missingProductionConfig(): string[] {
  if (!isProduction()) return []
  return REQUIRED_IN_PRODUCTION.filter((name) => !env(name))
}
