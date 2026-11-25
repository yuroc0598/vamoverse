// Supabase clients (server only). Session cookies are read/refreshed through Next's cookie store.
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { supabaseConfig } from '../config'

export async function supabaseServerClient() {
  const config = supabaseConfig()
  if (!config) throw new Error('Supabase is not configured')
  const store = await cookies()
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        // Server components cannot set cookies; the proxy refreshes them instead.
        try { toSet.forEach(({ name, value, options }) => store.set(name, value, options)) } catch { /* read-only context */ }
      },
    },
  })
}

/** Stateless client for verifying a bearer access token from the native app (`auth.getUser(token)`). */
export function supabaseTokenClient() {
  const config = supabaseConfig()
  if (!config) throw new Error('Supabase is not configured')
  return createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Service-role client for admin operations (creating accounts for guest checkout). */
export function supabaseAdminClient() {
  const config = supabaseConfig()
  if (!config?.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}
