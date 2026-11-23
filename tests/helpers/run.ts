import { runAs } from '@/server/commands/run'
import type { Actor } from '@/server/modules/users/accounts'

/** Runs commands exactly as the HTTP endpoint does, as the given actor. */
export const as = (actor: Actor | null) => runAs(actor, { ip: '127.0.0.1', requestId: 'test' })
