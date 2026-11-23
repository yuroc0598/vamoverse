import { redirect } from 'next/navigation'
import { CenteredPage } from '@/components/brand'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { safeNext } from '@/lib/navigation'
import { currentActor } from '@/server/auth/session'
import { authMode } from '@/server/config'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in · Vamoverse' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams
  const next = safeNext(params.next)
  if (await currentActor()) redirect(next)
  return (
    <CenteredPage>
      <Card>
        <CardHeader>
          <CardTitle>Sign in or create an account</CardTitle>
          <CardDescription>No password needed. New here? We’ll set you up in a minute.</CardDescription>
        </CardHeader>
        <CardContent>
          {params.error && <p role="alert" className="mb-4 text-sm text-red-700">That sign-in link expired. Request a new one.</p>}
          <LoginForm mode={authMode()} next={next} />
        </CardContent>
      </Card>
    </CenteredPage>
  )
}
