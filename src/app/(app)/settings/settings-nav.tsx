"use client"
import { usePathname } from 'next/navigation'
import { SubNav } from '@/components/page'

const ITEMS = [
  { href: '/settings/account', label: 'Profile' },
  { href: '/settings/family', label: 'Family' },
  { href: '/settings/business', label: 'Coaching & hitting' },
  { href: '/settings/payouts', label: 'Payouts & plan' },
  { href: '/settings/payments', label: 'Payments' },
]

export function SettingsNav({ isProvider }: { isProvider: boolean }) {
  const pathname = usePathname()
  const items = isProvider ? ITEMS : ITEMS.filter((i) => i.href !== '/settings/payouts')
  return <SubNav items={items} active={pathname} />
}
