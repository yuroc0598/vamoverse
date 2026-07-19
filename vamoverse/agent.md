# Vamoverse - Product Requirements & Build Spec
> **Source of Truth for AI Builders** - Last updated: 2026-05-13

## 1. Brand & Identity

**Product Name:** Vamoverse
**AI Agent Name:** Vamos
**Tagline:** Vamos Together. / Serious Play. One Crew.
**Domain Strategy:** MVP uses `getvamoverse.com` / `vamoverse.app`, acquire `vamoverse.com` later.
**Vibe:** For serious amateur/club players, both junior and adult learners, willing to pay. Not country-club stuffy, not childish. Athletic, coached, community-driven. Think Strava + Calendly for tennis.

**Brand Story:** Vamos = "Let's Go" in Spanish - the most yelled phrase on tennis courts (Nadal, Alcaraz) and soccer fields. Verse = Universe. Vamoverse = The universe where you always have a crew to rally with.

**Agent Naming Rationale:** Chose `Vamos` over `Amo` (sounds like Ammo, means boss/master in Spanish), `Vamo` (slang misspelling). Vamos is correct, chantable, voice-friendly (V-fricative wake word "Hey Vamos"), expands beyond tennis to Padel/Soccer/Pickleball.

## 2. Vision & Business Model

**Vision:** The OS for the independent coach and their community. Coach saves 10hrs/week on scheduling/payments/matchmaking, students get steady play.

**Market:** US only for V1. Independent tennis coaches to start.
**Buyer:** Coach pays SaaS. Students free.
  - Starter: $49/mo, up to 50 students, 5% transaction fee
  - Pro: $99/mo, up to 200 students, 2.5% fee, Vamos advanced
**Revenue Streams:**
1. SaaS subscription from coach
2. Transaction fee on Paid Events and Lesson Auto-Pay (Stripe Connect)
3. Future: Package/credit upsell

**Platforms:** Mobile-first but functional parity. One codebase: Next.js web app + Capacitor wrapper for iOS/Android. Web and mobile are same features, just responsive.

**Court Booking:** OUT OF SCOPE V1. Coaches provide location info via Google Places pin + text notes. No inventory management.

## 3. Personas

### Coach Alex - Independent Pro (BUYER)
- 30-60 active students, USPTA certified
- Pain: Scheduling hell, no-show collections, finding 4th for doubles, WhatsApp chaos
- Goals: Fill clinics, get paid automatically, retain students

### Adult Learner Maya - Serious Club Player
- UTR 4.5 / NTRP 3.5, plays 2x/week, pays $35-50/group clinic
- Pain: Group level mismatch, can't find even doubles, last-minute cancels
- Goals: Steady group at her level, occasional matches, track rating

### Junior Parent Dave - Family Manager
- Manages 2 juniors (U14, U12)
- Pain: Payment visibility, calendar chaos, safety concerns
- Goals: One dashboard for pay/schedule, audit chat

## 4. Core Modules

### 4.1 Identity & Profiles

**Coach Profile:**
- Required: Name, avatar, bio, home base city, home courts (places), phone, languages
- Credentials: USPTA/USPTR/PTR level, certification years, specializations [High-Performance Junior, Adult Development, Beginner, Wheelchair, Performance], coaching philosophy video URL
- Rate Card: Private $/hr, Semi-Private $/person/hr (2-4 players), Group $/person/session, Policy: cancellation hours (default 24h), late fee, no-show fee
- Stats: #students, avg rating, years coaching, reviews (1-5 stars + text)
- Verification: Email + phone, credential optional verify

