// Runs before every request: tags it with a request id and keeps the Supabase
// session cookie fresh. Access control lives in the server layouts and commands.
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  const headers = new Headers(request.headers)
  headers.set('x-request-id', requestId)
  headers.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search)
  let response = NextResponse.next({ request: { headers } })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers } })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })
    await supabase.auth.getUser()
  }

  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
}
