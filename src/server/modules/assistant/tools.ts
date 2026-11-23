// Turns the command registry into Claude tool definitions for one actor. The assistant
// can only do what the user could do through the app, with the same validation.
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { CommandDef } from '../../commands/define'
import { commands } from '../../commands/registry'
import type { Actor } from '../users/accounts'

export interface AssistantTools {
  tools: Anthropic.Beta.BetaTool[]
  /** tool name → command name and whether running it needs the user's confirmation */
  byName: Map<string, { command: string; mutates: boolean }>
}

const toToolName = (command: string) => command.replace(/\./g, '__')

/** Commands this actor may use as tools (stable order keeps the prompt cache warm). */
function availableCommands(actor: Actor): [string, CommandDef][] {
  return (Object.entries(commands) as [string, CommandDef][]).filter(([, def]) =>
    def.assistant !== false && def.access !== 'admin' && (def.access !== 'provider' || Boolean(actor.providerId)))
}

function inputSchema(def: CommandDef): Anthropic.Beta.BetaTool['input_schema'] {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(def.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
  const properties = { ...((schema.properties as Record<string, unknown>) ?? {}) }
  const required = [...((schema.required as string[]) ?? [])]
  if (def.mutates) {
    // The model writes the line the user sees on the confirmation card.
    properties.summary = { type: 'string', description: 'One short sentence, in plain words, describing exactly what this will do. Shown to the user to confirm.' }
    required.push('summary')
  }
  return { ...schema, type: 'object', properties, required }
}

export function buildTools(actor: Actor): AssistantTools {
  const byName = new Map<string, { command: string; mutates: boolean }>()
  const tools = availableCommands(actor).map(([name, def]) => {
    const toolName = toToolName(name)
    byName.set(toolName, { command: name, mutates: def.mutates })
    return {
      name: toolName,
      description: def.mutates ? `${def.summary} (Changes something: the user confirms before it runs.)` : def.summary,
      input_schema: inputSchema(def),
    }
  })
  return { tools, byName }
}
