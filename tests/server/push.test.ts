// Push notifications to the native app: device registration, the dispatcher's push channel
// (separate status, so email/SMS retries never re-push), and the APNs request itself.
import { createServer, type Http2Server, type IncomingHttpHeaders } from 'node:http2'
import { generateKeyPairSync, verify } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db'
import { apnsOrigin, closeApnsSessions, resetProviderToken, sendToApns } from '@/server/modules/notifications/apns'
import * as channels from '@/server/modules/notifications/channels'
import { deliverPending } from '@/server/modules/notifications/dispatcher'
import { enqueue } from '@/server/modules/notifications/outbox'
import { resetDb } from '../helpers/db'
import { makeUser } from '../helpers/factories'
import { as } from '../helpers/run'

const tokenA = 'a'.repeat(64)
const tokenB = 'b'.repeat(64)
const ENV_KEYS = ['PUSH_MODE', 'APNS_ORIGIN', 'APNS_KEY_ID', 'APNS_PRIVATE_KEY', 'APPLE_TEAM_ID', 'APNS_TOPIC']
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

beforeEach(resetDb)
afterEach(() => {
  vi.restoreAllMocks()
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k] }
  resetProviderToken()
})

const devices = () => db.query<{ token: string; userId: string; environment: string }>(`SELECT token, user_id AS "userId", environment FROM devices ORDER BY token`)
const pushStatus = async () => (await db.query<{ push_status: string; email_status: string }>(`SELECT push_status, email_status FROM notifications`))

describe('devices', () => {
  it('registers a token once and moves it to whoever signs in on that device', async () => {
    const [maya, sam] = await Promise.all([makeUser('Maya'), makeUser('Sam')])
    await as(maya)('devices.register', { token: tokenA.toUpperCase(), environment: 'sandbox' })
    await as(maya)('devices.register', { token: tokenA, environment: 'sandbox' })
    expect(await devices()).toEqual([{ token: tokenA, userId: maya.userId, environment: 'sandbox' }])
    await as(sam)('devices.register', { token: tokenA, environment: 'production' })
    expect(await devices()).toEqual([{ token: tokenA, userId: sam.userId, environment: 'production' }])
    await expect(as(sam)('devices.register', { token: 'not-a-token', environment: 'sandbox' })).rejects.toMatchObject({ code: 'bad_request' })
  })

  it('unregisters only your own token, and account deletion removes every device', async () => {
    const [maya, sam] = await Promise.all([makeUser('Maya'), makeUser('Sam')])
    await as(maya)('devices.register', { token: tokenA, environment: 'sandbox' })
    await as(maya)('devices.register', { token: tokenB, environment: 'sandbox' })
    expect(await as(sam)('devices.unregister', { token: tokenA })).toEqual({ removed: false })
    expect(await as(maya)('devices.unregister', { token: tokenA })).toEqual({ removed: true })
    expect((await devices()).map((d) => d.token)).toEqual([tokenB])
    await as(maya)('account.delete', { confirm: 'DELETE' })
    expect(await devices()).toEqual([])
  })
})

