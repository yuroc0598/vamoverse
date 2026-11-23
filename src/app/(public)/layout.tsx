import Link from 'next/link'
import { Logo } from '@/components/brand'
import { currentActor } from '@/server/auth/session'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor()
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <Link href={actor ? '/today' : '/login'} className="text-sm font-medium hover:underline">{actor ? 'My account' : 'Sign in'}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  )
}
