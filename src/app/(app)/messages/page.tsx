import Link from 'next/link'
import { EmptyState, PageHeader, Section } from '@/components/page'
import { StartThreadButton } from '@/components/start-thread-button'
import { DEFAULT_TIME_ZONE, formatDateTime } from '@/lib/time'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'

export default async function MessagesPage() {
  const actor = await requireOnboarded()
  const run = runAs(actor)
  const [threads, coaches, offerings] = await Promise.all([
    run('messages.threads', {}), run('coaches.mine', {}), actor.providerId ? run('offerings.list', {}) : Promise.resolve([]),
  ])
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Messages" description={actor.providerId ? 'Message a student from Crew, or everyone in a series below.' : 'Talk to your coaches. Parents receive every message about their juniors.'} />
      {threads.length === 0 ? <EmptyState title="No conversations yet" /> : (
        <ul className="divide-y rounded-2xl border bg-white">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/messages/${t.id}`} className="flex items-start justify-between gap-3 p-4 hover:bg-gray-50">
                <div className="min-w-0">
                  <div className={`truncate ${t.unread ? 'font-bold' : 'font-medium'}`}>{t.kind === 'offering' ? `👥 ${t.title}` : t.title}</div>
                  <div className="truncate text-sm text-muted-foreground">{t.lastMessage ?? 'No messages yet'}</div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  {t.lastMessageAt && formatDateTime(t.lastMessageAt, DEFAULT_TIME_ZONE)}
                  {t.unread > 0 && <span className="ml-2 rounded-full bg-clay-500 px-2 py-0.5 text-white">{t.unread}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {offerings.length > 0 && (
        <Section title="Message a whole series">
          <div className="flex flex-wrap gap-2">{offerings.map((o) => <StartThreadButton key={o.id} target={{ offeringId: o.id }} label={o.title} />)}</div>
        </Section>
      )}
      {coaches.length > 0 && (
        <Section title="Message a coach">
          <div className="flex flex-wrap gap-2">{coaches.map((c) => <StartThreadButton key={c.providerId} target={{ providerId: c.providerId }} label={c.name} />)}</div>
        </Section>
      )}
    </div>
  )
}
