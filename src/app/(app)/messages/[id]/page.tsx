import Link from 'next/link'
import { orNotFound, requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { Conversation } from './conversation'

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOnboarded()
  const { id } = await params
  const { thread, messages } = await orNotFound(runAs(actor)('messages.read', { threadId: id }))
  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link href="/messages" className="text-sm text-court-500 hover:underline">← Messages</Link>
        <h1 className="truncate text-lg font-semibold">{thread.kind === 'offering' ? `👥 ${thread.title}` : thread.title}</h1>
      </div>
      <Conversation threadId={thread.id} initial={messages.map((m) => ({ ...m, createdAt: new Date(m.createdAt).toISOString() }))} />
    </div>
  )
}
