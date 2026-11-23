// Page-level layout pieces shared by every app screen.
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from './ui/button'

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Section({ title, description, actions, children, className }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={cn('rounded-2xl border bg-white p-5 shadow-sm', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && (
        <Link href={action.href} className={buttonVariants({ size: 'sm', className: 'mt-4' })}>
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function SubNav({ items, active }: { items: { href: string; label: string }[]; active: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b" aria-label="Section">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={active === item.href ? 'page' : undefined}
          className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
            active === item.href ? 'border-clay-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
