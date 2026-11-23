import { z } from 'zod'
import { command } from '../../commands/define'
import { fail } from '../../errors'
import { listThreads, offeringThread, readThread, sendMessage, startWithClient, startWithProvider } from './messages'

export const messagingCommands = {
  'messages.threads': command({
    summary: 'Your conversations with unread counts.',
    access: 'user',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listThreads(db, actor),
  }),

  'messages.read': command({
    summary: 'Messages in one conversation (marks it read).',
    access: 'user',
    mutates: false,
    input: z.object({ threadId: z.string() }),
    run: ({ actor, db }, { threadId }) => readThread(db, actor, threadId),
  }),

  'messages.send': command({
    summary: 'Send a message in a conversation.',
    access: 'user',
    mutates: true,
    input: z.object({ threadId: z.string(), body: z.string().trim().min(1).max(4000) }),
    run: ({ actor, db }, { threadId, body }) => sendMessage(db, actor, threadId, body),
  }),

  'messages.start': command({
    summary: 'Open a conversation: a coach with a student (playerId), a coach with everyone in a series (offeringId), or a player with a coach (providerId).',
    access: 'user',
    mutates: true,
    input: z.object({ playerId: z.string().optional(), offeringId: z.string().optional(), providerId: z.string().optional() })
      .refine((v) => [v.playerId, v.offeringId, v.providerId].filter(Boolean).length === 1, 'Choose who to message'),
    run: async ({ actor, db }, input) => {
      if (input.providerId) return { threadId: await startWithProvider(db, actor, input.providerId) }
      if (!actor.providerId) throw fail.forbidden()
      const provider = { ...actor, providerId: actor.providerId }
      return { threadId: input.playerId ? await startWithClient(db, provider, input.playerId) : await offeringThread(db, actor.providerId, input.offeringId!) }
    },
  }),
}
