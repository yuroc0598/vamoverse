-- Vamoverse canonical schema (single source of truth for the data model).
-- Enum-like columns use text + CHECK to stay aligned with src/lib/types/enums.ts
-- without requiring ALTER TYPE migrations. Money is integer cents. Times are UTC.
--
-- Apply locally:  docker compose up -d db   (auto-runs this via /docker-entrypoint-initdb.d)
-- Or manually:    psql "$DATABASE_URL" -f db/migrations/0001_init.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  role          text NOT NULL CHECK (role IN ('coach','student','parent','admin')),
  display_name  text NOT NULL,
  gender        text CHECK (gender IN ('M','F','other','unspecified')),
  utr_singles   numeric(3,1) CHECK (utr_singles IS NULL OR (utr_singles >= 1 AND utr_singles <= 16.5)),
  utr_doubles   numeric(3,1) CHECK (utr_doubles IS NULL OR (utr_doubles >= 1 AND utr_doubles <= 16.5)),
  ntrp          numeric(2,1),
  parent_id     text REFERENCES users(id),
  dob           date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- events + occurrences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id             text PRIMARY KEY,
  coach_id       text NOT NULL REFERENCES users(id),
  title          text NOT NULL,
  discipline     text NOT NULL CHECK (discipline IN (
                    'mens_singles','womens_singles','mens_doubles','womens_doubles',
                    'mixed_doubles','open_singles','open_doubles','open')),
  type           text NOT NULL CHECK (type IN (
                    'private','semi_private','group_clinic','evaluation','camp',
                    'tournament','custom_match','social_mixer')),
  capacity       int NOT NULL CHECK (capacity > 0 AND capacity <= 64),
  price_cents    int NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  level_min_utr  numeric(3,1),
  level_max_utr  numeric(3,1),
  location_name  text,
  location_address text,
  match_format   text,
  scoring_system text CHECK (scoring_system IS NULL OR scoring_system IN ('ad','no_ad')),
  status         text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','cancelled','completed')),
  timezone       text NOT NULL DEFAULT 'America/Los_Angeles',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (level_min_utr IS NULL OR level_max_utr IS NULL OR level_min_utr <= level_max_utr)
);

CREATE TABLE IF NOT EXISTS event_occurrences (
  id                  text PRIMARY KEY,
  event_id            text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_start_at timestamptz NOT NULL,
  occurrence_end_at   timestamptz NOT NULL,
  capacity_override   int CHECK (capacity_override IS NULL OR capacity_override > 0),
  status              text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','cancelled','completed')),
  UNIQUE (event_id, occurrence_start_at)
);

-- ---------------------------------------------------------------------------
-- registrations (partial unique prevents duplicate active registrations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id  text NOT NULL REFERENCES event_occurrences(id) ON DELETE CASCADE,
  event_id       text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id     text NOT NULL REFERENCES users(id),
  status         text NOT NULL DEFAULT 'registered' CHECK (status IN (
                    'invited','pending_accept','registered','waitlisted','cancelled','no_show','completed')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_unique
  ON registrations (occurrence_id, student_id)
  WHERE status IN ('registered','invited','pending_accept');

CREATE UNIQUE INDEX IF NOT EXISTS registrations_open_unique
  ON registrations (occurrence_id, student_id)
  WHERE status IN ('registered','invited','pending_accept','waitlisted');

-- ---------------------------------------------------------------------------
-- payments (idempotency_key UNIQUE is the real double-charge guard)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                     text PRIMARY KEY,
  coach_id               text NOT NULL REFERENCES users(id),
  student_id             text NOT NULL REFERENCES users(id),
  event_id               text REFERENCES events(id),
  occurrence_id          text REFERENCES event_occurrences(id),
  amount_cents           int NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 1000000),
  application_fee_cents   int NOT NULL DEFAULT 0 CHECK (application_fee_cents >= 0),
  net_to_coach_cents     int NOT NULL,
  type                   text NOT NULL CHECK (type IN (
                            'lesson_auto','event_registration','adhoc','late_fee','no_show','subscription','package')),
  status                 text NOT NULL CHECK (status IN (
                            'pending','requires_capture','captured','failed','refunded','cancelled',
                            'requires_action','chargeback_open','chargeback_lost')),
  internal_review_status text CHECK (internal_review_status IS NULL OR internal_review_status IN (
                            'hold','disputed_by_student','approved','rejected')),
  description            text,
  stripe_payment_intent_id text,
  idempotency_key        text NOT NULL UNIQUE,
  auto_capture_at        timestamptz,
  capture_claimed_at     timestamptz,
  capture_attempts       int NOT NULL DEFAULT 0,
  next_capture_attempt_at timestamptz,
  last_capture_error     text,
  captured_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Webhook idempotency: one row per Stripe event id (dedup across retries/instances)
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id    text PRIMARY KEY,
  type        text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vamos_pending_actions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  payload     jsonb NOT NULL,
  signature   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- connections (social graph)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connections (
  requester_id text NOT NULL REFERENCES users(id),
  addressee_id text NOT NULL REFERENCES users(id),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked','declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id)
);

