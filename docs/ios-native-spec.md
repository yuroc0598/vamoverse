# Native iOS app — spec (v3, agreed by vamoverse-26 and ios)

Status: v3, agreed between vamoverse-26 and the `ios` session. Items marked **[USER]** are product
or account decisions for the user; their defaults apply until decided.

## 1. Goal

A fully native SwiftUI app for players, parents, coaches, and hitters with the same features,
rules, and wording as the web app. It replaces the Capacitor shell (`ios/`) once it reaches parity.

"Aligned with the web" means:
- **Same backend, same API.** Every read and write goes through `POST /api/commands/<name>`, the
  same commands the web pages call through `runAs`. No iOS-only endpoints for product data.
- **No business logic in Swift.** Fees, refunds, cancellation windows, eligibility, permissions,
  and overlap rules are decided by the server. The app hides controls a role can't use, but the
  server is the authority, and the app shows the server's `error.message` verbatim.
- **Same words, not retyped.** Text and parsing that the web does on the client (labels in
  `src/lib/format.ts`, the booking status map in `today/page.tsx`, invite message text, contact
  parsing in `src/lib/contacts.ts`) are either moved to the server or exported as shared data
  (§3.4). Swift never re-implements them by hand.
- **If a screen needs data no command returns, extend or add a command on the server** (with
  vitest coverage) so the web and the assistant get it too.

## 2. Backend facts the design relies on

- Commands: `src/server/commands/registry.ts` (78 commands), defined per module in
  `src/server/modules/*/commands.ts`, each with a zod `input`, `access`
  (`public | user | provider | admin`), and `mutates`. Response `{ data }`, or
  `{ error: { code, message, details } }` with 400/401/403/404/409/429.
- Read commands exist for every screen: `account.me`, `account.get`, `bookings.mine`,
  `bookings.get`, `sessions.view`, `sessions.list`, `sessions.get`, `sessions.roster`,
  `offerings.list/get`, `clients.list`, `clients.invites`, `coaches.mine`, `money.summary`,
  `payments.mine`, `credits.mine`, `credits.sold`, `packages.public/list`,
  `messages.threads/read`, `notifications.list`, `find.providers/sessions`,
  `provider.public/settings`, `schedule.public`, `family.list`, `courts.list`, `plan.get`,
  `assistant.history`.
- Auth: `currentActor()` (`src/server/auth/session.ts`) reads cookies only: a signed dev cookie in
  dev, Supabase SSR cookies in production (PKCE). `isSameOrigin` lets requests without an
  `Origin` header through; that covers `/api/commands/*` and `/api/auth/dev`.
- Dates in JSON are ISO-8601 **with milliseconds** (`2026-11-24T10:00:00.000Z`); Postgres `date`
  columns (e.g. `birth_date`) arrive as plain `YYYY-MM-DD` strings (`db.ts`).
- Guest booking links: `/b/<id>?t=<token>`; player-side commands take `token`.
- Hosted pages return to **web** routes, never to the app: checkout success
  `/b/<id>?t=…&paid=1`, checkout cancel `/s/<id>`, package purchase `/today?package=1`, Connect /
  plan / billing portal `/settings/payouts?…`.
- Notifications: an outbox (`notifications` table, routing field `link`) delivered by
  `dispatcher.ts` over email and SMS. Retry state is `email_status`, `sms_status`, `attempts`
  (up to 5); in dev both channels log.
- `account.delete` anonymizes the `users` row and deletes per-user rows from a fixed table list
  (`accounts.ts` ~L142); it does not delete the user, so FK cascades don't fire.
- Web navigation (`src/components/layout/AppShell.tsx`): providers get Today, Schedule, Crew,
  Money (plus Messages, Find, Settings); players/parents get Home, Find, Messages, Profile. Bell →
  Notifications (unread count from `notifications.list`). Admin is web-only.

## 3. Server changes