describe('push delivery', () => {
  it('pushes to each device with the unread count as the badge, once', async () => {
    const push = vi.spyOn(channels, 'sendPush').mockResolvedValue('sent')
    vi.spyOn(channels, 'sendEmail').mockResolvedValue()
    const maya = await makeUser('Maya')
    await as(maya)('devices.register', { token: tokenA, environment: 'sandbox' })
    await as(maya)('devices.register', { token: tokenB, environment: 'production' })
    await enqueue(db, { userId: maya.userId, kind: 'booking.confirmed', title: 'Booked', body: 'Tue 6pm', link: '/b/bkg_1?t=x' })
    await enqueue(db, { userId: maya.userId, kind: 'message.new', title: 'Message', body: 'Hi', link: '/messages/cnv_1' })
    await deliverPending(db)
    expect(push).toHaveBeenCalledTimes(4)
    expect(push).toHaveBeenCalledWith({ token: tokenA, environment: 'sandbox', title: 'Booked', body: 'Tue 6pm', link: '/b/bkg_1?t=x', badge: 2 })
    expect((await pushStatus()).map((r) => r.push_status)).toEqual(['sent', 'sent'])
    await db.query(`UPDATE notifications SET next_attempt_at = now()`)
    expect(await deliverPending(db)).toBe(0)
  })

  it('never re-pushes while email retries, and skips users without the app', async () => {
    const push = vi.spyOn(channels, 'sendPush').mockResolvedValue('sent')
    vi.spyOn(channels, 'sendEmail').mockRejectedValue(new Error('provider down'))
    const [maya, sam] = await Promise.all([makeUser('Maya'), makeUser('Sam')])
    await as(maya)('devices.register', { token: tokenA, environment: 'sandbox' })
    await enqueue(db, { userId: maya.userId, kind: 'booking.confirmed', title: 'Booked', body: 'x' })
    await enqueue(db, { userId: sam.userId, kind: 'booking.confirmed', title: 'Booked', body: 'x' })
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.query(`UPDATE notifications SET next_attempt_at = now()`)
      await deliverPending(db)
    }
    expect(push).toHaveBeenCalledTimes(1)
    expect(await db.query(`SELECT u.display_name AS name, n.push_status, n.email_status FROM notifications n JOIN users u ON u.id = n.user_id ORDER BY u.display_name`))
      .toEqual([{ name: 'Maya', push_status: 'sent', email_status: 'failed' }, { name: 'Sam', push_status: 'skipped', email_status: 'failed' }])
  })

  it('forgets devices APNs reports gone, and retries when no device got it', async () => {
    vi.spyOn(channels, 'sendEmail').mockResolvedValue()
    const push = vi.spyOn(channels, 'sendPush').mockImplementation(async (p) => (p.token === tokenA ? 'gone' : Promise.reject(new Error('APNs 503'))))
    const maya = await makeUser('Maya')
    await as(maya)('devices.register', { token: tokenA, environment: 'sandbox' })
    await as(maya)('devices.register', { token: tokenB, environment: 'sandbox' })
    await enqueue(db, { userId: maya.userId, kind: 'booking.confirmed', title: 'Booked', body: 'x' })
    await deliverPending(db)
    expect((await devices()).map((d) => d.token)).toEqual([tokenB])
    expect(await pushStatus()).toEqual([{ push_status: 'pending', email_status: 'sent' }])
    push.mockResolvedValue('sent')
    await db.query(`UPDATE notifications SET next_attempt_at = now()`)
    await deliverPending(db)
    expect(await pushStatus()).toEqual([{ push_status: 'sent', email_status: 'sent' }])
  })

  it('respects each person’s channel choices: push off still emails, and back on pushes again', async () => {
    const push = vi.spyOn(channels, 'sendPush').mockResolvedValue('sent')
    const email = vi.spyOn(channels, 'sendEmail').mockResolvedValue()
    const maya = await makeUser('Maya')
    await as(maya)('devices.register', { token: tokenA, environment: 'sandbox' })
    expect(await as(maya)('account.get', {})).toMatchObject({ notifyEmail: true, notifySms: true, notifyPush: true })
    await as(maya)('account.update', { notifyPush: false })
    expect(await as(maya)('account.get', {})).toMatchObject({ notifyEmail: true, notifyPush: false })
    await enqueue(db, { userId: maya.userId, kind: 'booking.confirmed', title: 'Booked', body: 'x' })
    await deliverPending(db)
    expect(push).not.toHaveBeenCalled()
    expect(email).toHaveBeenCalledTimes(1)
    expect(await pushStatus()).toEqual([{ push_status: 'skipped', email_status: 'sent' }])
    await as(maya)('account.update', { notifyPush: true, notifyEmail: false })
    await enqueue(db, { userId: maya.userId, kind: 'message.new', title: 'Message', body: 'Hi' })
    await deliverPending(db)
    expect(push).toHaveBeenCalledTimes(1)
    expect(email).toHaveBeenCalledTimes(1)
  })

  it('starts new notifications as pending (existing rows were backfilled as skipped)', async () => {
    const maya = await makeUser('Maya')
    await enqueue(db, { userId: maya.userId, kind: 'k', title: 't', body: 'b' })
    expect((await pushStatus())[0].push_status).toBe('pending')
    await expect(db.query(`UPDATE notifications SET push_status = 'nope'`)).rejects.toThrow()
  })
})

