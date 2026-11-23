import { z } from 'zod'
import { command } from '../../commands/define'
import { profileSlug } from '../../schemas'
import { requireProvider } from '../providers/profile'
import { clientUpdateInput, contactRow, importClients, joinCrew, leaveCrew, listClients, listMyCoaches, updateClient } from './clients'

export const clientCommands = {
  'clients.list': command({
    summary: 'Your students: contact, upcoming bookings, last session, and anything owed. Optional name search.',
    access: 'provider',
    mutates: false,
    input: z.object({ search: z.string().max(80).optional(), includeArchived: z.boolean().default(false) }),
    run: ({ actor, db }, input) => listClients(db, actor.providerId, input),
  }),

  'clients.import': command({
    summary: 'Add students by name with an email or phone (one or many). They get a link to your page; you can book them right away.',
    access: 'provider',
    mutates: true,
    input: z.object({ contacts: z.array(contactRow).min(1).max(500) }),
    run: async ({ actor, db }, { contacts }) => {
      const provider = await requireProvider(db, actor.providerId)
      return importClients(db, { id: provider.id, name: provider.displayName, slug: provider.slug }, contacts)
    },
  }),

  'clients.update': command({
    summary: 'Add private notes about a student, or archive/restore them.',
    access: 'provider',
    mutates: true,
    input: clientUpdateInput,
    run: async ({ actor, db }, input) => {
      await updateClient(db, actor.providerId, input)
      return { updated: true }
    },
  }),

  'clients.join': command({
    summary: 'Join a coach’s crew from their link (yourself, or a junior you manage).',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({ slug: profileSlug, playerId: z.string().optional() }),
    run: ({ actor, db }, { slug, playerId }) => joinCrew(db, actor, slug, playerId),
  }),

  'clients.leave': command({
    summary: 'Leave a coach’s crew (stops their messages and invites).',
    access: 'user',
    mutates: true,
    input: z.object({ providerId: z.string() }),
    run: async ({ actor, db }, { providerId }) => {
      await leaveCrew(db, actor, providerId)
      return { left: true }
    },
  }),

  'coaches.mine': command({
    summary: 'The coaches and hitters you (or your juniors) train with.',
    access: 'user',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listMyCoaches(db, actor),
  }),
}
