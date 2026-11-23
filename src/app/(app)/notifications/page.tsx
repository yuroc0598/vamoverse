import Link from 'next/link'
import { EmptyState, PageHeader } from '@/components/page'
import { DEFAULT_TIME_ZONE, formatDateTime } from '@/lib/time'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { MarkReadOnView } from './mark-read'

export default async function NotificationsPage() {
  const actor = await requireOnboarded()
  const { items, unread } = await runAs(actor)('notifications.list', { limit: 50 })
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" description="We also send these by email, and by text for anything time-sensitive." />
      {unread > 0 && <MarkReadOnView />}
      {items.length === 0 ? <EmptyState title="All caught up" /> : (
        <ul className="divide-y rounded-2xl border bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? '/today'} className={`block p-4 hover:bg-gray-50 ${n.readAt ? '' : 'bg-clay-50/50'}`}>
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(n.createdAt, DEFAULT_TIME_ZONE)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{n.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
