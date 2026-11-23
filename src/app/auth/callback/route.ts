// Supabase redirects here after a magic link or Google/Apple sign-in.
import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/lib/navigation'
import { supabaseServerClient } from '@/server/auth/supabase'
import { appUrl } from '@/server/config'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = safeNext(req.nextUrl.searchParams.get('next'))
  if (code) {
    const { error } = await (await supabaseServerClient()).auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${appUrl()}${next}`)
  }
  return NextResponse.redirect(`${appUrl()}/login?error=link&next=${encodeURIComponent(next)}`)
}
