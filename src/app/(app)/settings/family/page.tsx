import { Section } from '@/components/page'
import { PlayerProfileForm } from '@/components/player-profile-form'
import { requireOnboarded } from '@/server/auth/guards'
import { runAs } from '@/server/commands/run'
import { AddJuniorForm, RemoveJuniorButton } from './family-forms'

export default async function FamilySettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const actor = await requireOnboarded()
  const juniors = (await runAs(actor)('family.list', {})).filter((p) => p.guardianUserId)
  const welcome = (await searchParams).welcome
  return (
    <>
      {welcome && <p className="rounded-xl bg-green-50 p-4 text-sm text-green-900">You’re in. Add your juniors so you can book for them.</p>}
      {juniors.map((junior) => (
        <Section key={junior.id} title={junior.displayName} actions={<RemoveJuniorButton playerId={junior.id} name={junior.displayName} />}>
          <PlayerProfileForm player={junior} showName />
        </Section>
      ))}
      <Section title="Add a junior" description="Juniors don’t get their own login. You book, pay, and receive every message for them.">
        <AddJuniorForm />
      </Section>
    </>
  )
}