**Student Profile:**
- Required: Name, avatar, adult/junior flag, goals [Fun Fitness, League Prep, Tournament, Social]
- Tennis Identity: NTRP 1.0-7.0 self-rated dropdown, UTR Singles 1.0-10.00 manual, UTR Doubles 1.0-10.00 manual, WTN 40-1 optional, tags [Self-reported | Unverified] for V1, Hand [R/L], Play Style [Baseliner, All-Court, Serve & Volley], UTR reliability note
- Availability Template: Weekly blocks (e.g., Mon 4-7pm, Sat 8am-12pm)
- Level: If rating empty, allow "Unrated + Self Assessment: Beginner/Intermediate/Advanced"
- Medical Notes private to coach

**Parent-Linked Account - REVISED per Review C4/C5:**
- If student DOB <18, account MUST be created by parent or linked - ENFORCED SERVER-SIDE, fail closed if DOB missing (not optional banner)
- DOB required for student role - if not provided, registration blocked (fix fail-open)
- parental_consents table REQUIRED: (id, parent_id, child_id, consent_at, method [email_verified, credit_card, government_id], ip, created_at) - COPPA verifiable consent
- Parent has separate login seeing: payment history, calendar, chat audit (read-only CC on all U18 chats) - audit must include group chats (fix M3) via membership not receiver_id
- Student U13: COPPA - No private student-student DM without parent consent, parent is primary contact, no targeted ads, data deletion allowed
- Roles: server-authoritative, not client-selectable. User cannot self-promote to coach by editing users.role - RLS forbids self-update, server action sets role, coach needs Stripe Connect KYC + verification before charging (fix C5)
- Data Model: `users` table with `role: coach | student | parent`, `parent_id` FK for junior, `dob` NOT NULL for students

**Reviews:**
- Only students with completed session can review coach. 1-5 + text.

### 4.2 Scheduling & Session Engine

**Session Types:**
1. Private Lesson (1:1) - 30/60/90 min
2. Semi-Private (1:2-4) - price per person, auto split
3. Group Clinic (5-12) - capacity, level range filter
4. Evaluation / Tryout - free/paid
5. Camp - multi-day

**Scheduling Logic - REVISED per Review C6,H1,H2:**
- One-off or Recurring: Weekly, Bi-weekly, with exception dates (exdates), blackout dates - store recurrence_rule as {freq, interval, byweekday, until, exdates[], rdates[], timezone} - exdates required per spec
- Timezone: US timezones only BUT store local wall time + IANA zone (e.g., America/Los_Angeles) NOT just UTC timestamptz. Concrete occurrence instances get UTC instants computed in that zone. Fixes DST shift (H1). Add timezone column to events.
- Occurrence Model REQUIRED (C6): Introduce event_occurrences table (id, event_id FK, occurrence_start_at timestamptz, occurrence_end_at, status, capacity_override, created_at). All registrations, completion, payments, chat, reviews reference OCCURRENCE not series template. Generate occurrences server-side, not client-only.
- Capacity: Enforced in DB transaction with row lock: SELECT event row FOR UPDATE, count confirmed registrations, insert or waitlist atomically. Prevent overbooking race (H2). Same for waitlist promotion.
- Level Gating: Optional min/max UTR/NTRP to join, show Good Match / Stretch / Mismatch badge - enforced server-side not just app (C1 defense in depth)
- Location: Required - Google Places search + custom text (e.g., Court 5), store place_id, lat/lng, address string, notes
- Status: Draft / Published / Cancelled / Completed per occurrence
- Notifications (critical): See 4.7 - add dedup key per (user,event,type) + channel delivery tracking (M11)

**Coach Calendar View:** Agenda + Week view, shows all sessions, color by type/status, drag not required V1.

### 4.3 Events & Match Play Engine (Differentiator)

**Coach-Initiated Events:**
- Reuses session model but with Paid Toggle: Free or Paid + Price + Max Capacity + Registration deadline
- Examples: $35 Round Robin, $20 Social Mixer, Free Tryout
- Flow: Student sees feed -> Register -> If Paid, pay at registration to secure spot -> Ticket/confirmation
- Includes Tournament types V1: Round Robin and Single Elimination, Manual bracket entry by coach. Compass Ladder = V2

