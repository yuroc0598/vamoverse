import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageHeader, Section } from '@/components/page'
import { SessionRow, groupByDay } from '@/components/session-row'
import { BOOKING_STATUS_LABELS, formatMoney } from '@/lib/format'
import { DEFAULT_TIME_ZONE, formatDateTime } from '@/lib/time'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import type { ProviderActor } from '@/server/commands/define'
import type { Actor } from '@/server/modules/users/accounts'
import { bookingPath } from '@/server/modules/bookings/links'

export default async function TodayPage() {
  const actor = await requireOnboarded()
  const first = actor.displayName.split(' ')[0]
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Hi, ${first}`} />
      {actor.providerId && <ProviderToday actor={actor as ProviderActor} />}
      <PlayerToday actor={actor} compact={Boolean(actor.providerId)} />
    </div>
  )
}

async function ProviderToday({ actor }: { actor: ProviderActor }) {
  const run = runAs(actor)
  const [week, money, settings] = await Promise.all([run('sessions.list', { days: 7 }), run('money.summary', {}), run('provider.settings', {})])
  const soon = week.filter((s) => s.status === 'scheduled').slice(0, 30)
  const upcomingTwoDays = soon.filter((s) => new Date(s.startsAt).getTime() < new Date(soon[0]?.startsAt ?? 0).getTime() + 2 * 86_400_000)
  const requests = soon.filter((s) => s.requestedCount > 0)
  const courts = soon.filter((s) => s.courtStatus === 'needs_booking')
  const todos = [
    !settings.chargesEnabled && { href: '/settings/payouts', text: 'Connect payouts to take card payments and packages' },
    ...requests.map((s) => ({ href: `/sessions/${s.id}`, text: `${s.requestedCount} asking to join ${s.title} (${formatDateTime(s.startsAt, s.timezone)})` })),
    ...courts.map((s) => ({ href: `/sessions/${s.id}`, text: `Book a court for ${s.title} (${formatDateTime(s.startsAt, s.timezone)})` })),
    money.owedCents > 0 && { href: '/money', text: `${formatMoney(money.owedCents)} owed to you` },
  ].filter(Boolean) as { href: string; text: string }[]

  return (
    <>
      {todos.length > 0 && (
        <Section title="Needs you">
          <ul className="space-y-2">
            {todos.map((t) => <li key={t.text}><Link href={t.href} className="block rounded-xl bg-amber-50 p-3 text-sm hover:bg-amber-100">{t.text} →</Link></li>)}
          </ul>
        </Section>
      )}
      <Section title="Coming up" actions={<Link href="/offerings/new" className="text-sm font-medium text-court-500 hover:underline">+ New session</Link>}>
        {upcomingTwoDays.length === 0 ? (
          <EmptyState title="Nothing scheduled this week" description="Set up a weekly clinic or open slots and share your page." action={{ href: '/offerings/new', label: 'Create a session' }} />
        ) : (
          <div className="space-y-4">
            {groupByDay(upcomingTwoDays).map(({ day, items }) => (
              <div key={day}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{day}</h3>
                <div className="space-y-2">{items.map((s) => <SessionRow key={s.id} session={s} href={`/sessions/${s.id}`} showPrice={false} />)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}

async function PlayerToday({ actor, compact }: { actor: Actor; compact: boolean }) {
  const run = runAs(actor)
  const [bookings, credits, coaches] = await Promise.all([run('bookings.mine', {}), run('credits.mine', {}), run('coaches.mine', {})])
  const activeCredits = credits.filter((c) => c.status === 'active' && c.creditsUsed < c.creditsTotal)
  if (compact && !bookings.length && !activeCredits.length) return null
  return (
    <>
      <Section title={compact ? 'Your own bookings' : 'Your bookings'}>
        {bookings.length === 0 ? (
          <EmptyState title="Nothing booked yet" description="Find a coach, clinic, or hitting partner." action={{ href: '/find', label: 'Find sessions' }} />
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <SessionRow key={b.id} session={b.session} href={bookingPath(b.id)}
                aside={<Badge variant={b.status === 'confirmed' ? 'success' : 'warning'}>{b.playerName === actor.displayName ? '' : `${b.playerName} · `}{BOOKING_STATUS_LABELS[b.status] ?? b.status}</Badge>} />
            ))}
          </div>
        )}
      </Section>
      {activeCredits.length > 0 && (
        <Section title="Package credits">
          <ul className="space-y-1 text-sm">
            {activeCredits.map((c) => <li key={c.id}>{c.creditsTotal - c.creditsUsed} left · {c.name} with {c.providerName}{c.expiresAt ? ` · until ${formatDateTime(c.expiresAt, DEFAULT_TIME_ZONE, { hour: undefined, minute: undefined })}` : ''}</li>)}
          </ul>
        </Section>
      )}
      {!compact && coaches.length > 0 && (
        <Section title="Your coaches">
          <ul className="space-y-2">
            {coaches.map((c) => <li key={c.providerId}><Link href={`/p/${c.slug}`} className="block rounded-xl border p-3 text-sm hover:border-clay-500"><span className="font-medium">{c.name}</span>{c.headline ? ` · ${c.headline}` : ''}</Link></li>)}
          </ul>
        </Section>
      )}
    </>
  )
}
