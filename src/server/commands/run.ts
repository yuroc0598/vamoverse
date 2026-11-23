import { z } from 'zod'
import { db } from '../db'
import { fail } from '../errors'
import type { Actor } from '../modules/users/accounts'
import type { Access, CommandDef } from './define'
import { commands, type CommandInput, type CommandName, type CommandOutput } from './registry'

export interface RunContext {
  actor: Actor | null
  ip: string | null
  requestId: string
}

export function getCommand(name: string): CommandDef | null {
  return Object.prototype.hasOwnProperty.call(commands, name) ? (commands as Record<string, CommandDef>)[name] : null
}

function authorize(access: Access, actor: Actor | null): void {
  if (access === 'public') return
  if (!actor) throw fail.unauthorized()
  if (access === 'provider' && !actor.providerId) throw fail.forbidden('Set up your coaching or hitting profile first.')
  if (access === 'admin' && !actor.isAdmin) throw fail.forbidden()
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  const field = issue.path.join('.')
  return field ? `${field}: ${issue.message}` : issue.message
}

export async function runCommand(name: string, input: unknown, context: RunContext): Promise<unknown> {
  const def = getCommand(name)
  if (!def) throw fail.notFound('Action')
  authorize(def.access, context.actor)
  const parsed = def.input.safeParse(input ?? {})
  if (!parsed.success) throw fail.badRequest(describeIssue(parsed.error), z.flattenError(parsed.error))
  return def.run({ ...context, db } as never, parsed.data)
}

/** Typed command calls as a given actor, for server components (and tests). */
export function runAs(actor: Actor | null, meta: { ip?: string | null; requestId?: string } = {}) {
  return <N extends CommandName>(name: N, input: CommandInput<N>): Promise<CommandOutput<N>> =>
    runCommand(name, input, { actor, ip: meta.ip ?? null, requestId: meta.requestId ?? 'server' }) as Promise<CommandOutput<N>>
}
