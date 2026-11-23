# Vamoverse — Vamos Together

**Serious Play. One Crew.**

Vamoverse is the OS for independent tennis coaches and their community. Built for serious amateur/club players, junior + adult learners who pay for coaching.

> **Tennis first, racquet sports next (Pickleball, Padel, Squash). US only for V1.**

## ✨ What Is Implemented

- **Events and registration:** Approved coaches can persist events. Free registration is server-authoritative and transactionally enforces capacity, rating, discipline, duplicates, and waitlisting. Mixed doubles enforces **2M/2F** for live roster spots.
- **Payment reconciliation:** Existing Stripe PaymentIntents can be captured and reconciled by signed webhooks. Checkout/payment creation is not enabled; paid registration refuses entry until an exact captured payment exists.
- **Vamos demo rules engine:** Local demo mode supports user-bound, one-time confirmations and coach-only custom-match creation. It is intentionally unavailable in production until real data tools replace the demo catalog.
- **Honest feature boundaries:** Schedule, partner discovery, family cards, and messaging are labeled local demos. Their fixtures are hidden and their writes are disabled in production.
- **Ratings:** Manual UTR Singles/Doubles 1-16.5, NTRP 1.0-7.0, WTN 40-1, self-reported unverified for V1. Good Match / Stretch / Mismatch badges + auto-balance doubles teams by combined UTR.
- **UTR account check:** Players can link a UTR ID or profile link plus their name. The server confirms through UTR's public player search that a matching account exists, and each UTR account links to one user. This does not prove ownership or the rating, so ratings stay self-reported. Very common names may not be confirmable automatically.
- **Location:** Google Places pin for every event (court booking out of scope V1).

## 🏗️ Tech

- **Frontend:** Next.js 16 App Router, React 19, TypeScript, Tailwind, shadcn/ui
- **Backend:** Supabase Auth plus Postgres/Redis repositories; explicit local demo mode is unavailable in production
- **Payments:** Official Stripe server SDK, verified/deduplicated webhooks, database-backed capture claims and retries; demo mode never moves money
- **Automation:** Rules-based Vamos workflow with user-bound, expiring, one-time, database-backed confirmations
- **Mobile:** Responsive web in a Capacitor hosted-HTTPS shell; `mobile-shell/` is an offline fallback only

## 🚀 Quick Start (No Keys Needed - Mock Mode)

```bash
# 1. Clone
git clone https://github.com/yuroc0598/vamoverse.git
cd vamoverse

# 2. Env
cp .env.example .env
# .env already contains mock Supabase URLs - no real keys needed for demo

# 3. Install (Meta devs: unset bad registry var)
env -u npm_config_registry npm install --no-audit --no-fund

# 4. Run
env -u npm_config_registry npm run dev
# Open http://localhost:3000
```

## 🐘 Real Backend (Postgres + Redis)

The explicit demo UI always uses its in-memory catalog, even if infrastructure URLs
are present. To exercise the **real** repository path independently, start Postgres
and Redis and run the infrastructure verifier:

```bash
docker compose up -d            # Postgres + Redis; auto-applies db/migrations + db/seed.sql

# add to .env.local
DATABASE_URL=postgres://vamoverse:vamoverse@localhost:5432/vamoverse
REDIS_URL=redis://localhost:6379

npm run verify:infra            # proves atomic registration + idempotency + Redis KV
```

Production uses these backends when demo mode is off. The CI verifier exercises the
same repository and KV implementations without requiring a local Supabase deployment:

| Concern | Mock (default) | Real (`DATABASE_URL` / `REDIS_URL`) |
| --- | --- | --- |
| Registration capacity | in-memory count (single process) | `register_for_occurrence()` with `SELECT … FOR UPDATE` — **overbooking-proof under concurrency** |
| Payment idempotency | in-memory key map | `payments.idempotency_key UNIQUE` |
| Rate limit / pending confirmations | in-process `Map` | Redis rate limits + Postgres confirmations |
| Webhook dedup | not processed without live config | Postgres `stripe_events` unique key |
| Data model | `src/lib/domain/catalog.ts` | `db/migrations/0001_init.sql` (single source of truth) |

