"use client"
import { useEffect, useState } from 'react'
import { createClient, isMockMode } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

export interface MockUser {
  id: string
  email: string
  role: 'coach' | 'student' | 'parent'
  display_name?: string
  displayName?: string
  gender?: 'M' | 'F' | 'other'
  utr_singles?: number
  utr_doubles?: number
  ntrp?: number
}

export function useAuth() {
  const [user, setUser] = useState<MockUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      if (isMockMode()) {
        const stored = localStorage.getItem('vamoverse_mock_user')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            setUser(parsed)
          } catch (e) {
            // Corrupt stored user — drop it so we don't loop on bad data, and log why.
            logger.warn('auth.mock_user_parse_failed', { err: e })
            localStorage.removeItem('vamoverse_mock_user')
          }
        }
        setLoading(false)
        return
      }

      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email || '',
            role: (data.user.user_metadata?.role as any) || 'student',
            display_name: data.user.user_metadata?.display_name
          })
        }
      } catch (e) {
        // Don't leave the app stuck in a loading state if auth lookup fails.
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
      setUser(null)
      window.location.href = '/login'
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = '/login'
  }

  return { user, loading, logout, isMock: isMockMode() }
}

export function useRole() {
  const { user } = useAuth()
  return user?.role || null
}
