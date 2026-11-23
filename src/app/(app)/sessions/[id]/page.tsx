import Link from 'next/link'
import { PageHeader, Section } from '@/components/page'
import { SessionDetails } from '@/components/session-details'
import { ShareButton } from '@/components/share-button'
import { StartThreadButton } from '@/components/start-thread-button'
import { zonedParts } from '@/lib/time'
import { orNotFound, requireProviderPage } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { appUrl } from '@/server/config'
import { AddStudent, CancelSession, EditSession, Roster } from './session-manage'

export default async function ManageSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireProviderPage()
  const { id } = await params
  const run = runAs(actor)
  const session = await orNotFound(run('sessions.get', { sessionId: id }))
  const [roster, clients] = await Promise.all([run('sessions.roster', { sessionId: id }), run('clients.list', {})])
  const local = zonedParts(new Date(session.startsAt), session.timezone)
  const duration = Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000)
  const scheduled = session.status === 'scheduled'
  const bookedIds = new Set(roster.filter((r) => !['cancelled', 'late_cancelled', 'declined'].includes(r.status)).map((r) => r.playerId))
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={session.title}
        description={<Link className="text-court-500 hover:underline" href={`/offerings/${session.offeringId}`}>Edit the whole series</Link>}
        actions={<>
          <StartThreadButton target={{ offeringId: session.offeringId }} label="Message players" />
          <ShareButton title={session.title} url={`${appUrl()}/s/${session.id}`} />
        </>} />
      <Section title="Details"><SessionDetails session={session} /></Section>
      <Section title={`Players (${session.seatsTaken}/${session.capacity})`}
        description={session.waitlistCount || session.requestedCount ? `${session.waitlistCount} waiting · ${session.requestedCount} asking to join` : undefined}>
        <Roster entries={roster} started={session.started} />
        {scheduled && <AddStudent sessionId={session.id} clients={clients.filter((c) => !bookedIds.has(c.playerId)).map((c) => ({ id: c.playerId, name: c.playerName }))} />}
      </Section>
      {scheduled && (
        <>
          <Section title="Change this session" description="Booked players are notified automatically if the time changes.">
            <EditSession sessionId={session.id} date={local.date} time={local.time} duration={duration} capacity={session.capacity}
              note={session.note ?? ''} courtStatus={session.courtStatus} courtConfirmation={session.courtConfirmation ?? ''}
              courtBookingUrl={session.courtBookingUrl} courtBookingNote={session.courtBookingNote} />
          </Section>
          <Section title="Cancel" description="Everyone booked is told right away and refunded in full or gets their credit back.">
            <CancelSession sessionId={session.id} date={local.date} />
          </Section>
        </>
      )}
    </div>
  )
}
