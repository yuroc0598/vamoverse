import { createBrowserClient } from '@supabase/ssr'
import { logger } from '../logger'

let mockSupabase: any = null

const ALLOWED_ROLES = ['coach', 'student', 'parent'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

function normalizeRole(input: unknown): AllowedRole {
  if (typeof input === 'string' && (ALLOWED_ROLES as readonly string[]).includes(input)) {
    return input as AllowedRole
  }
  return 'student'
}

function createMockClient() {
  if (mockSupabase) return mockSupabase

  mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const demoUsers: Record<string, { id: string; email: string; role: AllowedRole }> = {
          'coach@demo.com': { id: 'coach_1', email: 'coach@demo.com', role: 'coach' },
          'maya@demo.com': { id: 'student_1', email: 'maya@demo.com', role: 'student' },
          'sarah@demo.com': { id: 'student_2', email: 'sarah@demo.com', role: 'student' },
          'dave@demo.com': { id: 'parent_1', email: 'dave@demo.com', role: 'parent' },
        }
        const user = demoUsers[email]
        if (user && password === 'demo1234') {
          return { data: { user, session: { user } }, error: null }
        }
        return { data: { user: null, session: null }, error: { message: 'Invalid credentials' } }
      },
      signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => {
        const rawRole = options?.data?.role
        const safeRole = normalizeRole(rawRole)
        const newUser = {
          id: `user_${Date.now()}`,
          email,
          role: safeRole,
          dob: typeof options?.data?.dob === 'string' ? options?.data?.dob : undefined,
          parent_email: typeof options?.data?.parent_email === 'string' ? options?.data?.parent_email : undefined,
          parent_id: typeof options?.data?.parent_id === 'string' ? options?.data?.parent_id : undefined,
          display_name: typeof options?.data?.display_name === 'string' ? options?.data?.display_name : undefined,
        }
        return { data: { user: newUser, session: { user: newUser } }, error: null }
      },
      signOut: async () => ({ error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => ({ data: { subscription: { unsubscribe: () => {} } } })
    },
    from: (table: string) => ({
      select: (cols?: string) => ({
        eq: (col: string, val: unknown) => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        order: () => ({ data: [], error: null }),
        limit: () => ({ data: [], error: null }),
        data: [],
        error: null
      }),
      insert: (data: unknown) => ({ select: () => ({ data: [data], error: null }), data: [data], error: null }),
      update: (data: unknown) => ({ eq: () => ({ data: [data], error: null }) }),
      delete: () => ({ eq: () => ({ data: null, error: null }) })
    }),
    channel: (name: string) => ({
      on: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
      subscribe: () => ({})
    }),
    removeChannel: () => {},
    storage: {
      from: (bucket: string) => ({
        upload: async () => ({ data: { path: 'mock' }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://mock.storage/${path}` } })
      })
    }
  }

  return mockSupabase
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (isMockMode()) {
    logger.debug('supabase.using_mock_client', { reason: 'no real Supabase URL/key configured', isProd: process.env.NODE_ENV === 'production' })
    return createMockClient()
  }

  return createBrowserClient(url as string, key as string)
}

export function isMockMode() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (process.env.NODE_ENV === 'production' && !url) {
    logger.warn('supabase.prod_missing_url_fail_closed', {})
    return false
  }
  if (!url) return true
  if (url.includes('mock')) return true
  if (process.env.NODE_ENV !== 'production' && url.includes('localhost')) {
    return true
  }
  return false
}

export { ALLOWED_ROLES }
export type { AllowedRole }
