-- Vamoverse schema. Applied by src/server/migrate.ts (tracked in schema_migrations).
-- Conventions: text ids with a type prefix (usr_, ply_, pro_, ...), timestamptz for
-- instants, local wall time + IANA zone for anything a person schedules.

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                  text PRIMARY KEY,               -- auth provider user id
  email               text,
  phone               text,
  display_name        text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  avatar_url          text,
  is_admin            boolean NOT NULL DEFAULT false,
  adult_confirmed_at  timestamptz,                    -- self-signup is adults only
  onboarded_at        timestamptz,
  notify_email        boolean NOT NULL DEFAULT true,
  notify_sms          boolean NOT NULL DEFAULT true,
  stripe_customer_id  text UNIQUE,
  assistant_reset_at  timestamptz,                    -- "new conversation" in the assistant
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_unique ON users (phone) WHERE phone IS NOT NULL;

-- A person who plays. Adults own their profile (user_id); juniors are managed by a
-- guardian (guardian_user_id) and never have their own login.
CREATE TABLE players (
  id                text PRIMARY KEY,
  user_id           text UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  guardian_user_id  text REFERENCES users(id) ON DELETE CASCADE,
  display_name      text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  birth_date        date,
  gender            text CHECK (gender IN ('male','female','nonbinary')),
  utr_singles       numeric(4,2) CHECK (utr_singles BETWEEN 1 AND 16.5),
  utr_doubles       numeric(4,2) CHECK (utr_doubles BETWEEN 1 AND 16.5),
  ntrp              numeric(2,1) CHECK (ntrp BETWEEN 1 AND 7),
  wtn               numeric(4,1) CHECK (wtn BETWEEN 1 AND 40),
  utr_profile_id    text CHECK (utr_profile_id ~ '^[0-9]{1,12}$'),   -- self-reported, not unique
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (guardian_user_id IS NULL)),
  CHECK (guardian_user_id IS NULL OR birth_date IS NOT NULL)
);
CREATE INDEX players_guardian_idx ON players (guardian_user_id) WHERE guardian_user_id IS NOT NULL;

CREATE TABLE guardian_consents (
  id                text PRIMARY KEY,
  player_id         text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  guardian_user_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature_name    text NOT NULL,
  ip                text,
  attested_at       timestamptz NOT NULL DEFAULT now(),
  verified_at       timestamptz,          -- set by a card payment from the guardian
  verified_payment_id text,
  revoked_at        timestamptz
);
CREATE UNIQUE INDEX guardian_consents_active ON guardian_consents (player_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Providers: coaches and paid hitters (one profile, offering flags)
-- ---------------------------------------------------------------------------
CREATE TABLE providers (
  id                     text PRIMARY KEY,
  user_id                text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug                   text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  offers_coaching        boolean NOT NULL DEFAULT false,
  offers_hitting         boolean NOT NULL DEFAULT false,
  headline               text CHECK (length(headline) <= 120),
  bio                    text CHECK (length(bio) <= 2000),
  home_area              text CHECK (length(home_area) <= 120),
  timezone               text NOT NULL DEFAULT 'America/Los_Angeles',
  rate_private_cents     int CHECK (rate_private_cents >= 0),
  rate_semi_private_cents int CHECK (rate_semi_private_cents >= 0),
  rate_group_cents       int CHECK (rate_group_cents >= 0),
  rate_hitting_cents     int CHECK (rate_hitting_cents >= 0),
  cancel_window_hours    int NOT NULL DEFAULT 24 CHECK (cancel_window_hours BETWEEN 0 AND 168),
  late_cancel_fee_pct    int NOT NULL DEFAULT 50 CHECK (late_cancel_fee_pct BETWEEN 0 AND 100),
  no_show_fee_pct        int NOT NULL DEFAULT 100 CHECK (no_show_fee_pct BETWEEN 0 AND 100),
  listed                 boolean NOT NULL DEFAULT true,
  plan                   text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
  plan_status            text CHECK (plan_status IN ('active','past_due','canceled')),
  stripe_subscription_id text UNIQUE,
  plan_period_end        timestamptz,
  stripe_account_id      text UNIQUE,
  charges_enabled        boolean NOT NULL DEFAULT false,
  payouts_enabled        boolean NOT NULL DEFAULT false,
  safety_status          text NOT NULL DEFAULT 'none' CHECK (safety_status IN ('none','pending','verified','rejected')),
  safety_evidence        text CHECK (length(safety_evidence) <= 500),
  safety_reviewed_at     timestamptz,
  safety_reviewed_by     text REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (offers_coaching OR offers_hitting)
);

CREATE TABLE courts (
  id            text PRIMARY KEY,
  provider_id   text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  address       text CHECK (length(address) <= 200),
  notes         text CHECK (length(notes) <= 500),
  booking_url   text CHECK (booking_url ~ '^https://'),
  booking_note  text CHECK (length(booking_note) <= 200),   -- e.g. "opens 7 days ahead at 8am"
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courts_provider_idx ON courts (provider_id);

-- ---------------------------------------------------------------------------
-- Offerings (what a provider sells) and sessions (each dated instance)
-- ---------------------------------------------------------------------------
CREATE TABLE offerings (
  id                    text PRIMARY KEY,
  provider_id           text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('private','semi_private','group','hitting')),
  title                 text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description           text CHECK (length(description) <= 2000),
  discipline            text CHECK (discipline IN ('singles','doubles','mens_doubles','womens_doubles','mixed_doubles')),
  audience              text NOT NULL DEFAULT 'adults' CHECK (audience IN ('adults','juniors','all')),
  capacity              int NOT NULL CHECK (capacity BETWEEN 1 AND 40),
  price_cents           int NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000),
  payment_rule          text NOT NULL CHECK (payment_rule IN ('free','pay_now','pay_after','external')),
  accepts_credits       boolean NOT NULL DEFAULT false,
  level_system          text CHECK (level_system IN ('utr','ntrp','wtn')),
  level_min             numeric(4,2),
  level_max             numeric(4,2),
  visibility            text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','clients','invite')),
  court_id              text REFERENCES courts(id) ON DELETE SET NULL,
  location_name         text CHECK (length(location_name) <= 120),
  location_note         text CHECK (length(location_note) <= 500),
  timezone              text NOT NULL,
  start_date            date NOT NULL,
  start_time            time NOT NULL,
  duration_minutes      int NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  slots_per_day         int NOT NULL DEFAULT 1 CHECK (slots_per_day BETWEEN 1 AND 16),
  repeat_weekdays       int[] CHECK (repeat_weekdays <@ ARRAY[0,1,2,3,4,5,6]),
  repeat_every_weeks    int NOT NULL DEFAULT 1 CHECK (repeat_every_weeks BETWEEN 1 AND 4),
  end_date              date,
  generated_through     date,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (payment_rule = 'free' OR price_cents > 0),
  CHECK (level_system IS NOT NULL OR (level_min IS NULL AND level_max IS NULL)),
  CHECK (level_min IS NULL OR level_max IS NULL OR level_min <= level_max),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (slots_per_day = 1 OR capacity = 1)
);
CREATE INDEX offerings_provider_idx ON offerings (provider_id, status);