**Custom Match - Student-Initiated (Core Social Feature):**
- Creator picks:
  - `Discipline`: Enum [Mens Singles, Womens Singles, Mens Doubles, Womens Doubles, Mixed Doubles, Open Singles, Open Doubles, Open Mixed? Keep explicit list]
  - `Format`: Enum [Best of 3 Sets w/ 10pt Match Tiebreak, 8-Game Pro Set, Fast4, Timed 90min]
  - `Scoring System`: [Ad Scoring, No-Ad Scoring]
  - `Level Range`: UTR min-max or NTRP min-max
  - `Date/Time Window`: Proposed time + flexibility +/- 2hrs
  - `Location`: Places pin
  - `Verified for UTR`: Boolean toggle (for tracking, not auto-submit V1)
  - `Visibility`: My Coach Community | Friends Only | Public within radius?
- System Logic:
  - Requires 2 players for Singles, 4 for Doubles to mark as "Ready"
  - Gender Enforcement: Mens Doubles = 4M, Womens Doubles = 4F, Mixed Doubles = 2M/2F enforced
  - For Doubles: Creator can be solo looking for 3, or have partner and looking for opponents (2+2), or have 3 need 1
  - Invite flow: System suggests matching players from user's hitting partners / coach community within level range -> Send invite -> Accept/Decline -> When full, mark Confirmed -> Push notifications
  - Auto-Balance Feature (V1 simple): Calculate combined UTR for Team A vs Team B, show delta, suggest swapping to make even

**Doubles Deep Spec - MUST:**
- Singles = 1v1, Doubles = 2v2, Mixed Doubles = 1M+1F per team
- UI must show 4 avatar slots
- Split-pay logic for paid matches if applicable (optional)

### 4.4 Payments (Stripe Connect)

**Provider:** Stripe Connect Express - each coach is connected merchant, platform takes application fee + SaaS.
**Methods:** Card on file required for auto-pay, Apple Pay / Google Pay in mobile.

**Flows:**
1. **Lesson Auto-Pay:** Coach marks session Completed -> System creates PaymentIntent for amount based on rate card + #players -> 2hr dispute/review window for student (notification) -> Auto-capture. If student disputes, mark as issue for coach.
2. **Event Registration Pay:** Pay at time of registration - immediate capture. If full, refunds not automatic unless coach cancels.
3. **Ad-hoc Charge:** Coach can charge any active student amount + memo (e.g., "Racquet stringing $40")
4. **Semi-Private Split:** Total calculated, divided evenly. Example: $120 semi-private /2 = $60 each. Stored as 2 payment intents.
5. **Policies:** Late Cancel <24h = 50% fee, No-Show = 100% fee (configurable by coach). System checks cancellation time vs policy.

**V2:** Packages (10-pack credits), Subscriptions for juniors.

### 4.5 Social & Chat

**Graph Permissions:**
- `Coach Broadcast Channel`: Coach can post announcements to all his linked students (1:many feed + push)
- `Coach <-> Student DM`: Allowed if student has at least 1 completed or upcoming session with coach
- `Student <-> Student DM`: Only if both accepted "Hitting Partner" request (friend). Like friending.
- `Group Chat`: Auto-created for each Group Clinic / Event / Custom Match (participants only, expires after 48h?)
- `Club Feed`: Activity feed per coach community - posts, match results, rating updates, clinic photos. Like Strava.

**Junior Safety:**
- All messages where participant <18: Parent account is auto CC'd (read-only) or gets audit log
- No Student-Student DM if either <13 without parent approval modal
- Profanity filter basic

**Features:** Text, image, location share. No video call V1.

### 4.6 Rating System Integration - Manual V1