The data-model source of truth is `db/migrations/0001_init.sql`; the demo catalog
(`src/lib/domain/catalog.ts`) mirrors it and `db/seed.sql` seeds the same records.

### Demo Accounts (password: demo1234)

- **Coach:** coach@demo.com — Independent coach, $80/$50/$30 rates, can create paid clinics
- **Student:** maya@demo.com — UTR 4.5F, 3.5 NTRP
- **Student:** sarah@demo.com — UTR 4.8F
- **Parent:** dave@demo.com — Parent of 2 juniors (Leo, Emma)

## 🧩 Current Core Flows

**Coach creates an event:**
Create Event → choose discipline/type/capacity/UTR/time/location → server validates coach role and fields → event + occurrence commit atomically → list refreshes. Push notifications and recurrence editing are not implemented.

**Student registers for a free event:**
Open event → server resolves the authenticated player → transaction locks the occurrence → eligibility/capacity/duplicate checks run → registration or waitlist result returns.

**Existing manual-capture payment:**
Coach opens Payments → server atomically claims the coach-owned row → Stripe capture runs outside the database transaction → webhook/database state reconciles the result. No browser timer invents a capture.

## 📁 Project Structure

```
src/
  app/
    page.tsx - Landing
    (auth)/login,signup - Role selector coach/student/parent
    (dashboard)/dashboard - Role-based
      events/ - Events list + [id] detail + registration, gender enforcement Mixed 2M/2F
      play/ - Explicit local roster/eligibility preview; production partner search disabled
      payments/ - Server payment ledger (read-only sample ledger in demo)
      messages/ - Explicit device-only demo; production delivery stays disabled until permission storage is enabled
      community/ - Player directory UTR filtered
      vamos/ - Demo-only rules chat page
    api/
      vamos/chat - Demo rules/confirmation workflow; production fails closed
      payments/webhook - Stripe signature verification + transactional database dedup/state transitions
      cron/capture - Bounded payment claims, Stripe capture, retry/backoff
  components/
    ui/ - shadcn
    events/DisciplineSelector - Gender icons, capacity auto
    rating/CompatibilityBadge - Good/Stretch/Mismatch
    vamos/VamosWidget - Floating chat bubble
  lib/
    supabase/ - explicit development demo client or real Supabase client
    payments/ - client interface + mock with idempotency dedup + fee model
    vamos/ - tools, prompts (UTR 1-16.5), mock_engine regex
    utils/
      gender.ts - validateDiscipline symmetric guards + other only open_* + GENDER_TEST_CASES + suggestBalancedTeams
      rating.ts - getCompatibility + parseUTR up to 16.5
      capacity.ts - register_for_occurrence FOR UPDATE
vamoverse/
  agent.md - Full PRD (public spec)
```

## 🔒 Security / Privacy Notes (Prod Gate)

Production fails closed unless Supabase Auth, Postgres, and Redis are configured. Stripe endpoints separately require their server and webhook secrets. Demo identities/cookies are accepted only outside production.

Deployment requires configuring the real providers, running migrations, provisioning approved roles in Supabase `app_metadata`, adding centralized telemetry, and completing hosted HTTPS/iOS signing. Product work still remains for payment/checkout creation, relationship-scoped messaging and parent access, production partner search/Vamos tools, schedule queries, and end-to-end browser/native release tests. Paid registration returns payment-required until a captured payment row exists; it never claims a demo charge succeeded.

See `vamoverse/agent.md` for full PRD.

## 📄 License

MIT - Built for learning + demo. Not affiliated with USTA/UTR.

## 🙏 Credits

Built with Next.js, Supabase, Stripe, Postgres, Redis, and Capacitor.

Vamos Together! 🎾
