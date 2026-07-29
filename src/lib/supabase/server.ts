import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { hasSupabaseConfig, isDemoMode } from '@/lib/runtime/config'

function isMock() {
  return isDemoMode()
}

export async function createClient() {
  const cookieStore = cookies() as any
  const maybeAwaited = cookieStore instanceof Promise ? await cookieStore : cookieStore
  const resolvedStore = maybeAwaited as any

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (isMock()) {
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
          data: [],
        }),
        insert: () => ({ data: null, error: null }),
        update: () => ({ eq: () => ({ data: null, error: null }) }),
      }),
    } as any
  }

  if (!hasSupabaseConfig()) throw new Error('Supabase server client is not configured')

  return createServerClient(url!, key!, {
    cookies: {
      getAll() {
        return resolvedStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: any }) =>
            resolvedStore.set(name, value, options as any)
          )
        } catch {}
      },
    },
  })
}