describe('push channel', () => {
  it('logs in development and is off in production without keys', async () => {
    delete process.env.APNS_KEY_ID
    const push = { token: tokenA, environment: 'sandbox' as const, title: 't', body: 'b', link: null, badge: 1 }
    expect(await channels.sendPush(push)).toBe('sent')
    process.env.PUSH_MODE = 'off'
    expect(await channels.sendPush(push)).toBe('skipped')
  })

  it('picks the APNs host per device environment', () => {
    delete process.env.APNS_ORIGIN
    expect(apnsOrigin('sandbox')).toBe('https://api.sandbox.push.apple.com')
    expect(apnsOrigin('production')).toBe('https://api.push.apple.com')
  })

  describe('against a fake APNs server', () => {
    let server: Http2Server
    let respond: (path: string) => { status: number; body?: string }
    const received: { headers: IncomingHttpHeaders; body: string }[] = []
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

    let connections = 0

    beforeEach(async () => {
      received.length = 0
      connections = 0
      server = createServer()
      server.on('session', () => { connections++ })
      server.on('stream', (stream, headers) => {
        let body = ''
        stream.setEncoding('utf8')
        stream.on('data', (c: string) => { body += c })
        stream.on('end', () => {
          received.push({ headers, body })
          const reply = respond(String(headers[':path']))
          stream.respond({ ':status': reply.status })
          stream.end(reply.body ?? '')
        })
      })
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
      process.env.APNS_ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      process.env.APNS_KEY_ID = 'KEY123ABCD'
      process.env.APPLE_TEAM_ID = 'TEAM123456'
      process.env.APNS_TOPIC = 'com.vamoverse.app'
      // One-line env var form, with literal \n.
      process.env.APNS_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n')
      delete process.env.PUSH_MODE
    })
    afterEach(async () => {
      await closeApnsSessions()
      await new Promise<void>((done) => server.close(() => done()))
    })

    it('sends a signed request with the alert, badge, and link', async () => {
      respond = () => ({ status: 200 })
      expect(await channels.sendPush({ token: tokenA, environment: 'production', title: 'You’re booked', body: 'Tue 6pm', link: '/b/bkg_1?t=x', badge: 3 })).toBe('sent')
      const [{ headers, body }] = received
      expect(headers[':method']).toBe('POST')
      expect(headers[':path']).toBe(`/3/device/${tokenA}`)
      expect(headers['apns-topic']).toBe('com.vamoverse.app')
      expect(headers['apns-push-type']).toBe('alert')
      expect(JSON.parse(body)).toEqual({ aps: { alert: { title: 'You’re booked', body: 'Tue 6pm' }, badge: 3, sound: 'default' }, link: '/b/bkg_1?t=x' })
      // The provider token is an ES256 JWT from the .p8 key: verify it with the public key.
      const jwt = String(headers.authorization).replace(/^bearer /, '')
      const [header, claims, signature] = jwt.split('.')
      expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123ABCD' })
      expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({ iss: 'TEAM123456' })
      expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true)
    })

    it('reports gone devices (410, bad token) and throws on errors worth retrying', async () => {
      const push = { token: tokenA, environment: 'sandbox' as const, title: 't', body: 'b', link: null, badge: 0 }
      respond = () => ({ status: 410, body: JSON.stringify({ reason: 'Unregistered' }) })
      expect(await sendToApns(push)).toBe('gone')
      respond = () => ({ status: 400, body: JSON.stringify({ reason: 'BadDeviceToken' }) })
      expect(await sendToApns(push)).toBe('gone')
      respond = () => ({ status: 429, body: JSON.stringify({ reason: 'TooManyRequests' }) })
      await expect(sendToApns(push)).rejects.toThrow('APNs 429 TooManyRequests')
    })

    it('delivers end to end through the dispatcher and forgets a removed app', async () => {
      vi.spyOn(channels, 'sendEmail').mockResolvedValue()
      respond = (path) => (path.endsWith(tokenB) ? { status: 410, body: JSON.stringify({ reason: 'Unregistered' }) } : { status: 200 })
      const maya = await makeUser('Maya')
      await as(maya)('devices.register', { token: tokenA, environment: 'sandbox' })
      await as(maya)('devices.register', { token: tokenB, environment: 'sandbox' })
      await enqueue(db, { userId: maya.userId, kind: 'message.new', title: 'Message from Alex', body: 'See you at 6', link: '/messages/cnv_1' })
      await deliverPending(db)
      expect(received).toHaveLength(2)
      expect(connections).toBe(1) // one HTTP/2 connection reused for both devices
      expect(await pushStatus()).toEqual([{ push_status: 'sent', email_status: 'sent' }])
      expect((await devices()).map((d) => d.token)).toEqual([tokenA])
    })
  })
})
