import { createHmac, randomBytes } from 'crypto'
import { hasDatabase, query, withTransaction } from '@/lib/db/pg'

export interface PendingActionEntry {
  id: string
  userId: string | null
  expiresAt: number
  payload: any
  signature: string
}

const pendingActions = new Map<string, PendingActionEntry>()
const PENDING_TTL_MS = 10 * 60 * 1000

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

function getSecret(): string {
  if (process.env.VAMOS_HMAC_SECRET) return process.env.VAMOS_HMAC_SECRET
  if (process.env.NODE_ENV === 'production') throw new Error('VAMOS_HMAC_SECRET is required in production')
  return 'development-only-vamos-secret'
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function generateHmac(id: string, payload: any): string {
  const secret = getSecret()
  const data = `${id}:${canonicalJson(payload)}`
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function generatePendingId(): string {
  const hex = randomBytes(16).toString('hex')
  return `pa_${Date.now()}_${hex}`
}

export function createPendingAction(userId: string, payload: any): PendingActionEntry {
  const id = generatePendingId()
  const signature = generateHmac(id, payload)
  const entry: PendingActionEntry = {
    id,
    userId,
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

export async function createPendingActionDurable(userId: string, payload: any): Promise<PendingActionEntry> {
  const entry = createPendingAction(userId, payload)
  if (hasDatabase()) {
    await query(
      `INSERT INTO vamos_pending_actions(id,user_id,payload,signature,expires_at)
       VALUES ($1,$2,$3::jsonb,$4,to_timestamp($5 / 1000.0))`,
      [entry.id, userId, JSON.stringify(payload), entry.signature, entry.expiresAt]
    )
  } else if (process.env.NODE_ENV === 'production') {
    pendingActions.delete(entry.id)
    throw new Error('DATABASE_URL is required for durable production confirmations')
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
  if (!constantTimeEqual(expected, entry.signature)) {
    return { valid: false, reason: 'signature_mismatch', status: 400 }
  }
  return { valid: true, entry }
}

export async function claimPendingAction(id: string, actorId: string): Promise<{ valid: boolean; entry?: PendingActionEntry; reason?: string; status?: number }> {
  if (!hasDatabase()) {
    const verified = verifyPendingAction(id, actorId)
    if (verified.valid) consumePendingAction(id)
    return verified
  }

  return withTransaction(async (db) => {
    const rows = await db.query<{
      id: string; user_id: string; payload: any; signature: string; expires_at: Date; consumed_at: Date | null
    }>(`SELECT * FROM vamos_pending_actions WHERE id=$1 FOR UPDATE`, [id])
    const row = rows.rows[0]
    if (!row) return { valid: false, reason: 'not_found', status: 400 }
    if (row.consumed_at) return { valid: false, reason: 'already_consumed', status: 409 }
    if (row.expires_at.getTime() < Date.now()) return { valid: false, reason: 'expired', status: 400 }
    if (row.user_id !== actorId) return { valid: false, reason: 'user_mismatch', status: 403 }
    const entry: PendingActionEntry = {
      id: row.id,
      userId: row.user_id,
      payload: row.payload,
      signature: row.signature,
      expiresAt: row.expires_at.getTime(),
    }
    const expected = generateHmac(entry.id, entry.payload)
    if (!constantTimeEqual(expected, entry.signature)) {
      return { valid: false, reason: 'signature_mismatch', status: 400 }
    }
    await db.query(`UPDATE vamos_pending_actions SET consumed_at=now() WHERE id=$1`, [id])
    return { valid: true, entry }
  })
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
