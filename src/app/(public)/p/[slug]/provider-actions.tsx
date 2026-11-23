"use client"
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useCommand } from '@/lib/client/api'
import { formatMoney } from '@/lib/format'
import type { Package } from '@/server/modules/packages/packages'

export function JoinCrewButton({ slug, providerId, signedIn, joined, isSelf }: { slug: string; providerId: string; signedIn: boolean; joined: boolean; isSelf: boolean }) {
  const router = useRouter()
  const join = useCommand('clients.join', { success: 'You’re in the crew' })
  const leave = useCommand('clients.leave', { success: 'You left the crew' })
  if (isSelf) return null
  if (joined) {
    return <Button variant="ghost" size="sm" disabled={leave.pending} onClick={async () => {
      if (window.confirm('Leave this crew? You won’t get their messages or invites.') && await leave.run({ providerId })) router.refresh()
    }}>Leave crew</Button>
  }
  return (
    <Button variant="outline" size="sm" disabled={join.pending} onClick={async () => {
      if (!signedIn) return router.push(`/login?next=/p/${slug}`)
      if (await join.run({ slug })) router.refresh()
    }}>Join crew</Button>
  )
}

export function PackageList({ packages, signedIn, slug }: { packages: Package[]; signedIn: boolean; slug: string }) {
  const router = useRouter()
  const buy = useCommand('packages.buy')
  return (
    <ul className="space-y-2">
      {packages.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4">
          <div>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-muted-foreground">{p.credits} credits · {formatMoney(Math.round(p.priceCents / p.credits))} each{p.validDays ? ` · use within ${p.validDays} days` : ''}</div>
          </div>
          <Button size="sm" disabled={buy.pending} onClick={async () => {
            if (!signedIn) return router.push(`/login?next=/p/${slug}`)
            const result = await buy.run({ packageId: p.id })
            if (result) window.location.assign(result.checkoutUrl)
          }}>Buy {formatMoney(p.priceCents)}</Button>
        </li>
      ))}
    </ul>
  )
}
