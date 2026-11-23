import { EmptyState, PageHeader, Section } from '@/components/page'
import { ShareButton } from '@/components/share-button'
import { StartThreadButton } from '@/components/start-thread-button'
import { formatMoney } from '@/lib/format'
import { formatDateTime } from '@/lib/time'
import { requireProviderPage } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { appUrl } from '@/server/config'
import { ClientNotes, ImportContacts } from './crew-forms'

export default async function CrewPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireProviderPage()
  const q = (await searchParams).q
  const run = runAs(actor)
  const [clients, settings] = await Promise.all([run('clients.list', { search: q }), run('provider.settings', {})])
  const joinUrl = `${appUrl()}/p/${settings.slug}`
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Crew" description="Everyone you teach, in one place." actions={<ShareButton title={`Book with ${settings.displayName}`} url={joinUrl} />} />
      <form className="flex gap-2" role="search">
        <label htmlFor="crew-search" className="sr-only">Search students</label>
        <input id="crew-search" name="q" defaultValue={q} placeholder="Search by name" className="h-11 flex-1 rounded-xl border px-4 text-sm" />
      </form>
      {clients.length === 0 ? (
        <EmptyState title={q ? 'No matches' : 'Your crew is empty'} description={q ? undefined : 'Paste your students below or share your page link. Anyone who books is added automatically.'} />
      ) : (
        <ul className="divide-y rounded-2xl border bg-white">
          {clients.map((c) => (
            <li key={c.playerId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{c.playerName}{c.junior && <span className="text-sm text-muted-foreground"> · junior · parent {c.contactName}</span>}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.upcoming ? `${c.upcoming} upcoming` : 'Nothing booked'}
                    {c.lastSessionAt && ` · last played ${formatDateTime(c.lastSessionAt, settings.timezone, { hour: undefined, minute: undefined })}`}
                    {c.owedCents > 0 && <span className="text-red-700"> · owes {formatMoney(c.owedCents)}</span>}
                  </div>
                </div>
                <StartThreadButton target={{ playerId: c.playerId }} variant="ghost" />
              </div>
              <ClientNotes playerId={c.playerId} notes={c.notes ?? ''} />
            </li>
          ))}
        </ul>
      )}
      <Section title="Add students" description="Paste from a spreadsheet or your contacts: one person per line with a name and an email or mobile number. They get a link to your page; you can book them right away.">
        <ImportContacts />
      </Section>
    </div>
  )
}
