-- Push notifications for the native iOS app.

-- One row per app install that allowed notifications. A token belongs to whoever signed in on
-- that device last (devices.register moves it), so a shared phone never gets the previous
-- user's notifications.
CREATE TABLE devices (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios')),
  token         text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{64,200}$'),
  environment   text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user_idx ON devices (user_id);
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Push is tracked separately from email/SMS, so their retries never send the push again.
-- Existing rows are already delivered ('skipped'); new notifications start 'pending'.
ALTER TABLE notifications ADD COLUMN push_status text NOT NULL DEFAULT 'skipped'
  CONSTRAINT notifications_push_status_check CHECK (push_status IN ('pending', 'sent', 'failed', 'skipped'));
ALTER TABLE notifications ALTER COLUMN push_status SET DEFAULT 'pending';
