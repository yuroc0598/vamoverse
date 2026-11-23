import Link from 'next/link'

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-bold" aria-label="Vamoverse home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay-500 text-white">V</span>
      <span>Vamoverse</span>
    </Link>
  )
}

/** Centered single-card layout for sign-in, onboarding, and checkout steps. */
export function CenteredPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}
