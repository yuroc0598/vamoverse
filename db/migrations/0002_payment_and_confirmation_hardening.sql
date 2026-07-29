BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS capture_claimed_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS capture_attempts int NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS next_capture_attempt_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS last_capture_error text;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_open_unique
  ON registrations (occurrence_id, student_id)
  WHERE status IN ('registered','invited','pending_accept','waitlisted');

CREATE TABLE IF NOT EXISTS vamos_pending_actions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  payload     jsonb NOT NULL,
  signature   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMIT;