**UI:** In student profile, inputs: USTA NTRP (1.0-7.0 select), UTR Singles (1.00-10.00 input), UTR Doubles (1.00-10.00 input), WTN (40-1). Show badge: `Self-reported | Unverified`.
Store history: When user updates rating, log old/new + date for sparkline.
**Compatibility Logic:**
- Delta UTR <0.5 = Good Match (green)
- 0.5-1.0 = Stretch (yellow)
- >1.0 = Mismatch (red) + warning modal "This group is avg UTR 6, you are 3.5 - you may not be challenged. Join anyway?"
- For group event, compute avg rating of registered players.

**V2:** OAuth MyUTR + MyUSTA sync, verified badge, auto-submit match results to UTR.

### 4.7 Notifications & Vamos Agent

**Notifications Channels:** Push (Expo/FCM), In-App, Email fallback. SMS optional V2 for rain cancellations.

**Trigger Matrix:**
- Student notified: New event published by my coach, Event changed/cancelled, Match invite, Match confirmed, Payment due/captured, Coach message, Waitlist promotion
- Coach notified: Student reschedule request, Student cancels, New registration, Waitlist, Payment failed, New review
- Parent notified: All U18 notifications copied

**AI Agent - Vamos:**
**Role:** Conversational orchestrator that can query data and perform actions via tools.
**Persona:** Best captain - short, decisive, court-aware. Never verbose.
**Tone Examples:**
- Bad: "I understand you'd like to..."
- Good: "Got it. Moving Tue 3pm -> Thu 3pm. Notify Sarah? [Yes] [No]"
**Capabilities V1 - Intent + Tool Mapping:**
1. Scheduling: "Book Joe for Saturday 9am doubles, find 2 players at my level" -> tools: check_availability, find_players_by_UTR, create_custom_match, send_invites
2. Reschedule: "Reschedule all Monday clinics due to rain" -> tools: list_events_by_date, bulk_reschedule, draft_notification
3. Payments: "Who owes me?" "Charge Sarah $30 for strings" -> tools: list_outstanding_payments, create_ad_hoc_charge
4. Info Query: "When is my next lesson? What's Maya's UTR? How many spots left in Thu clinic?"
5. Matchmaking: "I need mixed doubles Tue 7pm, I am UTR 5.1M partner 4.8F" -> find_compatible_opponents

**Tools Spec for Vamos (must implement):**
- `get_user_profile`, `search_players(filters: UTR range, gender, availability, location radius)`
- `list_sessions(date range, coach_id)`, `create_event`, `update_event`, `cancel_event`
- `create_custom_match`, `invite_to_match`, `balance_doubles_teams`
- `create_payment`, `list_payments`
- `send_notification / broadcast`
- `search_events`

**Safety:** All tool actions that mutate (book, charge, cancel) MUST show confirmation summary before execute. No silent charges.

**Multilingual:** Keep English V1 but agent answers "Vamos!" naturally. Future add Spanish UI.

### 4.8 Location
- Google Places API, store place_id, formatted_address, lat/lng, name, notes (Court 5, bring balls)
- No booking integration V1.

## 5. Data Model - SINGLE SOURCE OF TRUTH -> See agent_tracking/02_db_schema_v2.md (N6 fix)

**DEPRECATED - DO NOT USE THIS OLD OVERVIEW - It is intentionally left for history but superseded by V2. Builders MUST read `agent_tracking/02_db_schema_v2.md` which fixes all Critical/High from V1/V2 reviews (RLS, occurrences, invitations, consents, fee model, idempotency, indexes, audit_log).**

