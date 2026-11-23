-- Linked UTR account (existence check only).
--
-- utr_player_id is set when UTR's public search confirmed an account with this ID
-- and a matching name exists. It does NOT prove ownership or the rating; the
-- utr_singles/utr_doubles columns stay self-reported. Each UTR account can be
-- linked to at most one Vamoverse user.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS utr_player_id text
  CHECK (utr_player_id IS NULL OR utr_player_id ~ '^[0-9]{1,12}$');
ALTER TABLE users ADD COLUMN IF NOT EXISTS utr_account_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utr_account_claimed boolean;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utr_account_checked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS users_utr_player_id_unique
  ON users (utr_player_id)
  WHERE utr_player_id IS NOT NULL;

COMMIT;
