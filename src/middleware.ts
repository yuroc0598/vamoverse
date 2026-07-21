import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logger } from '@/lib/logger'

// Request logger — every request hitting the dev/prod server is logged.
// Useful for confirming the iPhone (Capacitor livereload) is actually reaching
// this machine and which routes it loads. Attaches a per-request correlation id
// (x-request-id) that downstream handlers can log so a request line can be tied
// to any error it produced.
export function middleware(request: NextRequest) {
  const { method, url } = request
  const ua = request.headers.get('user-agent') ?? ''
  // Capacitor iOS WebView reports a distinctive UA; tag it so phone traffic stands out.
  const client = /iPhone|iPad|CapacitorHttp|Capacitor/i.test(ua) ? 'ios' : 'web'
  // Reuse an inbound id (e.g. from a proxy) or mint one for this request.
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()

  logger.info('http.request', {
    requestId,
    client,
    method,
    path: new URL(url).pathname,
  })

  // Propagate the id to the handler (via request header) and to the client (response header).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  // Log page + API requests; skip Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