Old V1 overview (archived, DO NOT IMPLEMENT):
- users (id, role coach/student/parent/admin, email, dob NOT NULL for students per N9 fix, gender M/F/other/unspecified, parent_id, stripe_customer_id per H8, home_lat/lng)
- coach_profiles (user_id FK, bio, certs, specializations, rate_private/semi/group, cancel_policy, stripe_account_id, stripe_onboarded, verification_status pending/verified per C5, home_courts)
- student_profiles (user_id FK, goals, ntrp 1-7, utr_singles/doubles numeric 1-16.5 per M6, wtn numeric 1-40, hand, play_style, availability_template, medical_notes private) - NO rating_history jsonb, moved to rating_changes table per M5
- parental_consents (parent_id, child_id, consent_at, method email_verified/credit_card/government_id/manual_review per N10, ip) - NEW per C4
- events (id, creator_id NOT NULL per H4 distinct from coach_id nullable SET NULL not CASCADE, type private/semi_private/group_clinic/evaluation/camp/tournament/custom_match/social_mixer canonical per L1, title, discipline mens_singles/womens_singles/mens_doubles/womens_doubles/mixed_doubles/open_singles/open_doubles/open, match_format best_of_3_10pt_tb/pro_set_8_game/fast4/timed_90 + tournament_structure single_elim/round_robin/compass/feed_in/ladder/king_of_court separated per L2, scoring_system ad/no_ad, timezone America/Los_Angeles per H1 fix DST, start_at/end_at, recurrence_rule with exdates/rdates/timezone per C6, location, capacity with CHECK private=1 semi 2-4 group 5-12 per N11, price_cents >=0 single source per M7 not is_paid bool, level_min/max UTR/NTRP per N3 regression fix, verified_for_utr, status)
- event_occurrences (id, event_id FK cascade, occurrence_number, occurrence_start_at/end_at concrete UTC computed in event.timezone, capacity_override, status scheduled/cancelled/completed) - NEW per C6/H1
- event_registrations (id, event_id FK, occurrence_id FK per C6, student_id FK, status invited/pending_accept/registered/waitlisted/cancelled/no_show/completed per H5, team A/B, payment_id FK via ALTER per M8, unique(event_id,occurrence_id,student_id))
- match_invitations (event_id, occurrence_id, inviter_id, invitee_id, status pending/accepted/declined/expired/cancelled, slot_number 1-4, team A/B, expires_at 48h) - NEW per H5
- payments (id, coach_id, student_id, event_id, occurrence_id per C6, registration_id, amount_cents >0 per L4, currency, type lesson_auto/event_registration/adhoc/late_fee/no_show/subscription/package per L1 fix, status pending/requires_capture/captured/failed/refunded/cancelled/requires_action/chargeback_open/chargeback_lost per C3/N5 fix removed disputed, idempotency_key unique per C2, stripe_customer_id per H8, stripe_payment_intent_id/charge_id/transfer_id/payout_id, application_fee_cents per H9, net_to_coach generated, description NOT NULL, internal_review_status hold/disputed_by_student/approved/rejected separate from chargeback per C3, auto_capture_at, last_stripe_event_id for webhook idempotency)
- payouts (coach_id, stripe_payout_id, amount, status) + subscriptions (coach_id, plan starter_49/pro_99, status, stripe_subscription_id) per H9
- connections (requester_id, addressee_id, status pending/accepted/blocked/declined, unique pair) - block semantics per M13: hide profiles + suppress invites both ways
- conversations (id, type dm/group/coach_broadcast, event_id, occurrence_id per C6, coach_id, created/updated) + conversation_members (conversation_id, user_id, role, joined_at, left_at, last_read_at) + messages (conversation_id, sender_id, body, image_url, location_share) - normalized model per M2 fix, not flat messages_v1
- notifications (user_id, type event_published/updated/cancelled/registration_confirmed/waitlist_promoted/reschedule_request/match_invite/match_confirmed/payment_captured/failed/requires_action/new_message/new_review/adhoc_charge/dispute_opened per M11, title, body, payload, dedup_key, channel in_app/push/email/sms, delivered, read, unique(dedup_key,user_id,channel))
- reviews (coach_id, student_id, occurrence_id per M4, registration_id, rating 1-5, body, moderation_status pending/approved/rejected/reported, created/updated) - removed unique(coach_id,student_id) too rigid
- rating_changes (user_id, metric ntrp/utr_singles/utr_doubles/wtn, old/new, source self_reported/coach_suggested/utr_api/admin, verified, changed_at, changed_by) per M5
- audit_log (actor_id, action, entity_type, entity_id, before, after, ip, created_at) per M10/C2
- reports (reporter_id, reported_user_id, reported_message_id, reason, status open/triaging/resolved/dismissed, priority low/normal/high/critical, assignee admin) per M12
- vamos_conversations (user_id, role user/assistant/tool, content, tool_calls, tool_results, pending_action jsonb with expires_at/signature, pending_action_id unique) per H6/H7/M14
- plus parental_consents, etc.

