import { z } from 'zod'
import { command } from '../../commands/define'
import { tx, updateRow } from '../../db'
import { fail } from '../../errors'
import { personName } from '../../schemas'
import { createProvider } from '../providers/profile'
import { deleteAccount, getAccount, loadActor, setDisplayName } from './accounts'
import { addJunior, addJuniorInput, removeJunior } from './guardians'
import { listFamily, playerUpdateInput, updatePlayer } from './players'

export const userCommands = {
  'account.me': command({
    summary: 'Get the signed-in account (user, own player profile, provider profile).',
    access: 'public',
    mutates: false,
    input: z.object({}),
    run: async ({ actor }) => actor,
  }),

  'account.get': command({
    summary: 'Get your account details and notification preferences.',
    access: 'user',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => getAccount(db, actor.userId),
  }),

  'account.update': command({
    summary: 'Update your name or notification preferences.',
    access: 'user',
    mutates: true,
    input: z.object({ displayName: personName.optional(), notifyEmail: z.boolean().optional(), notifySms: z.boolean().optional() }),
    run: async ({ actor, db }, input) => {
      await tx(async (t) => {
        await updateRow(t, 'users', actor.userId, { notify_email: input.notifyEmail, notify_sms: input.notifySms })
        if (input.displayName) await setDisplayName(t, actor.userId, input.displayName)
      })
      return loadActor(db, actor.userId)
    },
  }),

  'onboarding.complete': command({
    summary: 'Finish sign-up: confirm you are an adult and say whether you coach or hit.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({
      displayName: personName,
      adult: z.literal(true, { error: 'You must be 18 or older. A parent or guardian can add juniors.' }),
      offersCoaching: z.boolean().default(false),
      offersHitting: z.boolean().default(false),
    }),
    run: async ({ actor, db }, input) => {
      await tx(async (t) => {
        await updateRow(t, 'users', actor.userId, {
          adult_confirmed_at: new Date(), onboarded_at: new Date(),
        })
        await setDisplayName(t, actor.userId, input.displayName)
        if (input.offersCoaching || input.offersHitting) {
          await createProvider(t, { ...actor, displayName: input.displayName, adultConfirmed: true }, input)
        }
      })
      return loadActor(db, actor.userId)
    },
  }),

  'family.list': command({
    summary: 'List your player profile and the juniors you manage.',
    access: 'user',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listFamily(db, actor),
  }),

  'players.update': command({
    summary: 'Update a player profile you manage (name, gender, ratings, UTR profile id).',
    access: 'user',
    mutates: true,
    input: playerUpdateInput,
    run: ({ actor, db }, input) => updatePlayer(db, actor, input),
  }),

  'family.addJunior': command({
    summary: 'Add a junior you are the parent or guardian of, with signed consent.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: addJuniorInput,
    run: ({ actor, db, ip }, input) => addJunior(db, actor, input, ip),
  }),

  'family.removeJunior': command({
    summary: 'Remove a junior you manage and delete their data.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({ playerId: z.string() }),
    run: async ({ actor, db }, { playerId }) => {
      if (playerId === actor.playerId) throw fail.badRequest('You cannot remove your own profile.')
      await removeJunior(db, actor, playerId)
      return { removed: true }
    },
  }),

  'account.delete': command({
    summary: 'Permanently delete your account and your juniors’ data.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({ confirm: z.literal('DELETE', { error: 'Type DELETE to confirm' }) }),
    run: async ({ actor, db }) => {
      await deleteAccount(db, actor)
      return { deleted: true }
    },
  }),
}