### 3.1 Bearer auth (phase 1)
- `currentActor()` reads `headers()` inside the existing `cache()`. **If an `Authorization:
  Bearer` header is present it decides the actor and cookies are ignored**; an invalid or
  expired bearer means signed out (401 on `user` commands), never a fallback to cookies and never
  a 500. Browsers never send this header, so web behaviour is unchanged.
- Dev: the bearer is the same signed dev-session value as the cookie. `/api/auth/dev` also
  returns it: `{ data: { ok: true, token } }`.
- Production: a Supabase access token verified with `auth.getUser(token)`, then `ensureActor` as
  with cookies.
- The `.ics` route (`/api/bookings/[id]/calendar`) uses `currentActor`, so bearer works there too.
- Tests: bearer and cookie give the same actor; bearer wins over a cookie; bad bearer → 401.

### 3.2 Devices and push (phase 5)
- Migration: `devices (id, user_id → users, platform 'ios', token UNIQUE, environment
  'sandbox'|'production', created_at, last_seen_at)`; `notifications.push_status`:
  `ADD COLUMN push_status text NOT NULL DEFAULT 'skipped'` (backfills existing rows), then
  `ALTER COLUMN push_status SET DEFAULT 'pending'`, with a CHECK matching the email/SMS status
  columns. The dispatcher sets `skipped` when the recipient has no devices.
- `devices.register` (user, mutates) **upserts on token and moves it to the current user**;
  `devices.unregister` (user, mutates).
- `account.delete` also deletes the user's `devices` (add to the table list), with a test.
- Push channel in `channels.ts`: APNs token auth (.p8) over HTTP/2 via `node:http2`;
  `PUSH_MODE=log` in dev. The dispatcher's claim query includes `push_status = 'pending'`, and
  push is tracked separately so email/SMS retries never re-send a push. APNs 410 deletes the
  device. Payload: notification title/body, `badge` = unread count, `link` for routing.
