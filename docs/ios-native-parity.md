# Native iOS app ↔ web parity checklist

Status at the end of phase 6 (2026-11-25). One row per web route or shared component: the
native screen, the commands both use, wording differences, and gaps.

How this was built:
- Every web page and client component was read while building its native screen (phases 3–5).
  The Swift screens port their structure and wording directly.
- `npm run ios:wording` extracts the visible text from the web pages and lists any string that
  doesn't appear in the Swift code. All 16 strings it reports today are covered in
  [Expected wording differences](#expected-wording-differences).
- `npm run ios:check-inputs` checks every input the app sends against the server's zod schemas
  (51 inputs). `swift test` decodes real recorded responses for 29 commands.
- Labels, statuses, and formatted money and dates come from `strings.json`, which is generated
  from the web's own code. Swift reproduces every formatter vector.

Legend: ✅ same · ⚠️ difference (justified) · ⛔ gap (not in the app yet)

## Screens

| Web route / component | Native screen | Commands | Wording | Gaps / notes |
|---|---|---|---|---|
| `/` (landing) | none (the app opens Home or Sign in) | none | n/a | ⚠️ Marketing page. Its Terms and Privacy links are in the app's Settings and on Sign in. |
| `/login` (dev) | SignInView (Debug) | `/api/auth/dev`, `account.me` | ✅ | Plus "Server: …" in small print (Debug only). |
| `/login` (Supabase) | SignInView (Release) | Supabase Auth | ✅ except native Sign in with Apple (system button: "Continue with Apple") | ⛔ Unverified until the Supabase project is configured ([USER]). The web's "That sign-in link expired" becomes Supabase's own error text. |
| `/auth/callback` | `vamoverse://login-callback` | Supabase `session(from:)` | n/a | Not a universal link: PKCE ties the code to the client that started sign-in. |
| `/onboarding` | OnboardingScreen | `onboarding.complete` | ✅ | ⚠️ The `next` parameter is ignored (the app opens Business, Family, or Home as the web does). |
| `/today` (player) | HomeScreen | `bookings.mine`, `credits.mine`, `coaches.mine` | ✅ status badges from strings.json | |
| `/today` (provider) | ProviderTodayScreen | `sessions.list`, `money.summary`, `provider.settings`, `bookings.mine`, `credits.mine` | ✅ | Needs you / Coming up / own bookings / package credits. |
| `/find` | FindScreen | `find.providers`, `find.sessions` | ✅ | ⚠️ The type filter is a segmented control (same labels). |
| `/p/[slug]` | ProviderScreen | `schedule.public`, `packages.public`, `coaches.mine`, `clients.join/leave`, `packages.buy`, `messages.start` | ✅ | ⚠️ Share is an icon button (VoiceOver label "Share"). Package checkout opens in Safari. |
| `/s/[id]` | SessionScreen + BookPanel | `sessions.view`, `bookings.create` | ✅ | ⛔ Guest booking without an account (name/email/mobile form) is web-only; the app needs sign-in. ⚠️ After checkout the app shows the booking itself, not the web's `?cancelled=1` banner. |
| `/b/[id]` | BookingScreen | `bookings.get` (with the server `headline`), `bookings.checkout/cancel/acceptInvite/declineInvite` | ✅ the headline comes from the server | ⚠️ Add to calendar uses Apple's event editor instead of the `.ics` download. ⚠️ After checkout: "Checking your payment…" (see below). Works signed out from a `/b/<id>?t=` link (vamoverse:// now; universal links need the Apple setup). |
| `/schedule` | ScheduleScreen | `sessions.list`, `offerings.list` | ✅ | |
| `/sessions/[id]` | ManageSessionScreen | `sessions.get/roster/update/cancel/cancelDay`, `clients.list`, `bookings.addPlayer/approve/decline/attendance/waiveFee/markPaid/cancel`, `messages.start` | ✅ all confirms and alerts | ⚠️ Native date/time pickers in the session's time zone, plus minute/spot steppers instead of number fields. |
| `/offerings/new`, `/offerings/[id]` | NewOfferingScreen, OfferingScreen + OfferingForm | `offerings.create/update/archive/get`, `courts.list`, `provider.settings`, `sessions.list` | ✅ | ⚠️ Weekday chips, native pickers. "Ends (optional)" is a toggle plus a date. |
| `/crew` | CrewScreen | `clients.list/preview/import/invites/removeInvite/update`, `provider.settings`, `messages.start` | ✅ | The "N ready to add" preview comes from the server (`clients.preview`, the same parser; the web parses locally, see below). Contacts picker added. Invites use Messages/Mail with the server's text (sms:/mailto: on the simulator). |
| `/money` | MoneyScreen | `money.summary`, `provider.settings`, `plan.get`, `credits.sold` | ✅ | Tiles stack in one column at accessibility text sizes. |
| `/messages` | MessagesScreen | `messages.threads/start`, `coaches.mine`, `offerings.list` | ✅ | "Message a whole series" (providers) and "Message a coach". |
| `/messages/[id]` | ConversationScreen | `messages.read/send` | ✅ | Polls every 5 seconds, as the web does. |
| `/notifications` | NotificationsScreen | `notifications.list/markRead` | ✅ | Plus "Turn on notifications" (push). A tap opens the link through AppLink. |
| `/settings` | SettingsScreen (Profile tab, or the gear for providers) | none | ✅ settings-nav labels | Plus Sign out (the web's mobile layout has none), Terms, Privacy. |
| `/settings/account` | AccountScreen | `account.get/update/delete`, `family.list`, `players.update` | ✅ | Notification channels: Email, Text message, Push notifications (both web and app). ⚠️ Delete asks for "DELETE" in an alert with a text field (the web uses `window.prompt`). |
| `/settings/family` | FamilyScreen | `family.list/addJunior/removeJunior`, `players.update` | ✅ | |
| `/settings/business` | BusinessScreen | `provider.setup/update/settings`, `courts.list/save/delete`, `safety.submit` | ✅ | |
| `/settings/payments` | PaymentsScreen | `payments.mine` | ✅ | |
| `/settings/payouts` | PayoutsScreen | `provider.settings`, `payouts.connect/refresh`, `plan.get`, `packages.list/save` | ✅ except the plan buttons | ⚠️ The plan is read-only: no "Switch to Pro" / "Manage or cancel Pro" and no web pointer, until the [USER] decision on In-App Purchase. Connect opens in Safari; the app refreshes the status on return. |
| Assistant panel | AssistantSheet | `assistant.history/send/resolve/reset` | ✅ | ⛔ A live conversation needs `ANTHROPIC_API_KEY` ([USER]); the UI was checked against real history data. The web's screen-reader description is the composer's VoiceOver hint. |
| `/admin` | none (opens on the web) | none | n/a | Web-only by design. |
| `/privacy`, `/terms` | Links in Settings and Sign in | none | ✅ | Open in Safari. |
| `/dev/simulate` | Hosted page (Safari) | none | n/a | Dev payments only. |

## Cross-cutting

| Area | Native | Notes |
|---|---|---|
| Navigation shell | Tabs by role (AppShell.tsx) | ✅ Today · Schedule · Crew · Money / Home · Find · Messages · Profile. The top bar has Messages, bell, and gear for providers, the bell for players, and sparkles when the assistant is enabled. |
| Errors | Toast with the server's message verbatim; full-screen "Try again" on load failures | ✅ The web's fallback "Something went wrong." |
| Sign-in | Dev (Debug) / Supabase (Release) | Token in the Keychain (this device only); one 401 refresh and retry. |
| Push notifications | APNs; tap → link | ✅ Push is sent alongside email and SMS (user's decision: keep both). Each person picks their channels in Settings → Profile → Account: Email, Text message, Push notifications (`notify_push`; on the web too). The app's switch explains when iOS has notifications off and links to iOS Settings. |
| Links | vamoverse://, universal links (Release), notification taps | Universal links need APPLE_TEAM_ID and the Associated Domains capability ([USER]). |
| Dynamic Type | Checked at accessibility XXXL | Text wraps; session rows, provider cards, and Money tiles stack at accessibility sizes; primary actions stay reachable by scrolling. |
| VoiceOver | Every icon-only button has a label | Bell ("Notifications, N unread"), Messages, Settings, Share, Send, the assistant, New conversation, Message <name>. |
| Dark mode | System colors throughout | Clay on dark is about 5.6:1. With Increase Contrast the accent shifts to #B4482B (light, 5.4:1) or #F08A6C (dark, 8.6:1). Normal light mode keeps the web's #D95D39 (about 3.8:1 on white, the same as the web). |
| App icon | Placeholder: white "V" on clay (the web's logo mark) | [USER]: replace with the real 1024×1024 icon. |

## Expected wording differences

What `npm run ios:wording` reports, and why each is fine:

| Web string | Why it's not in the app |
|---|---|
| "Search students" | The web's screen-reader label for its search box; the native search field announces its prompt "Search by name" (the same as the web placeholder). |
| "Switch to Pro", "Manage or cancel Pro", "Switch any time. Card processing fees apply on both plans.", "You’re on Pro. No more per-payment platform fees." | The Pro plan is read-only in the app until the [USER] decision on In-App Purchase. |
| "Payment received. Confirming your spot… refresh in a moment." | The web shows it only when Stripe redirects back with `?paid=1`. The app can't tell a completed checkout from a closed one, so it shows "Checking your payment…" while it asks the server, and then shows the server's headline. |
| "Payment was cancelled. Your spot is held for a few minutes; book again to finish." | The web's `?cancelled=1` banner. The app shows the booking instead ("Finish paying to confirm · held until …" with "Pay to confirm"). |
| "No account needed.", "Mobile (for reminders)" | The signed-out guest booking form (web-only). |
| "Continue with Apple" | The app uses Apple's own Sign in with Apple button, which renders this text itself. |
| "That sign-in link expired. Request a new one." | The web's `?error` banner from its callback route; the app shows Supabase's error message. |
| "Find a tennis coach…", "Sign in · Vamoverse", "Welcome · Vamoverse", "Vamoverse home" | HTML page titles and an aria-label for the web logo. |
| "Promise" | A code fragment the extractor picks up from a TypeScript generic, not UI text. |

## Remaining gaps (not built)

1. Guest booking without an account on `/s/[id]` (the web's name/email/mobile form).
2. Everything that needs [USER] accounts or decisions (the consolidated list is in the phase 6 report and in `docs/ios-native-spec.md` §11): Supabase sign-in, APNs, universal links, the live assistant, Pro purchase, the real app icon.
3. XCUITest journeys 1–9 have not run yet. They need the user's Terminal run, because XCTest can't connect from the agent sandbox.
