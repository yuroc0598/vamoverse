import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/page'
import { buttonVariants } from '@/components/ui/button'
import { SessionRow, groupByDay } from '@/components/session-row'
import { requireProviderPage } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requireProviderPage()
  const week = Math.max(0, Math.min(8, Number((await searchParams).week) || 0))
  const run = runAs(actor)
  const [sessions, offerings] = await Promise.all([
    run('sessions.list', { days: 14, offsetDays: week * 14 }),
    run('offerings.list', {}),
  ])
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Schedule" description="Your next two weeks of lessons, clinics, and hitting sessions."
        actions={<Link href="/offerings/new" className={buttonVariants({ size: 'sm', className: 'gap-2' })}><Plus className="h-4 w-4" aria-hidden />New</Link>} />
      {sessions.length === 0 ? (
        <EmptyState title={week ? 'Nothing scheduled these two weeks' : 'No sessions yet'}
          description="Create a weekly clinic, open slots for privates, or a one-off session."
          action={{ href: '/offerings/new', label: 'Create your first session' }} />
      ) : (
        <div className="space-y-6">
          {groupByDay(sessions).map(({ day, items }) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{day}</h2>
              <div className="space-y-2">{items.map((s) => <SessionRow key={s.id} session={s} href={`/sessions/${s.id}`} showPrice={false} />)}</div>
            </section>
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-between text-sm">
        {week > 0 ? <Link className="text-court-500 hover:underline" href={`/schedule?week=${week - 1}`}>← Earlier</Link> : <span />}
        <Link className="text-court-500 hover:underline" href={`/schedule?week=${week + 1}`}>Later →</Link>
      </div>
      {offerings.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 font-semibold">Your series</h2>
          <ul className="divide-y rounded-xl border bg-white">
            {offerings.map((o) => (
              <li key={o.id}><Link href={`/offerings/${o.id}`} className="block p-3 text-sm hover:bg-gray-50">{o.title}</Link></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
