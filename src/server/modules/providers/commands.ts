import { z } from 'zod'
import { command } from '../../commands/define'
import { profileSlug } from '../../schemas'
import { courtInput, deleteCourt, listCourts, saveCourt } from './courts'
import { listPendingSafety, reviewSafetyCheck, safetySubmission, submitSafetyCheck } from './safety'
import { createProvider, providerSetupInput, requirePublicProvider, providerUpdateInput, requireProvider, updateProvider } from './profile'

export const providerCommands = {
  'provider.setup': command({
    summary: 'Start (or change) offering coaching and/or paid hitting.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: providerSetupInput,
    run: async ({ actor, db }, input) => requireProvider(db, await createProvider(db, actor, input)),
  }),

  'provider.settings': command({
    summary: 'Get your coaching/hitting business settings: rates, policies, payouts, plan.',
    access: 'provider',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => requireProvider(db, actor.providerId),
  }),

  'provider.update': command({
    summary: 'Update your business settings: rates, cancellation window, late-cancel and no-show fees, bio, profile link.',
    access: 'provider',
    mutates: true,
    input: providerUpdateInput,
    run: ({ actor, db }, input) => updateProvider(db, actor.providerId, input),
  }),

  'provider.public': command({
    summary: 'Get a coach or hitter’s public profile by profile link.',
    access: 'public',
    mutates: false,
    input: z.object({ slug: profileSlug }),
    run: ({ db }, { slug }) => requirePublicProvider(db, slug),
  }),

  'courts.list': command({
    summary: 'List your regular courts.',
    access: 'provider',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listCourts(db, actor.providerId),
  }),

  'courts.save': command({
    summary: 'Add or edit one of your courts (name, address, notes, booking link, booking window note).',
    access: 'provider',
    mutates: true,
    input: courtInput,
    run: ({ actor, db }, input) => saveCourt(db, actor.providerId, input),
  }),

  'courts.delete': command({
    summary: 'Remove one of your courts.',
    access: 'provider',
    mutates: true,
    input: z.object({ courtId: z.string() }),
    run: async ({ actor, db }, { courtId }) => {
      await deleteCourt(db, actor.providerId, courtId)
      return { deleted: true }
    },
  }),

  'safety.submit': command({
    summary: 'Submit your USTA Safe Play ID or background-check reference to unlock sessions for juniors.',
    access: 'provider',
    mutates: true,
    assistant: false,
    input: safetySubmission,
    run: async ({ actor, db }, input) => {
      await submitSafetyCheck(db, actor.providerId, input)
      return { status: 'pending' as const }
    },
  }),

  'admin.safetyQueue': command({
    summary: 'Safety checks waiting for review.',
    access: 'admin',
    mutates: false,
    input: z.object({}),
    run: ({ db }) => listPendingSafety(db),
  }),

  'admin.reviewSafety': command({
    summary: 'Approve or reject a provider’s safety check.',
    access: 'admin',
    mutates: true,
    input: z.object({ providerId: z.string(), approve: z.boolean() }),
    run: async ({ actor, db }, { providerId, approve }) => {
      await reviewSafetyCheck(db, actor.userId, providerId, approve)
      return { reviewed: true }
    },
  }),
}
