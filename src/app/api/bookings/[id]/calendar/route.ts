// "Add to calendar" for one booking (signed-in owner, provider, or signed link).
import { NextResponse, type NextRequest } from 'next/server'
import { currentActor } from '@/server/auth/session'
import { runAs } from '@/server/commands/run'
import { errorResponse, requestMeta } from '@/server/http'
import { bookingUrl } from '@/server/modules/bookings/links'
import { sessionInvite } from '@/server/modules/notifications/ics'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const meta = requestMeta(req)
  try {
    const { id } = await params
    const detail = await runAs(await currentActor())('bookings.get', { bookingId: id, token: req.nextUrl.searchParams.get('t') })
    const ics = sessionInvite(detail.session, {
      uid: detail.booking.id, url: bookingUrl(detail.booking.id),
      cancelled: ['cancelled', 'late_cancelled', 'declined', 'expired'].includes(detail.booking.status),
    })
    return new NextResponse(ics, {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="vamoverse-${id.slice(-8)}.ics"` },
    })
  } catch (error) {
    return errorResponse(error, meta.requestId, 'bookings.calendar_failed')
  }
}
