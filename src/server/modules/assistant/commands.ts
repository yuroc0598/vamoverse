import { z } from 'zod'
import { command } from '../../commands/define'
import { aiEnabled } from '../../config'
import { newThread, resolveAction, sendToAssistant, visibleHistory } from './assistant'

export const assistantCommands = {
  'assistant.send': command({
    summary: 'Ask the assistant to look something up or make changes (changes need confirmation).',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({ text: z.string().trim().min(1).max(2000) }),
    run: ({ actor, db, ip }, { text }) => sendToAssistant(db, actor, text, ip),
  }),

  'assistant.resolve': command({
    summary: 'Confirm or cancel the changes the assistant proposed.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({ actionId: z.string(), decision: z.enum(['confirm', 'cancel']) }),
    run: async ({ actor, db, ip }, { actionId, decision }) => ({ outcomes: await resolveAction(db, actor, actionId, decision, ip) }),
  }),

  'assistant.history': command({
    summary: 'The current assistant conversation.',
    access: 'user',
    mutates: false,
    assistant: false,
    input: z.object({}),
    run: async ({ actor, db }) => ({ enabled: aiEnabled(), ...(await visibleHistory(db, actor)) }),
  }),

  'assistant.reset': command({
    summary: 'Start a new assistant conversation.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({}),
    run: async ({ actor, db }) => {
      await newThread(db, actor)
      return { ok: true }
    },
  }),
}