**Key Enums - Canonical per src/lib/types/enums.ts (single source of truth per L1 fix):**
- Discipline: mens_singles, womens_singles, mens_doubles, womens_doubles, mixed_doubles, open_singles, open_doubles, open
- MatchFormat: best_of_3_10pt_tb, pro_set_8_game, fast4, timed_90 (separated from tournament_structure per L2)
- TournamentStructure: single_elim, round_robin, compass, feed_in, ladder, king_of_court
- Scoring: ad, no_ad
- RegistrationStatus: invited, pending_accept, registered, waitlisted, cancelled, no_show, completed
- PaymentType: lesson_auto, event_registration, adhoc, late_fee, no_show, subscription, package
- PaymentStatus: pending, requires_capture, captured, failed, refunded, cancelled, requires_action, chargeback_open, chargeback_lost (disputed removed per N5, internal review separate)
- And others - See enums.ts


## 6. Key User Flows (Happy Path)

**Flow 1 - Coach creates paid group clinic:**
Coach App -> Create Event -> Type: Group Clinic -> Title: Adult 3.5 Clinic -> Discipline: Open Doubles -> Level: UTR 3-5 -> When: Sat 9am recurring weekly -> Capacity 8 -> Paid: $40 -> Location: Fremont Tennis Center Court 3 -> Publish -> System: Push to all linked students within level range -> Students register + pay -> Roster updates.

**Flow 2 - Student finds doubles match via Vamos:**
Maya opens app -> Chat with Vamos: "mixed doubles tomorrow 7pm need 2 more" -> Vamos searches availability + UTR compatibility + hitting partners -> Suggests: "Sarah (UTR 4.8F) free, and 2 opponents UTR 9 combined available. Create?" -> Maya taps Yes -> Vamos creates Custom Match with 4 slots, invites Sarah + opponents -> They accept -> Event confirmed.

**Flow 3 - Auto-pay:**
Coach marks Tue 3pm private with Leo as Completed in app -> System creates $80 paymentIntent for parent Dave's card on file -> In-app + push to Dave: "Lesson completed, $80 will auto-pay in 2h. Dispute?" -> 2h passes -> Capture -> Receipt.

## 7. Permissions Matrix

| Action | Coach | Student | Parent | Vamos (on behalf) | Notes per Review |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Create Paid Event | Y if KYC'd | N | N | Y if coach user + KYC'd | Gate behind Stripe Connect KYC + server role (C5) |
| Register for Paid Event | N | Y | Y for junior | Y scoped to session | Enforce capacity in TX + gender server-side (H2,H3) |
| DM Student | Y if linked | Y if hitting partner | Read audit inc group chats | N | Audit by membership not receiver_id (M3) |
| Charge Ad-hoc | Y with cap | N | N | Y with confirmation server-enforced + idempotency | Amount >0 check + velocity limit + signed pending_action server (C2,H7,L4) |
| Edit Rating | Can suggest, not override | Own only | Own + junior | N | Student-owned rating, coach suggestion goes to audit log (M15) |
| Mark Complete | Y | N | N | Y (coach) | Marks specific occurrence not series (C6) |
| Block User | Y | Y | Y | N | Hide profiles + suppress invites both ways, not just DM (M13) |

