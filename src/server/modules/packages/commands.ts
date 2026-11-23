import { z } from 'zod'
import { command } from '../../commands/define'
import { profileSlug } from '../../schemas'
import { tx } from '../../db'
import { fail } from '../../errors'
import { createCheckoutPayment, openCheckout } from '../payments/core'
import { appUrl } from '../../config'
import { requirePublicProvider } from '../providers/profile'
import { createPurchase, getPackage, listPackages, listPurchases, packageInput, savePackage } from './packages'

export const packageCommands = {
  'packages.list': command({
    summary: 'List your packages (prepaid credit bundles).',
    access: 'provider',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listPackages(db, actor.providerId),
  }),

  'packages.save': command({
    summary: 'Create or edit a package, e.g. “10 privates for $800, valid 6 months”.',
    access: 'provider',
    mutates: true,
    input: packageInput,
    run: ({ actor, db }, input) => savePackage(db, actor.providerId, input),
  }),

  'packages.public': command({
    summary: 'Packages a coach offers, by profile link.',
    access: 'public',
    mutates: false,
    input: z.object({ slug: profileSlug }),
    run: async ({ db }, { slug }) => listPackages(db, (await requirePublicProvider(db, slug)).id, { activeOnly: true }),
  }),

  'packages.buy': command({
    summary: 'Get the checkout link to buy a package.',
    access: 'user',
    mutates: true,
    assistant: false,
    input: z.object({ packageId: z.string() }),
    run: async ({ actor, db }, { packageId }) => {
      const pkg = await getPackage(db, packageId)
      if (!pkg || !pkg.active) throw fail.notFound('Package')
      const paymentId = await tx(async (t) => {
        const purchaseId = await createPurchase(t, pkg, actor.userId)
        return createCheckoutPayment(t, { providerId: pkg.providerId, payerUserId: actor.userId, purpose: 'package', amountCents: pkg.priceCents, packagePurchaseId: purchaseId })
      })
      const url = await openCheckout(db, paymentId, {
        description: `${pkg.name} (${pkg.credits} credits)`, successUrl: `${appUrl()}/today?package=1`, cancelUrl: `${appUrl()}/today`,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      })
      return { checkoutUrl: url }
    },
  }),

  'credits.mine': command({
    summary: 'Your package credits with each coach.',
    access: 'user',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listPurchases(db, { ownerUserId: actor.userId }),
  }),

  'credits.sold': command({
    summary: 'Packages your students bought and credits remaining.',
    access: 'provider',
    mutates: false,
    input: z.object({}),
    run: ({ actor, db }) => listPurchases(db, { providerId: actor.providerId }),
  }),
}
