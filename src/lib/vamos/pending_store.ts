import { createHmac, randomBytes } from 'crypto'

export interface PendingActionEntry {
  id: string
  userId: string | null
  expiresAt: number
  payload: any
  signature: string
}

const pendingActions = new Map<string, PendingActionEntry>()
const PENDING_TTL_MS = 10 * 60 * 1000

function getSecret(): string {
  return process.env.VAMOS_HMAC_SECRET || 'dev-secret'
}

function generateHmac(id: string, payload: any): string {
  const secret = getSecret()
  const data = `${id}:${JSON.stringify(payload)}`
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function generatePendingId(): string {
  const hex = randomBytes(8).toString('hex')
  return `pa_${Date.now()}_${hex}`
}

export function createPendingAction(userId: string | null, payload: any): PendingActionEntry {
  const id = generatePendingId()
  const signature = generateHmac(id, payload)
  const entry: PendingActionEntry = {
    id,
    userId: userId || null,
    expiresAt: Date.now() + PENDING_TTL_MS,
    payload,
    signature,
  }
  pendingActions.set(id, entry)
  if (pendingActions.size > 500) {
    const now = Date.now()
    for (const [k, v] of pendingActions) {
      if (v.expiresAt < now) pendingActions.delete(k)
    }
  }
  return entry
}

export function getPendingAction(id: string): PendingActionEntry | undefined {
  return pendingActions.get(id)
}

export function verifyPendingAction(id: string, actorId: string | null): { valid: boolean; entry?: PendingActionEntry; reason?: string; status?: number } {
  const entry = pendingActions.get(id)
  if (!entry) {
    return { valid: false, reason: 'not_found', status: 400 }
  }
  if (Date.now() > entry.expiresAt) {
    pendingActions.delete(id)
    return { valid: false, reason: 'expired', status: 400 }
  }
  if (entry.userId && actorId && entry.userId !== actorId) {
    return { valid: false, reason: 'user_mismatch', status: 403 }
  }
  if (entry.userId && !actorId) {
    return { valid: false, reason: 'user_required', status: 403 }
  }
  const expected = generateHmac(entry.id, entry.payload)
  if (expected !== entry.signature) {
    return { valid: false, reason: 'signature_mismatch', status: 400 }
  }
  return { valid: true, entry }
}

export function consumePendingAction(id: string): PendingActionEntry | undefined {
  const entry = pendingActions.get(id)
  if (entry) pendingActions.delete(id)
  return entry
}

export function _resetPendingStoreForTests() {
  pendingActions.clear()
}

export { pendingActions }
