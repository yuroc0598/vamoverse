import { redirect } from 'next/navigation'
import { CenteredPage } from '@/components/brand'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { safeNext } from '@/lib/navigation'
import { requireSignedIn } from '@/server/auth/guards'
import { OnboardingForm } from './onboarding-form'

export const metadata = { title: 'Welcome · Vamoverse' }

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await requireSignedIn()
  const next = safeNext((await searchParams).next)
  if (actor.onboarded) redirect(next)
  return (
    <CenteredPage>
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Vamoverse</CardTitle>
          <CardDescription>Two quick questions and you’re in.</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm defaultName={actor.displayName} next={next} />
        </CardContent>
      </Card>
    </CenteredPage>
  )
}
