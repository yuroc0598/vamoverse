# Vamoverse

Tennis coaches and paid hitting partners run their lessons, clinics, and hitting sessions here:
booking, payments, reminders, rain-outs, and messages. Players and parents book from one link
with no app and no account required.

## What it does

**Coaches and hitters**
- Weekly clinics, privates, semi-privates, and hitting sessions; **open slots** players book themselves.
- Four payment rules per session: pay when booking, card charged after the session, pay outside the app (cash/Venmo, mark paid in one tap), or free.
- Cancellation policy (free-cancel window, late-cancel and no-show fees) applied automatically, with one-tap waive.
- **Rain-out**: cancel a session or a whole day; everyone is told, refunded, or gets their credit back.
- Waitlists that offer freed seats to the next player automatically.
- Roster (“Crew”): paste students from a spreadsheet or contacts to save them as invites you send from your own phone or email; they join with your link or by booking. Add students to sessions (they confirm with one tap); private notes; who owes what.
- Packages (prepaid credits) that apply automatically and enforce late cancels.
- Payouts through Stripe Connect; **Free plan** ($0/month + 2% per payment) or **Pro** ($39/month, no platform fee).
- Group thread per series (texted to players) and direct messages. Juniors never sign in, so their parent is always the person in the conversation.
- Safety check (USTA Safe Play or background check) to unlock junior sessions.

**Players and parents**
- Book and pay from a coach’s link as a guest, or sign in to book for juniors and use credits.
- Reminders the day before and 2 hours before by email and text; calendar invites.
- Find coaches and hitting partners by area and soonest availability.

**Assistant** (optional): Claude (`claude-opus-5-5`) with every product action as a tool. Lookups run
immediately; anything that changes schedules or money is shown for the user to confirm, then runs
with the user’s own permissions.

## Architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind.
- **One command registry** (`src/server/commands/registry.ts`). Every product action is a command
  with a zod input schema, an access level, and a run function. The UI calls them through
  `POST /api/commands/<name>`, server pages through `runAs(actor)`, and the assistant as tools,
  so validation and permissions live in one place.
- **Modules** under `src/server/modules/`: users (accounts, players, guardians), providers, schedule
  (offerings, recurrence, sessions), bookings (engine, eligibility, links), payments (processor
  boundary, Stripe, dev simulator, settlement), packages, clients, messaging, notifications
  (outbox, dispatcher, reminders, ICS), discovery, assistant.
- **Postgres only.** Schema in `db/migrations/`, applied once each by `src/server/migrate.ts`.
  Seat changes take a row lock on the session (no overbooking). Money side effects (refunds,
  after-session charges) are recorded in the same transaction and executed after commit, with
  scheduled retries. Row-level security denies direct access for any role other than the app.
- **Auth:** Supabase (email link, SMS code, Google, Apple) in production; signed dev sessions locally.
  Roles come from the database, never from client-editable metadata.

## Run it locally (no Docker, no accounts)

```bash
env -u npm_config_registry npm install
cp .env.example .env.local
npm run db:dev        # terminal 1: local Postgres (PGlite) on :5433, migrations applied
npm run db:seed       # demo coach, hitter, players, and a parent
npm run dev           # terminal 2: http://localhost:3000
```

Sign in at `/login` with any email; nothing is sent in development. Seeded accounts:
`alex@demo.vamoverse.app` (coach), `sam@demo.vamoverse.app` (hitter), `maya@demo.vamoverse.app`
(player), `dave@demo.vamoverse.app` (parent). Payments use a local simulator that emits the same
events as Stripe webhooks; email and SMS go to the server log. Set `ANTHROPIC_API_KEY` to enable the assistant.

To make someone an admin (safety reviews): `UPDATE users SET is_admin = true WHERE email = '…';`

## Checks

```bash
npm run typecheck && npm run lint
npm test               # in-process Postgres (PGlite); set TEST_DATABASE_URL to use real Postgres
npm run test:coverage
npm run build
```

CI runs the same against real Postgres.

### On the iOS Simulator (macOS + Xcode)

```bash
npm run test:ios                   # native app, then mobile Safari
npm run test:ios -- --only app     # or --only safari
npm run test:ios -- --build        # rebuild and reinstall the app first
```

Books, pays, cancels, and checks the coach and parent guards by tapping through the real UI,
then checks the database after each step. It uses a fresh in-memory database and its own dev
server on port 3100, so your dev data and dev server are untouched. Screenshots and logs land
in `e2e-results/<timestamp>/`. Pick a simulator with `IOS_SIM_DEVICE="iPhone 17 Pro"`.

## Production

Required environment (the server refuses to start without it): see `.env.example`.
- Database: `npm run db:migrate` against `DATABASE_URL` (`PGSSL=require` verifies certificates).
- Stripe: Connect (Express) and a Pro price (`STRIPE_PRO_PRICE_ID`); webhook endpoint
  `/api/webhooks/stripe` for `checkout.session.*`, `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`,
  `account.updated`, `customer.subscription.*`.
- Scheduled jobs (`vercel.json`): `/api/cron/frequent` every 5 minutes, `/api/cron/hourly` hourly,
  authorized with `Authorization: Bearer $CRON_SECRET`.
- Email (Resend) is required; SMS (Twilio) is optional.

## Mobile

The iOS app is a Capacitor shell around the hosted site (`capacitor.config.ts`, `ios/`). See `docs/ios.md`.

Not affiliated with UTR Sports, USTA, or ITF. Ratings are self-reported.
