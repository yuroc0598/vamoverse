import type { Metadata } from 'next'
import Link from 'next/link'
import { SessionDetails } from '@/components/session-details'
import { ShareButton } from '@/components/share-button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/time'
import { bookingPath } from '@/server/modules/bookings/links'
import { OPEN_STATUSES, type BookingStatus } from '@/server/modules/bookings/status'
import { orNotFound } from '@/server/auth/guards'
import { currentActor } from '@/server/auth/session'
import { runAs } from '@/server/commands/run'
import { BookPanel } from './book-panel'

async function load(id: string) {
  const actor = await currentActor()
  return { actor, view: await orNotFound(runAs(actor)('sessions.view', { sessionId: id })) }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { view: { session } } = await load((await params).id)
  const title = `${session.title} · ${session.providerName}`
  const description = `${formatDateTime(session.startsAt, session.timezone)}${session.locationName ? ` at ${session.locationName}` : ''}. Book in seconds; no app needed.`
  return { title, description, openGraph: { title, description } }
}

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { id } = await params
  const { actor, view } = await load(id)
  const { session } = view
  const active = view.bookings.find((b) => OPEN_STATUSES.includes(b.status as BookingStatus))
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href={`/p/${session.providerSlug}`} className="text-sm text-court-500 hover:underline">{session.providerName}</Link>
            <h1 className="text-2xl font-bold">{session.title}</h1>
          </div>
          <ShareButton title={session.title} />
        </div>
        {session.status === 'cancelled' && <Badge variant="error" className="mt-2">Cancelled{session.cancelReason ? `: ${session.cancelReason}` : ''}</Badge>}
        <div className="mt-4"><SessionDetails session={session} /></div>
      </section>

      {(await searchParams).cancelled && <p className="rounded-xl bg-amber-50 p-4 text-sm">Payment was cancelled. Your spot is held for a few minutes; book again to finish.</p>}

      {view.isOwner ? (
        <Link href={`/sessions/${session.id}`} className="block rounded-xl border bg-white p-4 text-center font-medium hover:border-clay-500">Manage this session</Link>
      ) : active ? (
        <Link href={bookingPath(active.id)} className="block rounded-xl border bg-white p-4 text-center font-medium hover:border-clay-500">
          You have a booking here ({active.status}). View or change it →
        </Link>
      ) : view.bookable ? (
        <BookPanel sessionId={session.id} signedIn={Boolean(actor)} family={view.family.map((p) => ({ id: p.id, name: p.displayName, junior: Boolean(p.guardianUserId) }))}
          credits={view.credits} full={session.seatsTaken >= session.capacity} paymentRule={session.paymentRule} />
      ) : (
        <p className="text-center text-sm text-muted-foreground">This session is no longer open for booking.</p>
      )}
    </div>
  )
}
