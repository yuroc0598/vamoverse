// A command is the single definition of a product action: input schema, who may run
// it, and what it does. The HTTP endpoint and the assistant both execute commands,
// so validation and permissions live in exactly one place.
import type { z } from 'zod'
import type { Db } from '../db'
import type { Actor } from '../modules/users/accounts'

export type Access = 'public' | 'user' | 'provider' | 'admin'

export type ProviderActor = Actor & { providerId: string }

interface ContextFor<A extends Access> {
  actor: A extends 'public' ? Actor | null : A extends 'provider' ? ProviderActor : Actor
  db: Db
  ip: string | null
  requestId: string
}

export interface CommandDef<A extends Access = Access, S extends z.ZodType = z.ZodType, R = unknown> {
  summary: string
  access: A
  /** Mutations need explicit confirmation when proposed by the assistant. */
  mutates: boolean
  /** Exposed as an assistant tool. */
  assistant?: boolean
  input: S
  run(ctx: ContextFor<A>, input: z.output<S>): Promise<R>
}

export function command<A extends Access, S extends z.ZodType, R>(def: CommandDef<A, S, R>): CommandDef<A, S, R> {
  return def
}
