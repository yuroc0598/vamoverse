import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { EmptyState } from '@/components/page'
import { Button } from '@/components/ui/button'
import { SessionRow } from '@/components/session-row'
import { formatMoney } from '@/lib/format'
import { DEFAULT_TIME_ZONE, formatDateTime } from '@/lib/time'
import { runAs } from '@/server/commands/run'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Find a tennis coach or hitting partner · Vamoverse' }

const TYPES = [{ value: 'any', label: 'All' }, { value: 'hitting', label: 'Hitting partners' }, { value: 'coaching', label: 'Coaches' }] as const

export default async function FindPage({ searchParams }: { searchParams: Promise<{ type?: string; area?: string; q?: string }> }) {
  const params = await searchParams
  const type = TYPES.some((t) => t.value === params.type) ? (params.type as 'any' | 'hitting' | 'coaching') : 'any'
  const input = { type, area: params.area, query: params.q }
  const run = runAs(null)
  const [providers, sessions] = await Promise.all([run('find.providers', input), type === 'hitting' ? Promise.resolve([]) : run('find.sessions', input)])
  const href = (t: string) => `/find?${new URLSearchParams({ ...(params.area ? { area: params.area } : {}), ...(params.q ? { q: params.q } : {}), type: t })}`
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Find someone to play with</h1>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" role="search">
        <input type="hidden" name="type" value={type} />
        <label className="sr-only" htmlFor="area">Area</label>
        <input id="area" name="area" defaultValue={params.area} placeholder="City or courts (e.g. Fremont)" className="h-11 rounded-xl border px-4 text-sm" />
        <label className="sr-only" htmlFor="q">Name or keyword</label>
        <input id="q" name="q" defaultValue={params.q} placeholder="Name or keyword" className="h-11 rounded-xl border px-4 text-sm" />
        <Button>Search</Button>
      </form>
      <nav className="flex gap-2" aria-label="Type">
        {TYPES.map((t) => (
          <Link key={t.value} href={href(t.value)} aria-current={type === t.value ? 'page' : undefined}
            className={cn('rounded-full border px-4 py-1.5 text-sm', type === t.value ? 'border-clay-500 bg-clay-500 text-white' : 'bg-white')}>{t.label}</Link>
        ))}
      </nav>

      <section className="space-y-2">
        {providers.length === 0 ? <EmptyState title="No one matches yet" description="Try a nearby city or clear the filters." /> : providers.map((p) => (
          <Link key={p.id} href={`/p/${p.slug}`} className="block rounded-xl border bg-white p-4 hover:border-clay-500">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{p.name} {p.safetyVerified && <ShieldCheck className="inline h-4 w-4 text-green-700" aria-label="Safety check completed" />}</div>
                <div className="text-sm text-muted-foreground">
                  {[p.offersCoaching && 'Coach', p.offersHitting && 'Hitting partner'].filter(Boolean).join(' · ')}
                  {p.homeArea && ` · ${p.homeArea}`}
                  {p.offersHitting && (p.ownUtr || p.ownNtrp) && ` · plays ${p.ownUtr ? `UTR ${p.ownUtr}` : `NTRP ${p.ownNtrp}`}`}
                </div>
                {p.headline && <div className="text-sm">{p.headline}</div>}
              </div>
              <div className="shrink-0 text-right text-sm">
                {(type === 'hitting' ? p.rateHittingCents : p.ratePrivateCents ?? p.rateHittingCents) != null &&
                  <div className="font-medium">{formatMoney((type === 'hitting' ? p.rateHittingCents : p.ratePrivateCents ?? p.rateHittingCents)!)}/hr</div>}
                <div className="text-xs text-muted-foreground">{p.nextOpening ? `Next opening ${formatDateTime(p.nextOpening, DEFAULT_TIME_ZONE)}` : 'No openings soon'}</div>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {sessions.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Open clinics this week and next</h2>
          <div className="space-y-2">{sessions.map((s) => <SessionRow key={s.id} session={s} href={`/s/${s.id}`} />)}</div>
        </section>
      )}
    </div>
  )
}
