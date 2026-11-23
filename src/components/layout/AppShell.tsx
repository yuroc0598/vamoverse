"use client"
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Calendar, DollarSign, Home, LogOut, MessageCircle, Search, Settings, Sun, Users } from 'lucide-react'
import { Logo } from '@/components/brand'
import { apiUrl } from '@/lib/client/api'
import { cn } from '@/lib/utils'

export interface ShellUser {
  displayName: string
  isProvider: boolean
  isAdmin: boolean
  unreadNotifications: number
}

const PROVIDER_TABS = [
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/crew', label: 'Crew', icon: Users },
  { href: '/money', label: 'Money', icon: DollarSign },
]

const PLAYER_TABS = [
  { href: '/today', label: 'Home', icon: Home },
  { href: '/find', label: 'Find', icon: Search },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/settings', label: 'Profile', icon: Settings },
]

export function AppShell({ user, assistant, children }: { user: ShellUser; assistant?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const tabs = user.isProvider ? PROVIDER_TABS : PLAYER_TABS
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  async function signOut() {
    await fetch(apiUrl('/api/auth/signout'), { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r bg-white md:flex">
        <div className="border-b p-5"><Logo href="/today" /></div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={isActive(t.href) ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                isActive(t.href) ? 'bg-clay-500 text-white' : 'text-muted-foreground hover:bg-gray-50 hover:text-foreground')}>
              <t.icon className="h-4 w-4" aria-hidden /> {t.label}
            </Link>
          ))}
          {user.isProvider && <SideLink href="/messages" label="Messages" icon={MessageCircle} active={isActive('/messages')} />}
          {user.isProvider && <SideLink href="/find" label="Find" icon={Search} active={isActive('/find')} />}
          <SideLink href="/settings" label="Settings" icon={Settings} active={isActive('/settings')} />
          {user.isAdmin && <SideLink href="/admin" label="Admin" icon={Users} active={isActive('/admin')} />}
        </nav>
        <div className="border-t p-4">
          <div className="mb-3 truncate text-sm font-medium">{user.displayName}</div>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur md:justify-end">
          <div className="md:hidden"><Logo href="/today" /></div>
          <div className="flex items-center gap-1">
            {user.isProvider && (
              <Link href="/messages" className="rounded-lg p-2 hover:bg-gray-100 md:hidden" aria-label="Messages">
                <MessageCircle className="h-5 w-5" aria-hidden />
              </Link>
            )}
            <Link href="/notifications" className="relative rounded-lg p-2 hover:bg-gray-100" aria-label={`Notifications${user.unreadNotifications ? `, ${user.unreadNotifications} unread` : ''}`}>
              <Bell className="h-5 w-5" aria-hidden />
              {user.unreadNotifications > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-clay-500" />}
            </Link>
            {user.isProvider && (
              <Link href="/settings" className="rounded-lg p-2 hover:bg-gray-100 md:hidden" aria-label="Settings">
                <Settings className="h-5 w-5" aria-hidden />
              </Link>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      {assistant}

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Main">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={isActive(t.href) ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-1 py-2 text-[11px]', isActive(t.href) ? 'text-clay-500' : 'text-muted-foreground')}>
            <t.icon className="h-5 w-5" aria-hidden /> {t.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

function SideLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
        active ? 'bg-gray-100 text-foreground' : 'text-muted-foreground hover:bg-gray-50 hover:text-foreground')}>
      <Icon className="h-4 w-4" aria-hidden /> {label}
    </Link>
  )
}
