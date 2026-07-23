// Supabase client - with mock fallback for MVP without real Supabase
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '../logger'

let mockSupabase: any = null

// Built-in demo accounts (always available). Passwords included so login validates
// them the same way it validates self-registered accounts.
const DEMO_ACCOUNTS: Record<string, any> = {
  'coach@demo.com': { id: 'coach_1', email: 'coach@demo.com', role: 'coach', display_name: 'Coach Alex', password: 'demo1234' },
  'maya@demo.com': { id: 'student_1', email: 'maya@demo.com', role: 'student', display_name: 'Maya', password: 'demo1234' },
  'sarah@demo.com': { id: 'student_2', email: 'sarah@demo.com', role: 'student', display_name: 'Sarah', password: 'demo1234' },
  'dave@demo.com': { id: 'parent_1', email: 'dave@demo.com', role: 'parent', display_name: 'Dave', password: 'demo1234' },
}

// Self-registered accounts persist in localStorage so a user can sign up, log out,
// and log back in. Keyed by lowercased email.
const ACCOUNTS_KEY = 'vamoverse_mock_accounts'

function loadAccounts(): Record<string, any> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}')
  } catch (e) {
    logger.warn('auth.mock_accounts_parse_failed', { err: e })
    return {}
  }
}

function saveAccounts(accounts: Record<string, any>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

const publicUser = (record: any) => ({
  id: record.id,
  email: record.email,
  role: record.role,
  display_name: record.display_name,
  user_metadata: { role: record.role, display_name: record.display_name },
})

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
        const key = String(email || '').trim().toLowerCase()
        // Registered accounts override demo accounts if the same email was reused.
        const record = loadAccounts()[key] || DEMO_ACCOUNTS[key]
        if (!record) {
          return { data: { user: null, session: null }, error: { message: 'No account found for this email. Sign up first.' } }
        }
        if (record.password !== password) {
          return { data: { user: null, session: null }, error: { message: 'Incorrect password.' } }
        }
        const user = publicUser(record)
        return { data: { user, session: { user } }, error: null }
      },
      signUp: async ({ email, password, options }: any) => {
        const key = String(email || '').trim().toLowerCase()
        if (!key || !password) {
          return { data: { user: null, session: null }, error: { message: 'Email and password are required.' } }
        }
        const accounts = loadAccounts()
        if (accounts[key] || DEMO_ACCOUNTS[key]) {
          return { data: { user: null, session: null }, error: { message: 'An account with this email already exists. Try logging in.' } }
        }
        const record = {
          id: `user_${Date.now()}`,
          email: key,
          role: options?.data?.role || 'student',
          display_name: options?.data?.display_name,
          password,
        }
        accounts[key] = record
        saveAccounts(accounts)
        const user = publicUser(record)
        return { data: { user, session: { user } }, error: null }
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
    logger.debug('supabase.using_mock_client', { reason: 'no real Supabase URL/key configured' })
    return createMockClient()
  }

  return createBrowserClient(url, key)
}

export function isMockMode() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return !url || url.includes('localhost') || url.includes('mock')
}
