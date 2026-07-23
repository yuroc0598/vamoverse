import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function isMock() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (process.env.NODE_ENV === 'production' && (!url || !key)) {
    return false
  }
  if (!url || !key) return true
  if (url.includes('mock')) return true
  if (process.env.NODE_ENV !== 'production' && url.includes('localhost')) return true
  return false
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

  const safeUrl = url || 'https://mock.supabase.co'
  const safeKey = key || 'mock-anon-key'

  return createServerClient(safeUrl, safeKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: any }) =>
            cookieStore.set(name, value, options as any)
          )
        } catch {}
      },
    },
  })
}
