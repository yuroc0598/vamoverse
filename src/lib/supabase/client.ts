// Supabase client - with mock fallback for MVP without real Supabase
import { createBrowserClient } from '@supabase/ssr'

let mockSupabase: any = null

// Mock implementation for demo without real Supabase
function createMockClient() {
  if (mockSupabase) return mockSupabase
  
  const mockData = {
    users: [],
    events: [],
    payments: [],
    messages: []
  }

  mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async ({ email, password }: any) => {
        // Mock auth - accepts demo accounts
        const demoUsers: any = {
          'coach@demo.com': { id: 'coach_1', email: 'coach@demo.com', role: 'coach' },
          'maya@demo.com': { id: 'student_1', email: 'maya@demo.com', role: 'student' },
          'sarah@demo.com': { id: 'student_2', email: 'sarah@demo.com', role: 'student' },
          'dave@demo.com': { id: 'parent_1', email: 'dave@demo.com', role: 'parent' },
        }
        const user = demoUsers[email]
        if (user && password === 'demo1234') {
          return { data: { user, session: { user } }, error: null }
        }
        return { data: { user: null, session: null }, error: { message: 'Invalid demo credentials. Use coach@demo.com / demo1234 or maya@demo.com / demo1234' } }
      },
      signUp: async ({ email, password, options }: any) => {
        const newUser = { id: `user_${Date.now()}`, email, role: options?.data?.role || 'student' }
        return { data: { user: newUser, session: { user: newUser } }, error: null }
      },
      signOut: async () => ({ error: null }),
      onAuthStateChange: (cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } })
    },
    from: (table: string) => ({
      select: (cols?: string) => ({
        eq: (col: string, val: any) => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        order: () => ({ data: [], error: null }),
        limit: () => ({ data: [], error: null }),
        data: [],
        error: null
      }),
      insert: (data: any) => ({ select: () => ({ data: [data], error: null }), data: [data], error: null }),
      update: (data: any) => ({ eq: () => ({ data: [data], error: null }) }),
      delete: () => ({ eq: () => ({ data: null, error: null }) })
    }),
    channel: (name: string) => ({
      on: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
      subscribe: (cb?: any) => ({})
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
  
  // If no real Supabase or mock URL, return mock client
  if (!url || !key || url.includes('localhost') || url.includes('mock')) {
    console.log('Using Mock Supabase Client for MVP demo')
    return createMockClient()
  }

  return createBrowserClient(url, key)
}

export function isMockMode() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return !url || url.includes('localhost') || url.includes('mock')
}
