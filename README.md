# Vamoverse — Vamos Together

**Serious Play. One Crew.**

Vamoverse is the OS for independent tennis coaches and their community. Built for serious amateur/club players, junior + adult learners who pay for coaching.

> **Tennis first, racquet sports next (Pickleball, Padel, Squash). US only for V1.**

## ✨ What It Does

- **Scheduling that gets doubles:** Private (1:1), Semi-Private (1:2-4), Group Clinics (5-12), Custom Matches. Gender enforcement: Mens Doubles = 4M, Womens Doubles = 4F, **Mixed Doubles = 2M/2F exactly** — blocks 3M/1F.
- **Paid Events + Auto-Pay:** Toggle Free/Paid when creating event. Student pays at registration. Lessons auto-pay after coach marks completed with 2hr dispute window (2min demo).
- **Vamos AI — Your Captain:** Ask Vamos: “Find me mixed doubles Thu 7pm UTR 4-5 near Fremont” or “Who owes me?” — tool calling with confirmation.
- **Social, but safe:** Coach broadcast, coach-student DM if linked, student-student DM only after Hitting Partner accepted. Parent audit for juniors (<18), parent CC.
- **Ratings:** Manual UTR Singles/Doubles 1-16.5, NTRP 1.0-7.0, WTN 40-1, self-reported unverified for V1. Good Match / Stretch / Mismatch badges + auto-balance doubles teams by combined UTR.
- **Location:** Google Places pin for every event (court booking out of scope V1).

## 🏗️ Tech

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui
- **Backend (mock-first):** Supabase (Postgres + Auth + Realtime) with mock fallback — works without real keys
- **Payments:** Stripe Connect Express abstracted via `PaymentClient` interface — mock implementation by default (localStorage), auto-capture timer 2min demo for 2hr real, idempotency_key + application_fee + customer model
- **AI:** OpenAI-compatible tool calling — `src/lib/vamos/` + mock_engine regex fallback, confirmation via server-signed `pending_action_id` with expiry
- **Mobile:** Responsive web, Capacitor-ready wrapper planned

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

### Demo Accounts (password: demo1234)

- **Coach:** coach@demo.com — Independent coach, $80/$50/$30 rates, can create paid clinics
- **Student:** maya@demo.com — UTR 4.5F, 3.5 NTRP
- **Student:** sarah@demo.com — UTR 4.8F
- **Parent:** dave@demo.com — Parent of 2 juniors (Leo, Emma)

## 🧩 Core Flows

**Coach creates paid group clinic:**
Create Event → Type Group Clinic → Discipline Open Doubles → UTR 3.5-5 → Sat 9am weekly recurring → Capacity 8 → Paid $40 → Location Fremont Tennis Center → Publish → Students get push → Register + pay at registration

**Student finds doubles via Vamos:**
Play → Chat with Vamos: “mixed doubles tomorrow 7pm need 2 more, UTR 4-5” → Vamos searches + suggests Sarah 4.8F, Leo 4.5M, Emma 4.2F → Create custom match with 4 slots → Invite → Accept → Confirmed

**Auto-pay:**
Coach marks private lesson Completed → Payment requires_capture with auto_capture_at = now+2h (2min demo) → Student sees “Auto-pay in 1h 45m” → Dispute window → Cron captures via row locking `FOR UPDATE SKIP LOCKED` + webhook as source of truth (mock uses setInterval localStorage for demo)

## 📁 Project Structure

```
src/
  app/
    page.tsx - Landing
    (auth)/login,signup - Role selector coach/student/parent
    (dashboard)/dashboard - Role-based
      events/ - Events list + [id] detail + registration, gender enforcement Mixed 2M/2F
      play/ - Doubles discovery + Hitting Partners search
      payments/ - Mock payments with countdown
      messages/ - Chat with permission matrix
      community/ - Player directory UTR filtered
      vamos/ - Full AI chat page
    api/
      vamos/chat - Tool calling with mock fallback
      payments/webhook - Signature verification + dedup doc
      cron/capture - Row locking prod SQL doc
  components/
    ui/ - shadcn
    events/DisciplineSelector - Gender icons, capacity auto
    rating/CompatibilityBadge - Good/Stretch/Mismatch
    vamos/VamosWidget - Floating chat bubble
  lib/
    supabase/ - client with mock fallback
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

This is **MOCK DEMO** solid, but not production-safe as described - remaining gap is honestly tracked:

- RLS: Design exists with security definer helpers for recursion fix, safe views for PII (no home_lat/lng/address for minors, no stripe_account_id in base table discovery), but running app uses mock Supabase localStorage no RLS executes - needs real Supabase project + RLS integration test
- Payments: Mock idempotency dedup + status-guarded capture correct, but authoritative path (real Stripe client, cron with row locking execution, webhook signature verification) is stub with SQL in comments - live demo relies on client setInterval which is original defect but acceptable if labeled mock
- COPPA: Spec requires DOB required fail-closed + parental_consents table, mock signup trusts client role - spec resolved, code not enforced in mock
- Vamos: Confirmation now uses server-signed pending_action_id format `pa_<timestamp>_<signature>` with timestamp expiry + signature format check, honest MOCK labeling (not claimed signature verified), DB lookup simulated - prod needs HMAC + DB lookup scoped to auth.uid()
- No test runner for GENDER_TEST_CASES, no Sentry, medical_notes plaintext - V2 backlog

See `vamoverse/agent.md` for full PRD.

## 📄 License

MIT - Built for learning + demo. Not affiliated with USTA/UTR.

## 🙏 Credits

Built with Next.js, Supabase, Stripe mock, and Vamos AI (OpenAI compatible).

Vamos Together! 🎾
