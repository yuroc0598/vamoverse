import Link from 'next/link'
import { CalendarCheck, CloudRain, CreditCard, MessageCircle, Sparkles, Users } from 'lucide-react'
import { Logo } from '@/components/brand'
import { buttonVariants } from '@/components/ui/button'

const FEATURES = [
  { icon: CreditCard, title: 'Get paid without chasing', body: 'Players pay when they book or after the lesson. Packages, late-cancel and no-show fees run themselves.' },
  { icon: CalendarCheck, title: 'Weekly schedule on autopilot', body: 'Recurring clinics and privates, open slots students book themselves, waitlists that fill automatically.' },
  { icon: CloudRain, title: 'Rain-out in one tap', body: 'Cancel a session and everyone is told, refunded, or credited — no group text.' },
  { icon: Users, title: 'Your crew in one place', body: 'Roster, attendance, who has paid, and juniors managed by their parents.' },
  { icon: MessageCircle, title: 'Messages that reach people', body: 'Reminders and updates by text and email. Parents are copied on everything for juniors.' },
  { icon: Sparkles, title: 'Just ask', body: '“Book Maya Thursdays at 3” or “who owes me?” — the assistant does it after you confirm.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Link href="/login" className="text-sm font-medium hover:underline">Sign in</Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-12 text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
          Run your tennis coaching. <span className="text-clay-500">Skip the admin.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Lessons, clinics, and paid hitting sessions with booking, payments, reminders, and rain-outs handled for you.
          Your students book from one link — no app download, no account required.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login?next=/onboarding" className={buttonVariants({ size: 'lg' })}>
            Start free as a coach or hitter
          </Link>
          <Link href="/find" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Find a coach or hitter
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Free plan: no monthly fee, small fee per payment. Pro: flat monthly price, no per-payment fee.</p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 md:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border bg-white p-6">
            <f.icon className="h-6 w-6 text-clay-500" aria-hidden />
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        <div className="space-x-4">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
        </div>
        <p className="mt-2">Not affiliated with UTR Sports, USTA, or ITF. Ratings shown are self-reported.</p>
      </footer>
    </div>
  )
}
