"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isMockMode, ALLOWED_ROLES } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

const ALLOWED_ROLE_SET = new Set<string>(ALLOWED_ROLES)
const VALID_ID_PREFIXES = ['user_', 'coach_', 'student_', 'parent_']

function isValidMockUser(obj: unknown): obj is MockUser {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.email !== 'string' || typeof o.role !== 'string') return false
  if (!ALLOWED_ROLE_SET.has(o.role)) return false
  const idStr = o.id as string
  if (!VALID_ID_PREFIXES.some((p) => idStr.startsWith(p))) return false
  if (!(o.email as string).includes('@')) return false
  return true
}

function setMockSessionCookie(user: MockUser) {
  try {
    const payload = encodeURIComponent(JSON.stringify({ id: user.id, role: user.role, email: user.email }))
    document.cookie = `vamoverse_mock_session=${payload}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
    document.cookie = `vamoverse_mock_user=${payload}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
  } catch {}
}

function clearMockCookies() {
  try {
    document.cookie = 'vamoverse_mock_session=; path=/; max-age=0; SameSite=Lax'
    document.cookie = 'vamoverse_mock_user=; path=/; max-age=0; SameSite=Lax'
  } catch {}
}

export interface MockUser {
  id: string
  email: string
  role: 'coach' | 'student' | 'parent'
  display_name?: string
  displayName?: string
  dob?: string
  parent_email?: string
  parent_id?: string
  gender?: 'M' | 'F' | 'other'
  utr_singles?: number
  utr_doubles?: number
  ntrp?: number
}

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<MockUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      if (isMockMode()) {
        const stored = localStorage.getItem('vamoverse_mock_user')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            if (!isValidMockUser(parsed)) {
              logger.warn('auth.mock_user_invalid_role_or_id', { parsed })
              localStorage.removeItem('vamoverse_mock_user')
              localStorage.removeItem('vamoverse_mock_session')
              clearMockCookies()
            } else {
              setUser(parsed)
              setMockSessionCookie(parsed)
            }
          } catch (e) {
            logger.warn('auth.mock_user_parse_failed', { err: e })
            localStorage.removeItem('vamoverse_mock_user')
            localStorage.removeItem('vamoverse_mock_session')
            clearMockCookies()
          }
        }
        setLoading(false)
        return
      }

      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (data.user) {
          const rawRole = data.user.user_metadata?.role
          const safeRole = typeof rawRole === 'string' && ALLOWED_ROLE_SET.has(rawRole) ? rawRole : 'student'
          if (safeRole !== rawRole) {
            logger.warn('auth.invalid_role_from_metadata', { rawRole })
          }
          setUser({
            id: data.user.id,
            email: data.user.email || '',
            role: safeRole as MockUser['role'],
            display_name: typeof data.user.user_metadata?.display_name === 'string' ? data.user.user_metadata?.display_name : undefined,
          })
        }
      } catch (e) {
        logger.error('auth.get_user_failed', { err: e })
      } finally {
        setLoading(false)
      }
    }
    check()
  }, [])

  const logout = async () => {
    if (isMockMode()) {
      localStorage.removeItem('vamoverse_mock_user')
      localStorage.removeItem('vamoverse_mock_session')
      clearMockCookies()
      setUser(null)
      router.push('/login')
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    clearMockCookies()
    setUser(null)
    router.push('/login')
  }

  return { user, loading, logout, isMock: isMockMode() }
}

export function useRole() {
  const { user } = useAuth()
  return user?.role || null
}

export { setMockSessionCookie, clearMockCookies, isValidMockUser }
