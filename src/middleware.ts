import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { logger } from '@/lib/logger'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/coach',
  '/student',
  '/parent',
  '/events',
  '/payments',
  '/schedule',
  '/play',
  '/vamos',
  '/messages',
  '/community',
]

const PROTECTED_API_PREFIXES = [
  '/api/vamos',
]

// Endpoints that authenticate themselves (server-to-server secrets / signatures)
// and must not be gated by the cookie/session check in this middleware.
const EXEMPT_API_PREFIXES = [
  '/api/payments/webhook', // verified via Stripe signature (STRIPE_WEBHOOK_SECRET)
  '/api/cron',             // verified via Bearer CRON_SECRET in the route itself
]

function isMockModeFromEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (process.env.NODE_ENV === 'production' && !url) {
    logger.warn('middleware.prod_missing_supabase_url_fail_closed', {})
    return false
  }
  if (!url) return true
  if (url.includes('mock')) return true
  if (process.env.NODE_ENV !== 'production' && url.includes('localhost')) return true
  return false
}

function hasMockSessionCookie(request: NextRequest): boolean {
  if (request.cookies.has('vamoverse_mock_session')) return true
  if (request.cookies.has('vamoverse_mock_user')) return true
  const all = request.cookies.getAll()
  for (const c of all) {
    if (c.name.startsWith('sb-')) return true
  }
  return false
}

function isProtectedPath(pathname: string): boolean {
  if (EXEMPT_API_PREFIXES.some((p) => pathname.startsWith(p))) return false
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))) return true
  if (PROTECTED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { method, url } = request
  const ua = request.headers.get('user-agent') ?? ''
  const client = /iPhone|iPad|CapacitorHttp|Capacitor/i.test(ua) ? 'ios' : 'web'
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  const pathname = new URL(url).pathname

  logger.info('http.request', {
    requestId,
    client,
    method,
    path: pathname,
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  const isMock = isMockModeFromEnv()
  let user: any = null

  if (!isMock) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const responsePlaceholder = NextResponse.next({
          request: { headers: requestHeaders },
        })
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll()
            },
            setAll(cookiesToSet: any) {
              cookiesToSet.forEach((item: any) => {
                responsePlaceholder.cookies.set(item.name, item.value, item.options)
              })
            },
          },
        })
        const { data, error } = await supabase.auth.getUser()
        if (error) {
          logger.debug('middleware.getUser_error', { requestId, path: pathname, err: error.message })
        }
        if (data?.user) user = data.user
      } catch (e: any) {
        logger.warn('middleware.supabase_client_failed', { requestId, path: pathname, err: e?.message })
      }
    }
  } else {
    if (hasMockSessionCookie(request)) {
      user = { id: 'mock_session_present' }
    }
  }

  if (!user && isProtectedPath(pathname)) {
    const isApi = pathname.startsWith('/api/')
    if (isApi) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      res.headers.set('x-request-id', requestId)
      return res
    } else {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      const res = NextResponse.redirect(loginUrl, 307)
      res.headers.set('x-request-id', requestId)
      return res
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|_next).*)'],
}