CREATE TABLE sessions (
  id                  text PRIMARY KEY,
  offering_id         text NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  provider_id         text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  capacity            int NOT NULL CHECK (capacity BETWEEN 1 AND 40),
  price_cents         int NOT NULL CHECK (price_cents >= 0),
  status              text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  cancel_reason       text CHECK (length(cancel_reason) <= 300),
  court_status        text NOT NULL DEFAULT 'unknown' CHECK (court_status IN ('unknown','walk_up','booked','needs_booking')),
  court_confirmation  text CHECK (length(court_confirmation) <= 120),
  note                text CHECK (length(note) <= 500),
  detached            boolean NOT NULL DEFAULT false,   -- edited individually; series edits skip it
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, starts_at),
  CHECK (ends_at > starts_at)
);
CREATE INDEX sessions_provider_time_idx ON sessions (provider_id, starts_at);
CREATE INDEX sessions_upcoming_idx ON sessions (starts_at) WHERE status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Packages (prepaid credits)
-- ---------------------------------------------------------------------------
CREATE TABLE packages (
  id            text PRIMARY KEY,
  provider_id   text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  credits       int NOT NULL CHECK (credits BETWEEN 1 AND 100),
  price_cents   int NOT NULL CHECK (price_cents BETWEEN 100 AND 1000000),
  valid_days    int CHECK (valid_days BETWEEN 7 AND 730),
  kinds         text[] NOT NULL CHECK (kinds <@ ARRAY['private','semi_private','group','hitting'] AND cardinality(kinds) > 0),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE package_purchases (
  id              text PRIMARY KEY,
  package_id      text NOT NULL REFERENCES packages(id),
  provider_id     text NOT NULL REFERENCES providers(id),
  owner_user_id   text NOT NULL REFERENCES users(id),
  kinds           text[] NOT NULL,
  credits_total   int NOT NULL CHECK (credits_total > 0),
  credits_used    int NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','refunded','canceled')),
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (credits_used <= credits_total)
);
CREATE INDEX package_purchases_owner_idx ON package_purchases (owner_user_id, provider_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
  id                    text PRIMARY KEY,
  session_id            text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  offering_id           text NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  provider_id           text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  player_id             text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  booked_by_user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                text NOT NULL CHECK (status IN (
                          'held','invited','requested','confirmed','waitlisted','offered',
                          'cancelled','late_cancelled','no_show','attended','expired','declined')),
  payment_rule          text NOT NULL CHECK (payment_rule IN ('free','pay_now','pay_after','external')),
  price_cents           int NOT NULL CHECK (price_cents >= 0),
  payment_status        text NOT NULL DEFAULT 'none' CHECK (payment_status IN (
                          'none','due','paid','paid_external','credit','refunded','waived','failed')),
  package_purchase_id   text REFERENCES package_purchases(id),
  hold_expires_at       timestamptz,
  offer_expires_at      timestamptz,
  waitlisted_at         timestamptz,
  cancelled_at          timestamptz,
  cancelled_by_user_id  text REFERENCES users(id),
  attended_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bookings_one_open_per_player ON bookings (session_id, player_id)
  WHERE status IN ('held','invited','requested','confirmed','waitlisted','offered');
CREATE INDEX bookings_session_idx ON bookings (session_id, status);
CREATE INDEX bookings_player_idx ON bookings (player_id);
CREATE INDEX bookings_booker_idx ON bookings (booked_by_user_id);
CREATE INDEX bookings_expiring_idx ON bookings (status, hold_expires_at, offer_expires_at)
  WHERE status IN ('held','offered');

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE TABLE payment_methods (
  id          text PRIMARY KEY,                 -- processor payment method id
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  processor   text NOT NULL CHECK (processor IN ('stripe','dev')),
  brand       text,
  last4       text,
  is_default  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_methods_user_idx ON payment_methods (user_id);

CREATE TABLE payments (
  id                    text PRIMARY KEY,
  provider_id           text NOT NULL REFERENCES providers(id),
  payer_user_id         text NOT NULL REFERENCES users(id),
  purpose               text NOT NULL CHECK (purpose IN ('booking','package','late_cancel_fee','no_show_fee','card_setup')),
  booking_id            text REFERENCES bookings(id) ON DELETE SET NULL,
  package_purchase_id   text REFERENCES package_purchases(id),
  amount_cents          int NOT NULL CHECK (amount_cents >= 0 AND amount_cents <= 1000000),
  platform_fee_cents    int NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  -- Money side effects are durable: a refund is *requested* in the same transaction as the
  -- booking change, executed right after commit, and retried by cron until refunded.
  refund_requested_cents int NOT NULL DEFAULT 0 CHECK (refund_requested_cents >= 0),
  refunded_cents        int NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  mode                  text NOT NULL CHECK (mode IN ('checkout','off_session')),
  payment_method_id     text,                      -- off-session charges
  attempts              int NOT NULL DEFAULT 0,
  status                text NOT NULL CHECK (status IN (
                          'pending','succeeded','failed','canceled','refunded','partially_refunded','disputed')),
  processor             text NOT NULL CHECK (processor IN ('stripe','dev')),
  checkout_session_id   text UNIQUE,
  checkout_url          text,
  payment_intent_id     text UNIQUE,
  failure_message       text,
  idempotency_key       text NOT NULL UNIQUE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_cents <= amount_cents AND refund_requested_cents <= amount_cents),
  CHECK (purpose = 'card_setup' OR amount_cents > 0)
);
CREATE INDEX payments_work_idx ON payments (status, mode) WHERE status = 'pending' OR refund_requested_cents > refunded_cents;
CREATE INDEX payments_provider_idx ON payments (provider_id, created_at DESC);
CREATE INDEX payments_payer_idx ON payments (payer_user_id, created_at DESC);
CREATE INDEX payments_booking_idx ON payments (booking_id);

CREATE TABLE processed_events (
  id           text PRIMARY KEY,
  source       text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Clients (a provider's roster)
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
  provider_id  text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  player_id    text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  source       text NOT NULL CHECK (source IN ('booking','import','manual','join')),
  notes        text CHECK (length(notes) <= 2000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Messaging. Juniors never log in, so a junior's guardian is the member.
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  id               text PRIMARY KEY,
  provider_id      text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('direct','offering')),
  offering_id      text UNIQUE REFERENCES offerings(id) ON DELETE CASCADE,
  direct_user_id   text REFERENCES users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'offering') = (offering_id IS NOT NULL)),
  CHECK ((kind = 'direct') = (direct_user_id IS NOT NULL)),
  UNIQUE (provider_id, direct_user_id)
);

CREATE TABLE conversation_members (
  conversation_id  text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at     timestamptz,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id);

CREATE TABLE messages (
  id               text PRIMARY KEY,
  conversation_id  text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Notifications (outbox: in-app list + email/SMS delivery with retries)
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  title            text NOT NULL,
  body             text NOT NULL,
  link             text,
  dedupe_key       text UNIQUE,
  email_status     text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','failed','skipped')),
  sms_status       text NOT NULL DEFAULT 'pending' CHECK (sms_status IN ('pending','sent','failed','skipped')),
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_delivery_idx ON notifications (next_attempt_at)
  WHERE email_status = 'pending' OR sms_status = 'pending';

-- ---------------------------------------------------------------------------
-- Assistant
-- ---------------------------------------------------------------------------
-- Conversations are append-only (required for replaying thinking blocks); a long or stale
-- conversation starts a new thread instead of being trimmed.
CREATE TABLE assistant_messages (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('user','assistant')),
  content     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX assistant_messages_thread_idx ON assistant_messages (user_id, thread_id, created_at);

CREATE TABLE assistant_pending_actions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id    text NOT NULL,
  actions      jsonb NOT NULL,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed windows)
-- ---------------------------------------------------------------------------
CREATE TABLE rate_limits (
  key           text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  count         int NOT NULL
);

-- ---------------------------------------------------------------------------
-- Deny-by-default for any role that bypasses the app server (e.g. Supabase's
-- anon/authenticated API roles). The app connects as the table owner.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
