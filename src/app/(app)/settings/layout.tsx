import { PageHeader } from '@/components/page'
import { requireOnboarded } from '@/server/auth/guards'
import { SettingsNav } from './settings-nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireOnboarded()
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <SettingsNav isProvider={Boolean(actor.providerId)} />
      <div className="space-y-6">{children}</div>
    </div>
  )
}
