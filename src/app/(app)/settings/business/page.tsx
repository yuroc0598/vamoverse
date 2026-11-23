import Link from 'next/link'
import { Section } from '@/components/page'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { appUrl } from '@/server/config'
import { BusinessForm, CourtsManager, ProviderSetupForm } from './business-forms'
import { SafetyForm } from './safety-form'

export default async function BusinessSettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const actor = await requireOnboarded()
  const welcome = (await searchParams).welcome
  if (!actor.providerId) {
    return (
      <Section title="Coach or hit with Vamoverse" description="Run lessons, clinics, and hitting sessions; get paid automatically.">
        <ProviderSetupForm />
      </Section>
    )
  }
  const run = runAs(actor)
  const [settings, courts] = await Promise.all([run('provider.settings', {}), run('courts.list', {})])
  const publicUrl = `${appUrl()}/p/${settings.slug}`
  return (
    <>
      {welcome && (
        <p className="rounded-xl bg-green-50 p-4 text-sm text-green-900">
          Welcome! Set your rates and cancellation policy once, then <Link className="underline" href="/settings/payouts">connect payouts</Link> to take payments.
        </p>
      )}
      <Section title="Your public page" description="Share this link anywhere: players can book and pay without downloading anything.">
        <a href={publicUrl} className="break-all text-sm font-medium text-court-500 underline">{publicUrl}</a>
      </Section>
      <Section title="Business settings" description="Rates fill in automatically when you create sessions. Policies are shown to players before they book.">
        <BusinessForm settings={settings} />
      </Section>
      <Section title="Your courts" description="Save the courts you use so sessions, reminders, and directions are one tap.">
        <CourtsManager courts={courts} />
      </Section>
      <Section title="Safety check for junior sessions" description="Required before you can offer sessions for players under 18. Parents see a verified badge on your page.">
        <SafetyForm status={settings.safetyStatus} />
      </Section>
    </>
  )
}
