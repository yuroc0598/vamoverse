import { OfferingForm } from '@/components/offering-form'
import { PageHeader } from '@/components/page'
import { todayIn } from '@/lib/time'
import { requireProviderPage } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'

export default async function NewOfferingPage() {
  const actor = await requireProviderPage()
  const run = runAs(actor)
  const [settings, courts] = await Promise.all([run('provider.settings', {}), run('courts.list', {})])
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New session" description="Weekly clinics, open slots for privates, or a one-off." />
      <OfferingForm settings={settings} courts={courts} today={todayIn(settings.timezone)} />
    </div>
  )
}
