import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { EmptyState } from '@/components/page'
import { SessionRow, groupByDay } from '@/components/session-row'
import { formatMoney, policyLabel } from '@/lib/format'
import { orNotFound } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { ShareButton } from '@/components/share-button'
import { currentActor } from '@/server/auth/session'
import { StartThreadButton } from '@/components/start-thread-button'
import { JoinCrewButton, PackageList } from './provider-actions'

async function load(slug: string) {
  return orNotFound(runAs(null)('schedule.public', { slug }))
}

async function viewer(providerId: string) {
  const actor = await currentActor()
  if (!actor) return { signedIn: false, joined: false, isSelf: false }
  const coaches = await runAs(actor)('coaches.mine', {})
  const isSelf = actor.providerId === providerId
  return { signedIn: true, joined: isSelf || coaches.some((c) => c.providerId === providerId), isSelf }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { provider } = await load((await params).slug)
  const title = `${provider.displayName} · ${provider.offersCoaching ? 'Tennis coach' : 'Hitting partner'}`
  const description = provider.headline ?? `Book lessons and sessions with ${provider.displayName}${provider.homeArea ? ` in ${provider.homeArea}` : ''}.`
  return { title, description, openGraph: { title, description, type: 'profile' } }
}

export default async function ProviderPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug
  const { provider, sessions } = await load(slug)
  const [me, packages] = await Promise.all([viewer(provider.id), runAs(null)('packages.public', { slug })])
  const roles = [provider.offersCoaching && 'Tennis coach', provider.offersHitting && 'Hitting partner'].filter(Boolean).join(' · ')
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{provider.displayName}</h1>
            <p className="text-sm text-muted-foreground">{roles}{provider.homeArea ? ` · ${provider.homeArea}` : ''}</p>
            {provider.headline && <p className="mt-2">{provider.headline}</p>}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <ShareButton title={provider.displayName} />
            <JoinCrewButton slug={provider.slug} providerId={provider.id} signedIn={me.signedIn} joined={me.joined} isSelf={me.isSelf} />
            {me.joined && !me.isSelf && <StartThreadButton target={{ providerId: provider.id }} />}
          </div>
        </div>
        {provider.safetyVerified && (
          <p className="mt-3 flex items-center gap-1 text-sm text-green-800"><ShieldCheck className="h-4 w-4" aria-hidden />Safety check completed</p>
        )}
        {provider.bio && <p className="mt-4 whitespace-pre-line text-sm">{provider.bio}</p>}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {provider.ratePrivateCents != null && <span className="rounded-lg bg-gray-50 px-3 py-1">Private {formatMoney(provider.ratePrivateCents)}</span>}
          {provider.rateHittingCents != null && <span className="rounded-lg bg-gray-50 px-3 py-1">Hitting {formatMoney(provider.rateHittingCents)}</span>}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{policyLabel(provider.cancelWindowHours, provider.lateCancelFeePct, provider.noShowFeePct)}</p>
      </section>

      {packages.length > 0 && provider.acceptsPayments && (
        <section>
          <h2 className="mb-3 font-semibold">Packages</h2>
          <PackageList packages={packages} signedIn={me.signedIn} slug={provider.slug} />
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Book a session</h2>
        {sessions.length === 0 ? (
          <EmptyState title="No open sessions right now" description="Check back soon, or message the coach after signing in." />
        ) : (
          <div className="space-y-5">
            {groupByDay(sessions).map(({ day, items }) => (
              <div key={day}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{day}</h3>
                <div className="space-y-2">{items.map((s) => <SessionRow key={s.id} session={s} href={`/s/${s.id}`} />)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
