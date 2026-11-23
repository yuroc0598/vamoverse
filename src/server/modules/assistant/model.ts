// The Claude call, behind a small interface so tests can script responses.
import Anthropic from '@anthropic-ai/sdk'
import { aiEnabled } from '../../config'
import { fail } from '../../errors'

const ASSISTANT_MODEL = 'claude-opus-5-5'

export type ModelRequest = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'model' | 'betas' | 'fallbacks' | 'max_tokens'>

export interface ModelClient {
  create(request: ModelRequest): Promise<Anthropic.Beta.BetaMessage>
}

class ClaudeClient implements ModelClient {
  private readonly client = new Anthropic()

  create(request: ModelRequest) {
    return this.client.beta.messages.create({
      ...request,
      model: ASSISTANT_MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, the API retries on a suitable model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  }
}

let override: ModelClient | null = null
let real: ModelClient | null = null

/** Tests inject a scripted client; pass null to restore the real one. */
export function setModelClient(client: ModelClient | null): void {
  override = client
}

export function modelClient(): ModelClient {
  if (override) return override
  if (!aiEnabled()) throw fail.unavailable('The assistant isn’t set up on this server.')
  real ??= new ClaudeClient()
  return real
}
