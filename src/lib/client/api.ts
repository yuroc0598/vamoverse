"use client"
// Typed client for the command endpoint, plus a hook with pending state and error toasts.
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { CommandInput, CommandName, CommandOutput } from '@/server/commands/registry'

export class CommandError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message)
  }
}

export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

export async function call<N extends CommandName>(name: N, input: CommandInput<N>): Promise<CommandOutput<N>> {
  const response = await fetch(apiUrl(`/api/commands/${name}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new CommandError(payload.error?.message || 'Something went wrong.', payload.error?.code || 'internal', response.status)
  }
  return payload.data as CommandOutput<N>
}

/**
 * `const save = useCommand('provider.update', { success: 'Saved' })` →
 * `await save.run(input)` returns the result, or undefined after toasting the error.
 */
export function useCommand<N extends CommandName>(name: N, options: { success?: string } = {}) {
  const [pending, setPending] = useState(false)
  const run = useCallback(async (input: CommandInput<N>): Promise<CommandOutput<N> | undefined> => {
    setPending(true)
    try {
      const result = await call(name, input)
      if (options.success) toast.success(options.success)
      return result
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
      return undefined
    } finally {
      setPending(false)
    }
  }, [name, options.success])
  return { run, pending }
}
