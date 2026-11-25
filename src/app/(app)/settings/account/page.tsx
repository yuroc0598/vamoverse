import { Section } from '@/components/page'
import { PlayerProfileForm } from '@/components/player-profile-form'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { AccountForm, DeleteAccount } from './account-form'

export default async function AccountSettingsPage() {
  const actor = await requireOnboarded()
  const run = runAs(actor)
  const [family, account] = await Promise.all([run('family.list', {}), run('account.get', {})])
  const me = family.find((p) => p.id === actor.playerId)!
  return (
    <>
      <Section title="Account" description={actor.email ?? actor.phone ?? undefined}>
        <AccountForm displayName={actor.displayName} notifyEmail={account.notifyEmail} notifySms={account.notifySms} notifyPush={account.notifyPush} hasPhone={Boolean(actor.phone)} />
      </Section>
      <Section title="Your player profile" description="Helps coaches place you in the right group. Everything here is optional.">
        <PlayerProfileForm player={me} />
      </Section>
      <Section title="Delete account" description="Cancel upcoming bookings first. Payment records are kept for accounting, without your details.">
        <DeleteAccount />
      </Section>
    </>
  )
}
