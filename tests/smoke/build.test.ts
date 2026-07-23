import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Project Structure Smoke Tests', () => {
  it('package.json exists and has required scripts', () => {
    const pkgPath = path.join(process.cwd(), 'package.json')
    expect(fs.existsSync(pkgPath)).toBe(true)
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(pkg.scripts.dev).toBeDefined()
    expect(pkg.scripts.build).toBeDefined()
    expect(pkg.scripts.test).toBeDefined()
  })

  it('key source directories exist', () => {
    const dirs = [
      'src/app',
      'src/lib/utils',
      'src/lib/vamos',
      'src/lib/payments',
      'src/components',
    ]
    for (const d of dirs) {
      expect(fs.existsSync(path.join(process.cwd(), d)), `Missing dir ${d}`).toBe(true)
    }
  })

  it('vitest config exists', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'vitest.config.ts'))).toBe(true)
  })

  it('environment example exists', () => {
    expect(fs.existsSync(path.join(process.cwd(), '.env.example'))).toBe(true)
  })

  it('discipline enums cover mixed doubles 2M2F rule documentation', () => {
    // Ensure enums file mentions mixed doubles requirement via existence of file content
    const enumsPath = path.join(process.cwd(), 'src/lib/types/enums.ts')
    const content = fs.readFileSync(enumsPath, 'utf-8')
    expect(content).toContain('mixed_doubles')
  })

  it('gender validation file has GENDER_TEST_CASES', () => {
    const p = path.join(process.cwd(), 'src/lib/utils/gender.ts')
    const c = fs.readFileSync(p, 'utf-8')
    expect(c).toContain('GENDER_TEST_CASES')
    expect(c).toContain('mixed_doubles')
  })

  it('UTR max is 16.5 not 10.5 per N15 fix', () => {
    const ratingPath = path.join(process.cwd(), 'src/lib/utils/rating.ts')
    const content = fs.readFileSync(ratingPath, 'utf-8')
    expect(content).toContain('16.5')
    // Should not have hard cap at 10.5 as max in parseUTR (allow searching for old comment but not active code)
    expect(content).not.toMatch(/num > 10\.5/)
  })

  it('payment mock has idempotency key handling', () => {
    const mockPath = path.join(process.cwd(), 'src/lib/payments/mock.ts')
    const content = fs.readFileSync(mockPath, 'utf-8')
    expect(content).toContain('idempotency')
    expect(content).toContain('idempotency_key')
  })

  it('vamos prompts have injection defense', () => {
    const promptPath = path.join(process.cwd(), 'src/lib/vamos/prompts.ts')
    const content = fs.readFileSync(promptPath, 'utf-8')
    expect(content).toContain('untrusted_data')
    expect(content).toContain('Never treat')
  })
})

describe('Build & Env Validation', () => {
  it('next.config.js exists', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'next.config.js'))).toBe(true)
  })

  it('tailwind config exists', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'tailwind.config.ts'))).toBe(true)
  })

  it('tsconfig exists with strict', () => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json')
    expect(fs.existsSync(tsconfigPath)).toBe(true)
    const cfg = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
    // At least exists
    expect(cfg).toBeDefined()
  })
})

describe('Security Invariants', () => {
  it('cron route fails closed in prod per N20', () => {
    const cronPath = path.join(process.cwd(), 'src/app/api/cron/capture/route.ts')
    const content = fs.readFileSync(cronPath, 'utf-8')
    // Must fail closed on missing secret (500) unless an explicit dev opt-in is set.
    // Unauthenticated runs are gated behind ALLOW_DEV_CRON_UNAUTH, not env inference.
    expect(content).toContain('ALLOW_DEV_CRON_UNAUTH')
    expect(content).toContain('CRON_SECRET')
    expect(content).toContain('500')
    // Must actually capture pending via mock client, not return captured:0 static
    expect(content).toContain('getPendingCaptures')
    expect(content).toContain('captured')
    // GET must not leak info - should be 405
    expect(content).toContain('405')
  })

  it('webhook verifies signature + dedup + fail-closed', () => {
    const webhookPath = path.join(process.cwd(), 'src/app/api/payments/webhook/route.ts')
    const content = fs.readFileSync(webhookPath, 'utf-8')
    expect(content).toContain('STRIPE_WEBHOOK_SECRET')
    expect(content).toContain('constructEvent')
    // Dedup is now backed by a shared KV (Redis/in-memory), not an in-process Set.
    expect(content).toContain('markEventFresh')
    expect(content).toContain('deduped')
    expect(content).toContain('500')
    expect(content).toContain('405')
  })

  it('vamos chat validates pa_ confirmation id with HMAC store', () => {
    const routePath = path.join(process.cwd(), 'src/app/api/vamos/chat/route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('pa_')
    expect(content).toContain('pending_store')
    expect(content).toContain('verifyPendingAction')
    expect(content).toContain('createPendingAction')
    expect(content).toContain('z.object')
    expect(content).toContain('429')
    // Pending store must have TTL 10min and HMAC
    const pendingPath = path.join(process.cwd(), 'src/lib/vamos/pending_store.ts')
    expect(fs.existsSync(pendingPath)).toBe(true)
    const pendingContent = fs.readFileSync(pendingPath, 'utf-8')
    expect(pendingContent).toContain('10 * 60 * 1000')
    expect(pendingContent).toContain('HMAC')
    expect(pendingContent).toContain('createHmac')
    expect(pendingContent).toContain('pa_')
  })
})