## 8. UI/UX Notes

- Mobile-first: Bottom tabs: For Student: [Feed, Schedule, Play (Matches), Messages, Profile] For Coach: [Dashboard, Schedule, Community, Messages, Payments]
- Web parity but table views for coach dashboard
- Cards for events showing: Discipline badge, Level range, Price, Spots left, Location
- Empty states: "No matches at your level - ask Vamos to find one"

## 9. Non-Functional - REVISED per V1 Review C4

- US Only - timezones: America/New_York, Chicago, Denver, Los Angeles - BUT store local wall time + IANA zone per H1, not just UTC (fix)
- COPPA / Minor Safety - MOCK MODE NOT PROD COMPLIANT: Current MVP is COPPA-aware mock, NOT COPPA compliant for production. Prod requires: DOB required (fail closed), parental_consents table (parent_id, child_id, consent_at, method, ip), verifiable parental consent before collecting PII <13, no self-declaration, parent audit includes group chats, data retention policy. See review C4.
- Stripe Connect required for coach payout, but require server-authoritative role + KYC gate before paid events (fix C5)
- Push notifications via Expo Notifications
- Search players: simple radius + UTR range, no vector DB V1
- AI: OpenAI-compatible tool calling, store conversation, confirmation must be server-enforced with signed pending_action_id (fix H7), scoped by session not LLM args (fix H6)
- Build claims: Never claim "COPPA compliant / DONE" for mock - label as MOCK-DONE vs PROD-GATE

## 10. Roadmap

**MVP (Now):** Everything above except bracket auto-gen, packages, calendar sync, video, UTR auto-sync. Manual ratings.

**V2 (Post-MVP):**
- Waitlist auto-backfill AI
- Packages (10-pack), Subscriptions
- Google/Apple Calendar 2-way sync
- Auto bracket generation (Round Robin, Single Elim, Compass, Ladder, King of Court)
- UTR API OAuth + verified match submission
- Video clip upload + AI tagging (future)
- Court booking integration (CourtReserve API)
- Leaderboards + Rating progression charts
- Admin portal for club director (multi-coach)

## 11. Glossary

- NTRP: National Tennis Rating Program 1.0-7.0, USTA adult leagues
- UTR: Universal Tennis Rating 1.0-10+, separate Singles/Doubles, gold standard for matchmaking, reliability % (provisional vs reliable)
- WTN: World Tennis Number 40-1 (inverse), ITF global replacing NTRP
- Discipline: Mens/Womens/Mixed/Open x Singles/Doubles
- No-Ad: At deuce, next point wins game (faster)
- Fast4: First to 4 games, best of 3, tiebreak at 3-3
- Pro Set: 8-game set, first to 8 win by 2
- Deuce: 40-40
- Advantage: After deuce

## 12. What Builders Should Do Next

1. Scaffold Next.js + Tailwind + Supabase + Capacitor + Stripe Connect
2. Implement tables above via Supabase migrations
3. Build auth with roles (coach/student/parent)
4. Implement Events CRUD + Registration + Capacity + Gender enforcement logic
5. Implement Payments: Stripe Connect Express onboarding + PaymentIntents + Auto-pay timer (cron or delayed job)
6. Implement Chat: Supabase Realtime for messages, permission checks
7. Implement Vamos: System prompt = "You are Vamos, Vamoverse's assistant. Short, decisive, court-aware. You never hallucinate UTR, you query tools. Always confirm before charging/booking." Wire tool calling to above tools.
8. Seed data: 1 coach, 10 students across UTR 2-6, mixed genders, 2 juniors with parent.

---
**Brand Colors Suggestion (not final):** Clay #D95D39, Hard Court Blue #2A4B8D, Ball Yellow #DFFF00 accent, Off-White #FAF9F6 background, Ink #111827 text.

**Tone:** Never say "our platform". Say "your crew". Use tennis verbs: rally, serve, ace, advantage.
