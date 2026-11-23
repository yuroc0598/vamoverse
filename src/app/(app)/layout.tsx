import { AssistantPanel } from '@/components/assistant-panel'
import { AppShell } from '@/components/layout/AppShell'
import { aiEnabled } from '@/server/config'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireOnboarded()
  const { unread } = await runAs(actor)('notifications.list', { limit: 1 })
  return (
    <AppShell user={{ displayName: actor.displayName, isProvider: Boolean(actor.providerId), isAdmin: actor.isAdmin, unreadNotifications: unread }}
      assistant={aiEnabled() ? <AssistantPanel isProvider={Boolean(actor.providerId)} /> : undefined}>
      {children}
    </AppShell>
  )
}
