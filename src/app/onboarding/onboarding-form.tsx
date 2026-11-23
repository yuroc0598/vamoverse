"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckboxField, TextField } from '@/components/ui/field'
import { useCommand } from '@/lib/client/api'

export function OnboardingForm({ defaultName, next }: { defaultName: string; next: string }) {
  const router = useRouter()
  const complete = useCommand('onboarding.complete')
  const [name, setName] = useState(defaultName)
  const [adult, setAdult] = useState(false)
  const [coaching, setCoaching] = useState(false)
  const [hitting, setHitting] = useState(false)
  const [parent, setParent] = useState(false)

  return (
    <form className="space-y-5" onSubmit={async (e) => {
      e.preventDefault()
      const actor = await complete.run({ displayName: name, adult: adult as true, offersCoaching: coaching, offersHitting: hitting })
      if (!actor) return
      router.replace(coaching || hitting ? '/settings/business?welcome=1' : parent ? '/settings/family?welcome=1' : next)
      router.refresh()
    }}>
      <TextField label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">What will you use Vamoverse for? (choose any)</legend>
        <p className="text-xs text-muted-foreground">Everyone can book lessons, clinics, and hitting sessions.</p>
        <CheckboxField label="I coach tennis" hint="Run lessons and clinics, get paid, manage your students" checked={coaching} onChange={(e) => setCoaching(e.target.checked)} />
        <CheckboxField label="I’m a paid hitting partner" hint="Offer hitting sessions by the hour" checked={hitting} onChange={(e) => setHitting(e.target.checked)} />
        <CheckboxField label="I book for my kids" hint="Add juniors to your account after this step" checked={parent} onChange={(e) => setParent(e.target.checked)} />
      </fieldset>
      <CheckboxField required label="I’m 18 or older" hint="Players under 18 are added by a parent or guardian." checked={adult} onChange={(e) => setAdult(e.target.checked)} />
      <Button className="w-full" disabled={complete.pending}>{complete.pending ? 'Saving…' : 'Continue'}</Button>
    </form>
  )
}
