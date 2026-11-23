import { OfferingForm } from '@/components/offering-form'
import { PageHeader, Section } from '@/components/page'
import { SessionRow } from '@/components/session-row'
import { todayIn } from '@/lib/time'
import { orNotFound, requireProviderPage } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { ArchiveOfferingButton } from './archive-button'

export default async function OfferingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireProviderPage()
  const { id } = await params
  const run = runAs(actor)
  const offering = await orNotFound(run('offerings.get', { offeringId: id }))
  const [settings, courts, sessions] = await Promise.all([
    run('provider.settings', {}), run('courts.list', {}),
    run('sessions.list', { days: 60 }),
  ])
  const upcoming = sessions.filter((s) => s.offeringId === offering.id).slice(0, 8)
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={offering.title} description={offering.status === 'archived' ? 'This series is stopped.' : 'Changes apply to future sessions.'}
        actions={offering.status === 'active' ? <ArchiveOfferingButton offeringId={offering.id} /> : undefined} />
      <Section title="Upcoming">
        <div className="space-y-2">
          {upcoming.length ? upcoming.map((s) => <SessionRow key={s.id} session={s} href={`/sessions/${s.id}`} showPrice={false} />)
            : <p className="text-sm text-muted-foreground">No upcoming sessions.</p>}
        </div>
      </Section>
      <Section title="Edit series">
        <OfferingForm settings={settings} courts={courts} offering={offering} today={todayIn(settings.timezone)} />
      </Section>
    </div>
  )
}
