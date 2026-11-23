"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ChoiceGroup, TextField } from '@/components/ui/field'
import { apiUrl } from '@/lib/client/api'
import { supabaseBrowserClient } from '@/lib/client/supabase'

type Method = 'email' | 'phone'

export function LoginForm({ mode, next }: { mode: 'supabase' | 'dev'; next: string }) {
  return mode === 'dev' ? <DevLogin next={next} /> : <SupabaseLogin next={next} />
}

function DevLogin({ next }: { next: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      setPending(true)
      const response = await fetch(apiUrl('/api/auth/dev'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      setPending(false)
      if (!response.ok) return toast.error((await response.json()).error?.message ?? 'Sign-in failed')
      router.replace(next)
      router.refresh()
    }}>
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Local development sign-in: no email is sent.</p>
      <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button className="w-full" disabled={pending}>{pending ? 'Signing in…' : 'Continue'}</Button>
    </form>
  )
}

function SupabaseLogin({ next }: { next: string }) {
  const router = useRouter()
  const [method, setMethod] = useState<Method>('email')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  // Computed on click: window is unavailable during server rendering.
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  async function send() {
    setPending(true)
    const supabase = supabaseBrowserClient()
    const { error } = method === 'email'
      ? await supabase.auth.signInWithOtp({ email: contact, options: { emailRedirectTo: redirectTo() } })
      : await supabase.auth.signInWithOtp({ phone: contact })
    setPending(false)
    if (error) return toast.error(error.message)
    setSent(true)
  }

  async function verifyPhone() {
    setPending(true)
    const { error } = await supabaseBrowserClient().auth.verifyOtp({ phone: contact, token: code, type: 'sms' })
    setPending(false)
    if (error) return toast.error(error.message)
    router.replace(next)
    router.refresh()
  }

  async function oauth(provider: 'google' | 'apple') {
    const { error } = await supabaseBrowserClient().auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } })
    if (error) toast.error(error.message)
  }

  if (sent && method === 'email') {
    return <p className="text-sm">Check <strong>{contact}</strong> for a sign-in link. You can close this tab.</p>
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Button variant="outline" onClick={() => oauth('apple')}>Continue with Apple</Button>
        <Button variant="outline" onClick={() => oauth('google')}>Continue with Google</Button>
      </div>
      <div className="text-center text-xs text-muted-foreground">or</div>
      <ChoiceGroup label="Sign in with" value={method} onChange={(m) => { setMethod(m); setSent(false) }}
        options={[{ value: 'email', label: 'Email link' }, { value: 'phone', label: 'Text message code' }]} />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (sent) void verifyPhone(); else void send() }}>
        {method === 'email'
          ? <TextField label="Email" type="email" autoComplete="email" required value={contact} onChange={(e) => setContact(e.target.value)} />
          : <TextField label="Mobile number" type="tel" autoComplete="tel" placeholder="+1 415 555 0100" required value={contact} onChange={(e) => setContact(e.target.value)} disabled={sent} />}
        {sent && method === 'phone' && (
          <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
        )}
        <Button className="w-full" disabled={pending}>
          {pending ? 'Please wait…' : sent ? 'Verify and continue' : method === 'email' ? 'Email me a link' : 'Text me a code'}
        </Button>
      </form>
    </div>
  )
}