- Push is sent **in addition to** email/SMS (user's decision). Each person chooses their channels
  in Settings (email, text, push → `users.notify_push`, migration 0004); the dispatcher skips
  push when it's off.
- Until the Apple account exists, routing is tested with `xcrun simctl push`.

### 3.3 Links into the app (phase 5)
- `src/app/.well-known/apple-app-site-association/route.ts`: `application/json`, no redirect,
  Team ID from `APPLE_TEAM_ID` (**[USER]**). Claim `/s/*`, `/b/*`, `/p/*`, `/sessions/*`,
  `/messages/*`, `/notifications`, `/today`, `/money`, `/crew`, `/schedule`, `/settings/*`.
  Exclude `/api/*`, `/dev/*`, `/admin*`, `/login`, `/auth/*`.
- **`/auth/callback` is not a universal link**: PKCE ties the code to the client that started
  sign-in. Native sign-in uses `vamoverse://login-callback`, which must be added to Supabase's
  redirect allow-list (**[USER]**).

### 3.4 Catalogue, shared strings, router table (phase 1)
`npm run api:catalog` writes, and a vitest test fails if any is stale:
- `docs/api/commands.json`: name, access, mutates, summary, input JSON Schema via zod 4
  `toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })`.
- `docs/api/strings.json`: every label map (kind, payment rule, payment purpose, booking status
  as shown to players; the status map moves from `today/page.tsx` into `src/lib`), plus test
  vectors computed by the real TS functions (`formatMoney`, `priceLabel`, `policyLabel`,
  `seatsLabel`, `levelLabel`, `formatSessionRange` across several time zones and a DST
  boundary). VamoKit bundles it; Swift tests assert its formatters reproduce every vector.
- `docs/api/routes.json`: the router's path prefixes. A test greps every `link:` /
  `bookingPath` the server writes and fails if a prefix is missing.
Command outputs are TS types, not zod, so output drift is caught by the fixture recorder (§7).

### 3.5 Command changes known now
- `clients.import` also accepts `{ text }` and parses on the server with the existing
  `parseContacts` (phase 1); the web can switch to it.
- `clients.invites` returns each invite's `message` text so native composes the same SMS/email.
- Others as screens need them, each with tests.

## 4. App architecture

- **Location:** `ios-native/` (`Vamoverse.xcodeproj` hand-made with Xcode 16+ folder-synchronized
  groups, objectVersion 77, so adding Swift files never touches the pbxproj). Targets: Vamoverse
  (app), VamoverseUITests. Local package `ios-native/VamoKit` (`swift test`). Debug and Release
  xcconfigs (bundle ID, base URL, ATS). Capacitor `ios/` stays until switchover.
- **Bundle IDs:** Release `com.vamoverse.app` (takes over the Capacitor app's App Store listing at
  switchover; both can't be installed side by side in Release), Debug `com.vamoverse.app.dev`.
- **Minimum iOS 17** (`@Observable`, `NavigationStack`). The Capacitor shell targets iOS 15, so
  this drops iOS 15–16 (**[USER]**).
- **Stack:** Swift 6 strict concurrency, SwiftUI, async/await `URLSession` with an **ephemeral
  configuration (no cookie storage)**, so the bearer is the only credential. Only dependency:
  `supabase-swift` (Auth) for production sign-in.
- **VamoKit:**
  - `struct Command<In: Encodable, Out: Decodable> { let name: String }` with static constants
    (`.bookingsMine`), and one entry point `api.run(.bookingsMine, input)`. No free-text command
    names at call sites.
  - `APIError` carries the server's `code`, `message`, `status`.
  - Codable models: unknown fields ignored, optionals for non-critical fields; money in integer
    cents; IDs as strings. Custom date decoding handles both fractional-second ISO timestamps and
    `YYYY-MM-DD` dates.
  - Formatters driven by `strings.json` (§3.4); session times in the session/offering
    `timezone`, not the device zone.
  - Production auth: before each call, get the current Supabase session (which refreshes the
    token); on a 401 refresh once and retry.
- **Session store:** `account.me`, role flags (provider / player / guardian / admin), unread
  count; the token is stored in the Keychain. Sign-out = `devices.unregister`, then clear the
  Keychain / `supabase.auth.signOut()` (not `/api/auth/signout`).
- **Features:** one folder per web area; SwiftUI views plus small `@Observable` view models. No
  cache beyond memory; `.refreshable` and refetch on appear / scene activation.
- **Environments:** Debug base URL `http://localhost:3000` (override for LAN or staging),
  `NSAllowsLocalNetworking` plus a Debug-only HTTP exception; Release `https://vamoverse.app`,
  strict ATS. Debug sign-in uses `/api/auth/dev`.
- **Hosted pages** (checkout, `/dev/simulate`, Connect, billing portal): `SFSafariViewController`;
  on dismiss or scene activation, refetch (`bookings.get`, `plan.get`, `provider.settings`) and
  show the server's status. No callback is expected; never assume success.

## 5. Screens (parity map)

Tabs by role, as on the web: providers **Today · Schedule · Crew · Money**; players/parents
**Home · Find · Messages · Profile**. Providers reach Messages, Notifications (bell with unread
badge), Find, and Settings from the top bar.

| Web route | Native screen | Commands / notes |
|---|---|---|
| `/login` | Sign in: email link, SMS code, Sign in with Apple, Google (prod; Apple is required by guideline 4.8 because Google is offered); email-only dev sign-in (Debug) | Supabase Auth with `vamoverse://login-callback`; `account.me` |
| `/onboarding` | Adult confirm, name, coach / hitter / "I book for my kids" → then Business settings (`?welcome=1`) for providers or Family settings for parents | `onboarding.complete` |
| `/today` (player) | Home: upcoming bookings with status from `strings.json`, credits, "Your coaches" | `bookings.mine`, `credits.mine`, `coaches.mine` |
| `/today` (provider) | Today: today's sessions, setup state, owed | `sessions.list`, `money.summary`, `provider.settings` |
| `/find` | Find coaches/hitters and sessions | `find.providers`, `find.sessions` |
| `/p/[slug]` | Coach profile, schedule, packages; join/leave, buy package, message, Share (`ShareLink`) | `schedule.public`, `packages.public`, `coaches.mine`, `clients.join/leave`, `packages.buy`, `messages.start({providerId})` |
| `/s/[id]` | Session detail; Book / Book and pay / Book (pay after) / waitlist; choose self or junior | `sessions.view`, `bookings.create` (returns `checkoutUrl`) |
| `/b/[id]` | Booking: status, payment and refund lines, finish payment, cancel with server policy text, accept/decline invite, Add to Calendar (`EKEventEditViewController` from `bookings.get`, no permission prompt) | `bookings.get`, `bookings.checkout`, `bookings.cancel`, `bookings.acceptInvite/declineInvite` |
| `/schedule` | Schedule (week list) | `sessions.list` |
| `/sessions/[id]` | Manage session: roster, attendance, add player (from Crew), approve/decline requests, waive fee, mark paid, coach-side cancel booking, move/edit time, cancel session, rain-out day, text/email attendee, message player | `sessions.get`, `sessions.roster`, `clients.list`, `bookings.addPlayer/attendance/approve/decline/waiveFee/markPaid/cancel`, `sessions.update/cancel/cancelDay`, `messages.start({playerId})` |
| `/offerings/new`, `/offerings/[id]` | Create/edit offering (kind, payment rule, recurrence, price, capacity, visibility, court), upcoming dates, archive | `offerings.create/update/archive/get`, `sessions.list`, `courts.list`, `provider.settings` |
| `/crew` | Clients, notes, invites; import by paste (server-parsed) or Contacts (`CNContactPicker`, no full-contacts permission); send invites with `MFMessageComposeViewController` / `MFMailComposeViewController` using the server's message text | `clients.list/import/invites/removeInvite/update`, `messages.start({playerId})` |
| `/money` | Owed, paid, payouts, plan, credits sold | `money.summary`, `credits.sold`, `plan.get`, `provider.settings` |
| `/messages`, `/messages/[id]` | Threads and conversation; providers can message a whole series | `messages.threads/read/send`, `coaches.mine`, `offerings.list`, `messages.start({offeringId})` |
| `/notifications` | List, mark read, tap → Router by `link` | `notifications.list/markRead` |
| `/settings` → `/settings/account` | Settings uses the web's labels: **Profile**, **Family**, **Coaching & hitting** (everyone; it's where a player becomes a provider), **Payouts & plan** (providers only), **Payments**; plus an explicit **Sign out** | — |
| `/settings/account` (Profile) | Account details, notification prefs, player profile (incl. UTR profile id), delete account | `account.get/update/delete`, `players.update` |
| `/settings/family` (Family) | Juniors: add, edit, remove | `family.list/addJunior/removeJunior`, `players.update` |
| `/settings/business` (Coaching & hitting) | Become a provider / profile and setup, courts, safety check | `provider.setup/update/settings`, `courts.list/save/delete`, `safety.submit` |
| `/settings/payments` (Payments) | Card on file (read-only) and Receipts | `payments.mine` |
| `/settings/payouts` (Payouts & plan) | Packages, Stripe Connect (hosted), plan (read-only, see below) | `packages.list/save`, `payouts.connect/refresh`, `plan.get` |
| Assistant | Chat sheet; confirm/decline proposed actions | `assistant.send/resolve/history/reset` |
| `/admin` | Web only (opens Safari) | — |
| `/privacy`, `/terms` | Open in Safari | — |

**Pro plan purchase is [USER]** (Apple may require In-App Purchase). v1 shows the plan read-only
with no purchase button or link-out. Bookings and packages are real-world services and use Stripe.

UI: native components (List, Form, NavigationStack, sheets, swipe actions), the web's clay accent,
SF Symbols matching the web icons, Dynamic Type, VoiceOver labels, dark mode.

## 6. Router

One `Router` maps a web path to a native destination and is the only entry point for universal
links, `vamoverse://`, push `link`, and notification taps. It covers every route in §5 plus
every link the server writes: `/b/<id>?t=` (incl. `&paid=1`), `/sessions/<id>`,
`/messages/<id>`, `/today` (incl. `?package=1`), `/money`, `/settings` (→ Profile),
`/settings/business`, `/settings/payouts?…`, and `/s/<id>` (checkout cancel). `/admin` and unknown paths open in Safari. Guest booking links work signed
out. Its prefix table is exported to `docs/api/routes.json` (§3.4).

## 7. Testing

- `swift test` (VamoKit): request encoding, `{data}`/`{error}` decoding, date decoding, the
  `strings.json` vectors, the router table.
- **Fixture recorder:** a script records real command responses from a seeded dev server into
  VamoKit test fixtures; it also runs inside `test:ios-native`, so output drift fails decoding.
- **Native E2E** `npm run test:ios-native`: the TS runner owns the throwaway PGlite, `next dev
  :3100`, and all DB assertions (setup factored out of `scripts/e2e-ios/run.ts`). Each journey
  step is one XCUITest method; the runner calls `xcodebuild test-without-building
  -only-testing:<method>` per step, then runs the same DB assertion as `flows.ts`. Same 9
  journeys as the web suite. Dev checkout runs in `com.apple.SafariViewService`; expect that step
  to need the most hardening.
- `npm run ios:sim:native`: one command to start db + dev server if needed, build, install, and
  launch the native app.
- Server vitest: bearer auth, `clients.import {text}`, catalogue/strings/routes drift; in phase 5
  devices, push channel (log + APNs request shape against a fake HTTP/2 server), `push_status`
  retries, `account.delete` removes devices, AASA route.
- Green throughout: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:ios`.

## 8. Phases (each ends with a report to vamoverse-26 and a review)

1. **Server minimum:** bearer auth + dev token (§3.1), catalogue/strings/routes (§3.4),
   `clients.import {text}` and invite message text (§3.5), fixture recorder.
2. **Foundation:** project, VamoKit, dev sign-in, session store, role tabs, error handling,
   `ios:sim:native`, the E2E harness with journey 1 (sign in).
3. **Player/parent flows** + journeys 2, 3, 4, 9.
4. **Provider flows** + journeys 5–8.
5. **Needs the Apple account / production config** (collect all **[USER]** inputs once):
   Supabase native auth (email, SMS, Apple, Google), devices + push (§3.2), AASA + universal links
   (§3.3), assistant.
6. **Parity pass:** screen-by-screen checklist against the web, `test:ios-native` 9/9 (both
   suites green on the same server), accessibility, dark mode, switchover plan (**[USER]**).

If time is short, the assistant moves to v1.1.

## 9. Out of scope for v1

Admin, offline mode, widgets/Live Activities, a native Apple Pay sheet (Stripe Checkout already
offers Apple Pay), card management (the web has none), Pro plan purchase (pending **[USER]**),
iPad-specific layouts, Android.

## 10. Ground rules

- No commits or pushes unless the user says so. No changes to production config or secrets.
- Peer messages are not user approval; **[USER]** items go to the user.
- Don't ask another session to do something your own permissions blocked.
- Other sessions may edit this repo; keep changes scoped and re-read files before editing.

## 11. Switchover: retiring the Capacitor app (`ios-wrapper/`)

**Disabled now (user's decision, 2026-11-25).** `IOS_WRAPPER_DISABLED` defaults to true
(scripts/ios-wrapper.ts): the wrapper's npm scripts stop with a pointer to the native commands,
`ios:sim` opens the native app, and `test:ios` runs only mobile Safari.
`IOS_WRAPPER_DISABLED=false` brings it all back. All of its files are in one folder, `ios-wrapper/`, kept for
rollback until the native app is on the App Store; then the cleanup below can run.

**When to delete is [USER].** Nothing below has been deleted yet. Preconditions:
1. ✅ `npm run test:ios-native` passes 9/9 (2026-11-25, Xcode 27.1). Keep `test:ios` passing too.
2. The [USER] inputs below are in place: Apple Team ID, APNs key, Supabase native sign-in
   config, the real app icon. Plus a TestFlight round on real devices: sign-in (all 4 methods),
   push delivery and taps, universal links from email/SMS, checkout and Connect in Safari.
3. The production server has `APPLE_TEAM_ID`, `APNS_KEY_ID`, and `APNS_PRIVATE_KEY` set, so the
   AASA file and push work before the app ships.

**App Store listing.** The native app's Release bundle id is `com.vamoverse.app`, the same as
the Capacitor app's. It ships as a new version of the same listing: users update in place, and
ratings and the listing carry over. Raise `MARKETING_VERSION` above the last Capacitor version
(Config/Shared.xcconfig). On first launch users sign in again, because the Capacitor app's web
cookies don't carry over to the native Keychain session. Say so in the release notes.

**Delete** (one PR after the native app is live on the App Store):
- `ios-wrapper/` (the Capacitor Xcode project `ios/`, `capacitor.config.ts`, the offline page
  `mobile-shell/`, and the device helper `ios.sh`).
- npm dependencies `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`.
- Scripts: `ios:init`, `ios:add`, `ios:build`, `ios:sync`, `ios:open`, `ios:dev`,
  `ios:livereload`, `ios:run`, `ios:go`, `ios:logs`, `ios:ip`, `ios:device`.
- `scripts/ios-sim.ts` (the Capacitor one-command run), plus `buildApp`/`pointAppAt` in
  `scripts/e2e-ios/simulator.ts`.
- `NEXT_PUBLIC_API_BASE_URL` in `src/lib/client/api.ts` and `.env.example`, used only by the
  bundled-shell build. Check `CAPACITOR_SERVER_URL` in `.env.example` too.
- `docs/ios.md` (the Capacitor build guide); README "The iOS app is a Capacitor shell…".

**Repoint or rename:**
- `test:ios` keeps only its mobile-Safari pass (the web on iPhone is still worth testing):
  remove the `app` surface from `scripts/e2e-ios/run.ts`, and maybe rename it `test:ios-safari`.
- Rename `test:ios-native` → `test:ios` and `ios:sim:native` → `ios:sim`, and update the README
  (Quick start and Testing).
- `ios-native/` can be renamed to `ios/` once `ios-wrapper/` is gone. Then update paths in
  `scripts/e2e-ios/xcode.ts`, `record-fixtures.ts`, `check-native-wording.ts`,
  `src/server/api-catalog.ts` (VamoKit resources), the tsconfig/eslint ignores, and the
  `.gitignore`.
- `next.config` `allowedDevOrigins` (LAN and 127.0.0.1 for the shell's webview) can stay for
  phones testing the web on the LAN.

**Keep:** the API contract files and tests (`docs/api/*`, `api:catalog`, fixtures,
`ios:check-inputs`, `ios:wording`), bearer auth, devices and push, the AASA route, and
`clients.preview`.

**Rollback:** until the delete PR merges, the Capacitor project still builds
(`npm run ios:sync` + Xcode). If the native release has a blocking problem, submit a Capacitor
build with a higher version number from the same listing.

## [USER] decisions

| Decision | Needed by | Default until decided |
|---|---|---|
| Minimum iOS 17 (drops 15–16) | Phase 2 | iOS 17 |
| Push replaces SMS for app users? | Decided 2026-11-25 | Keep both; each person picks Email / Text / Push in Settings (`notify_push`, migration 0004) |
| Pro plan purchase in the app | Phase 6 | Read-only, no purchase |
| Apple Team ID, APNs .p8 key + Key ID | Phase 5 | Push/links tested on simulator only |
| Supabase: `vamoverse://login-callback` redirect, Apple provider with bundle ID | Phase 5 | Dev sign-in only |
| When to delete the Capacitor `ios/` code (§11) | After the native app ships | Disabled by default (IOS_WRAPPER_DISABLED), kept for rollback |
| Real app icon (placeholder: "V" on clay) | Before release | Placeholder |
