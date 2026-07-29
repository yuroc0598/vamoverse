import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as captureCron } from '@/app/api/cron/capture/route'
import { POST as paymentWebhook } from '@/app/api/payments/webhook/route'
import { POST as vamosChat } from '@/app/api/vamos/chat/route'
import { POST as registerEvent } from '@/app/api/events/register/route'
import { GET as listEventRoute, POST as createEventRoute } from '@/app/api/events/route'
import { GET as listPaymentRoute } from '@/app/api/payments/route'
import { clearMockRegistrations } from '@/lib/utils/capacity'
import { mockCreatedEvents } from '@/lib/db/mock_repository'

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost${path}`, init)
}

function actorCookie(actor: { id: string; email: string; role: string }) {
  return `vamoverse_mock_session=${encodeURIComponent(JSON.stringify(actor))}`
}

afterEach(() => {
  vi.unstubAllEnvs()
  clearMockRegistrations()
  mockCreatedEvents.length = 0
})

describe('API trust boundaries', () => {
  it('cron fails closed when its secret is absent', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await captureCron(request('/api/cron/capture', { method: 'POST' }))).status).toBe(503)
  })

  it('cron rejects a wrong bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'expected-secret')
    const response = await captureCron(request('/api/cron/capture', {
      method: 'POST', headers: { authorization: 'Bearer wrong-secret' },
    }))
    expect(response.status).toBe(401)
  })

  it('webhook fails closed outside explicit demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    expect((await paymentWebhook(request('/api/payments/webhook', { method: 'POST', body: '{}' }))).status).toBe(503)
  })

  it('webhook identifies an unprocessed local demo event', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    const response = await paymentWebhook(request('/api/payments/webhook', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ demo: true, processed: false })
  })

  it('Vamos requires authentication outside demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const response = await vamosChat(request('/api/vamos/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Who owes me?' }),
    }))
    expect(response.status).toBe(401)
  })

  it('event registration requires an authenticated actor', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const response = await registerEvent(request('/api/events/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: 'evt_2' }),
    }))
    expect(response.status).toBe(401)
  })

  it('creates and reads an event through the authenticated demo API', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    const cookie = actorCookie({ id: 'coach_1', email: 'coach@demo.com', role: 'coach' })
    const response = await createEventRoute(request('/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: 'API clinic', discipline: 'open_doubles', type: 'group_clinic', capacity: 8,
        priceCents: 0, levelMinUtr: 3.5, levelMaxUtr: 5, startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMinutes: 90, locationName: 'Central Courts',
      }),
    }))
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.event.title).toBe('API clinic')

    const list = await listEventRoute(request('/api/events', { headers: { cookie } }))
    const payload = await list.json()
    expect(payload.events.some((event: { id: string }) => event.id === created.event.id)).toBe(true)
  })

  it('rejects a custom match whose capacity contradicts its discipline', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    const cookie = actorCookie({ id: 'coach_1', email: 'coach@demo.com', role: 'coach' })
    const response = await createEventRoute(request('/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: 'Invalid singles match', discipline: 'open_singles', type: 'custom_match', capacity: 4,
        priceCents: 0, startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMinutes: 90, locationName: 'Central Courts',
      }),
    }))
    expect(response.status).toBe(400)
  })

  it('does not let a student use Vamos confirmation to bypass coach-only event creation', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    const cookie = actorCookie({ id: 'student_1', email: 'maya@demo.com', role: 'student' })
    const draft = await vamosChat(request('/api/vamos/chat', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ message: 'Create a match' }),
    }))
    const draftPayload = await draft.json()
    expect(draftPayload.pending_action.id).toMatch(/^pa_/)

    const confirmation = await vamosChat(request('/api/vamos/chat', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ message: 'Confirm', confirmedActionId: draftPayload.pending_action.id }),
    }))
    expect(confirmation.status).toBe(403)
  })

  it('registers an eligible player through the server route', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    const cookie = actorCookie({ id: 'student_3', email: 'leo@demo.com', role: 'student' })
    const response = await registerEvent(request('/api/events/register', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ eventId: 'evt_2', occurrenceId: 'evt_2_occ_default' }),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'registered', backend: 'mock' })
  })

  it('does not claim a paid demo registration was charged', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    const cookie = actorCookie({ id: 'student_1', email: 'maya@demo.com', role: 'student' })
    const response = await registerEvent(request('/api/events/register', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ eventId: 'evt_1', occurrenceId: 'evt_1_occ_default' }),
    }))
    expect(response.status).toBe(402)
    expect((await response.json()).error).toContain('no charge was made')
  })

  it('scopes demo payments to the authenticated student', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true')
    const cookie = actorCookie({ id: 'student_1', email: 'maya@demo.com', role: 'student' })
    const response = await listPaymentRoute(request('/api/payments', { headers: { cookie } }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.payments.every((payment: { student_id: string }) => payment.student_id === 'student_1')).toBe(true)
  })
})