-- ---------------------------------------------------------------------------
-- Atomic, overbooking-proof registration. This is what the in-memory mock
-- structurally cannot guarantee: FOR UPDATE serializes concurrent joiners on
-- the same occurrence so two clients can't both read "spot available".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_for_occurrence(
  p_occurrence_id text,
  p_student_id    text,
  p_event_id      text
) RETURNS TABLE(registration_id uuid, out_status text) AS $$
DECLARE
  v_capacity int;
  v_count    int;
  v_existing uuid;
  v_existing_status text;
  v_status   text;
  v_id       uuid;
  v_event_id text;
  v_discipline text;
  v_price_cents int;
  v_level_min numeric;
  v_level_max numeric;
  v_gender text;
  v_utr numeric;
  v_m_count int;
  v_f_count int;
  v_event_status text;
  v_occurrence_status text;
  v_occurrence_end timestamptz;
BEGIN
  -- Lock the occurrence row for the duration of the transaction.
  SELECT COALESCE(o.capacity_override, e.capacity), e.id, e.discipline,
         e.price_cents, e.level_min_utr, e.level_max_utr, e.status, o.status,
         o.occurrence_end_at
    INTO v_capacity, v_event_id, v_discipline, v_price_cents, v_level_min, v_level_max,
         v_event_status, v_occurrence_status, v_occurrence_end
  FROM event_occurrences o
  JOIN events e ON e.id = o.event_id
  WHERE o.id = p_occurrence_id
  FOR UPDATE OF o;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'occurrence_not_found:%', p_occurrence_id;
  END IF;

  IF v_event_id <> p_event_id THEN
    RAISE EXCEPTION 'event_occurrence_mismatch';
  END IF;

  -- Return an existing active/waitlisted registration before rechecking mutable
  -- price, rating, or event state. This is the idempotency boundary.
  SELECT r.id, r.status INTO v_existing, v_existing_status
  FROM registrations r
  WHERE r.occurrence_id = p_occurrence_id
    AND r.student_id = p_student_id
    AND r.status IN ('registered','invited','pending_accept','waitlisted');
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, v_existing_status;
    RETURN;
  END IF;

  IF v_event_status <> 'published' OR v_occurrence_status <> 'published'
     OR v_occurrence_end <= now() THEN
    RAISE EXCEPTION 'occurrence_closed';
  END IF;

  SELECT u.gender,
         CASE WHEN v_discipline LIKE '%doubles' THEN u.utr_doubles ELSE u.utr_singles END
    INTO v_gender, v_utr
  FROM users u
  WHERE u.id = p_student_id AND u.role IN ('student','coach');

  IF v_gender IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Basic discipline eligibility applies to both registered and waitlisted
  -- players. Mixed roster slot counts apply only when assigning a live spot.
  IF v_discipline IN ('mens_singles','mens_doubles') AND v_gender <> 'M' THEN
    RAISE EXCEPTION 'not_eligible:gender';
  ELSIF v_discipline IN ('womens_singles','womens_doubles') AND v_gender <> 'F' THEN
    RAISE EXCEPTION 'not_eligible:gender';
  ELSIF v_discipline = 'mixed_doubles' AND v_gender NOT IN ('M','F') THEN
    RAISE EXCEPTION 'not_eligible:gender';
  END IF;

  IF (v_level_min IS NOT NULL OR v_level_max IS NOT NULL) AND v_utr IS NULL THEN
    RAISE EXCEPTION 'rating_required';
  END IF;
  IF (v_level_min IS NOT NULL AND v_utr < v_level_min)
     OR (v_level_max IS NOT NULL AND v_utr > v_level_max) THEN
    RAISE EXCEPTION 'not_eligible:rating';
  END IF;

  IF v_price_cents > 0 AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.occurrence_id = p_occurrence_id
      AND p.student_id = p_student_id
      AND p.status = 'captured'
      AND p.amount_cents = v_price_cents
  ) THEN
    RAISE EXCEPTION 'payment_required';
  END IF;

  SELECT count(*) INTO v_count
  FROM registrations r
  WHERE r.occurrence_id = p_occurrence_id
    AND r.status IN ('registered','invited','pending_accept');

  IF v_count >= v_capacity THEN
    v_status := 'waitlisted';
  ELSE
    SELECT
      count(*) FILTER (WHERE u.gender = 'M'),
      count(*) FILTER (WHERE u.gender = 'F')
      INTO v_m_count, v_f_count
    FROM registrations r
    JOIN users u ON u.id = r.student_id
    WHERE r.occurrence_id = p_occurrence_id
      AND r.status IN ('registered','invited','pending_accept');

    v_m_count := v_m_count + CASE WHEN v_gender = 'M' THEN 1 ELSE 0 END;
    v_f_count := v_f_count + CASE WHEN v_gender = 'F' THEN 1 ELSE 0 END;

    IF v_discipline = 'mixed_doubles'
      AND (v_m_count > 2 OR v_f_count > 2) THEN
      RAISE EXCEPTION 'not_eligible:mixed_roster';
    END IF;
    v_status := 'registered';
  END IF;

  INSERT INTO registrations (occurrence_id, event_id, student_id, status)
  VALUES (p_occurrence_id, p_event_id, p_student_id, v_status)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_status;
END;
$$ LANGUAGE plpgsql;

COMMIT;
