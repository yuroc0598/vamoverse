// Apple Push Notification service over HTTP/2 with token (.p8 key) authentication.
// https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
import { sign } from 'node:crypto'
import { connect, constants, type ClientHttp2Session } from 'node:http2'
import { apnsConfig } from '../../config'

export interface ApnsPush {
  token: string
  environment: 'sandbox' | 'production'
  title: string
  body: string
  /** Web path the app opens when the notification is tapped. */
  link: string | null
  badge: number
}

/** `gone`: the app was removed from that device or the token is invalid; forget the device. */
export type ApnsResult = 'sent' | 'gone'

const GONE_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'])

export function apnsOrigin(environment: ApnsPush['environment']): string {
  return process.env.APNS_ORIGIN?.trim() || (environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com')
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

// APNs wants the provider token refreshed at most every 20 minutes and at least every hour.
let cached: { jwt: string; issuedAt: number; keyId: string } | null = null

/** The ES256 provider token (JWT) for APNs, reused for 50 minutes. */
function providerToken(now = Date.now()): string {
  const config = apnsConfig()
  if (!config) throw new Error('APNs is not configured')
  if (cached && cached.keyId === config.keyId && now - cached.issuedAt < 50 * 60_000) return cached.jwt
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }))
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: config.privateKey, dsaEncoding: 'ieee-p1363' })
  cached = { jwt: `${header}.${claims}.${base64url(signature)}`, issuedAt: now, keyId: config.keyId }
  return cached.jwt
}

export function resetProviderToken(): void {
  cached = null
}

function apnsPayload(push: Pick<ApnsPush, 'title' | 'body' | 'link' | 'badge'>): string {
  return JSON.stringify({ aps: { alert: { title: push.title, body: push.body }, badge: push.badge, sound: 'default' }, link: push.link })
}

/** Sends one notification. Throws on errors worth retrying (the dispatcher retries with backoff). */
export async function sendToApns(push: ApnsPush): Promise<ApnsResult> {
  const config = apnsConfig()
  if (!config) throw new Error('APNs is not configured')
  const { status, body } = await post(apnsOrigin(push.environment), `/3/device/${push.token}`, {
    authorization: `bearer ${providerToken()}`,
    'apns-topic': config.topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  }, apnsPayload(push))
  if (status === 200) return 'sent'
  const reason = (() => { try { return (JSON.parse(body) as { reason?: string }).reason ?? '' } catch { return '' } })()
  if (status === 410 || (status === 400 && GONE_REASONS.has(reason))) return 'gone'
  if (status === 403 && reason === 'ExpiredProviderToken') resetProviderToken()
  throw new Error(`APNs ${status}${reason ? ` ${reason}` : ''}`)
}

// Apple asks providers to keep connections open rather than reconnect per notification, so one
// HTTP/2 session per origin is reused. It's dropped on error, GOAWAY, or close, and closes itself
// after a minute idle. unref() keeps it from holding the process open (cron runs, tests).
const sessions = new Map<string, ClientHttp2Session>()
const IDLE_MS = 60_000

function sessionFor(origin: string): ClientHttp2Session {
  const existing = sessions.get(origin)
  if (existing && !existing.closed && !existing.destroyed) return existing
  const session = connect(origin)
  session.unref()
  session.setTimeout(IDLE_MS, () => session.close())
  const forget = () => { if (sessions.get(origin) === session) sessions.delete(origin) }
  session.on('error', forget)
  session.on('goaway', forget)
  session.on('close', forget)
  sessions.set(origin, session)
  return session
}

/** Closes pooled APNs connections (shutdown and tests). */
export async function closeApnsSessions(): Promise<void> {
  const open = [...sessions.values()]
  sessions.clear()
  await Promise.all(open.map((s) => new Promise<void>((done) => (s.closed || s.destroyed ? done() : s.close(() => done())))))
}

function post(origin: string, path: string, headers: Record<string, string>, payload: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const session = sessionFor(origin)
    const request = session.request({ ':method': 'POST', ':path': path, ...headers })
    request.setTimeout(10_000, () => request.close(constants.NGHTTP2_CANCEL))
    let status = 0
    let body = ''
    request.setEncoding('utf8')
    request.on('response', (h) => { status = Number(h[':status']) })
    request.on('data', (chunk: string) => { body += chunk })
    request.on('end', () => resolve({ status, body }))
    request.on('close', () => { if (!status) reject(new Error('APNs request closed without a response')) })
    request.on('error', (error) => {
      session.destroy()
      reject(error)
    })
    request.end(payload)
  })
}
