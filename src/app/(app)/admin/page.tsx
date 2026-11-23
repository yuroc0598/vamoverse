import { notFound } from 'next/navigation'
import { EmptyState, PageHeader } from '@/components/page'
import { DEFAULT_TIME_ZONE, formatDateTime } from '@/lib/time'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { ReviewButtons } from './review-buttons'

export default async function AdminPage() {
  const actor = await requireOnboarded()
  if (!actor.isAdmin) notFound()
  const queue = await runAs(actor)('admin.safetyQueue', {})
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Safety reviews" description="Verify each submission with USTA Safe Play or the screening provider before approving." />
      {queue.length === 0 ? <EmptyState title="Nothing to review" /> : (
        <ul className="divide-y rounded-2xl border bg-white">
          {queue.map((item) => (
            <li key={item.providerId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">{item.name} <span className="text-sm text-muted-foreground">{item.email}</span></div>
                <div className="text-sm">{item.evidence}</div>
                <div className="text-xs text-muted-foreground">Submitted {formatDateTime(item.submittedAt, DEFAULT_TIME_ZONE)}</div>
              </div>
              <ReviewButtons providerId={item.providerId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
