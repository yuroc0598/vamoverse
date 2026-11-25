// Universal links for the native iOS app. Served only when APPLE_TEAM_ID is set: without it
// there is no valid app ID, and a 404 is better than a file that names the wrong app.
import { NextResponse } from 'next/server'
import { appleTeamId } from '@/server/config'
import { appSiteAssociation } from '@/server/universal-links'

export function GET() {
  const teamId = appleTeamId()
  if (!teamId) return NextResponse.json({ error: 'Not configured' }, { status: 404 })
  return NextResponse.json(appSiteAssociation(teamId), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
