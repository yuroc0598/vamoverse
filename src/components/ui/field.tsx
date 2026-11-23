"use client"
// Labeled form controls. Every control gets an id-linked <label> and optional hint.
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from './input'

const controlClass = 'flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 disabled:opacity-50'

interface FieldProps {
  label: string
  hint?: string
  className?: string
  children: (id: string, describedBy?: string) => React.ReactNode
}

function Field({ label, hint, className, children }: FieldProps) {
  const id = React.useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id, hintId)}
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; hint?: string }

export function TextField({ label, hint, className, ...props }: InputProps) {
  return <Field label={label} hint={hint} className={className}>{(id, d) => <Input id={id} aria-describedby={d} {...props} />}</Field>
}

export function TextAreaField({ label, hint, className, ...props }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, d) => <textarea id={id} aria-describedby={d} className={cn(controlClass, 'min-h-24')} {...props} />}
    </Field>
  )
}

export function SelectField({ label, hint, className, options, ...props }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string; hint?: string; options: { value: string; label: string }[]
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, d) => (
        <select id={id} aria-describedby={d} className={cn(controlClass, 'h-11')} {...props}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  )
}

/** Dollar input bound to an integer cents value (null when empty). */
export function MoneyField({ label, hint, className, cents, onCents, ...props }: Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  cents: number | null; onCents: (cents: number | null) => void
}) {
  const [text, setText] = React.useState(cents == null ? '' : (cents / 100).toString())
  React.useEffect(() => {
    setText((current) => (current !== '' && Math.round(Number(current) * 100) === cents ? current : cents == null ? '' : (cents / 100).toString()))
  }, [cents])
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, d) => (
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input id={id} aria-describedby={d} inputMode="decimal" className="pl-8" value={text} {...props}
            onChange={(e) => {
              const value = e.target.value.replace(/[^\d.]/g, '')
              setText(value)
              const n = Number(value)
              onCents(value === '' || !Number.isFinite(n) ? null : Math.round(n * 100))
            }} />
        </div>
      )}
    </Field>
  )
}

export function CheckboxField({ label, hint, className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & { label: React.ReactNode; hint?: string }) {
  const id = React.useId()
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 accent-clay-500" {...props} />
      <label htmlFor={id} className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </label>
    </div>
  )
}

/** Mutually exclusive choice rendered as large tap targets (mobile friendly). */
export function ChoiceGroup<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (value: T) => void; options: { value: T; label: string; hint?: string }[]
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
            className={cn('rounded-xl border p-3 text-left text-sm transition-colors',
              value === o.value ? 'border-clay-500 bg-clay-50 ring-1 ring-clay-500' : 'bg-white hover:bg-gray-50')}>
            <span className="font-medium">{o.label}</span>
            {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
