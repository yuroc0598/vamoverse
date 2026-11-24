-- Hardening after architecture review.

-- Several notifications are often written in one transaction; now() is the same for all of
-- them, so order them by the actual insert time.
ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT clock_timestamp();

-- Crew import stores invites (what the coach typed) instead of linking or creating accounts.
-- People become clients only by their own action: joining a crew or booking.
CREATE TABLE client_invites (
  id                text PRIMARY KEY,
  provider_id       text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  email             text,
  phone             text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','joined')),
  joined_player_id  text REFERENCES players(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  joined_at         timestamptz,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX client_invites_pending_email ON client_invites (provider_id, lower(email)) WHERE email IS NOT NULL AND status = 'pending';
CREATE UNIQUE INDEX client_invites_pending_phone ON client_invites (provider_id, phone) WHERE phone IS NOT NULL AND status = 'pending';
ALTER TABLE client_invites ENABLE ROW LEVEL SECURITY;

UPDATE clients SET source = 'join' WHERE source NOT IN ('booking', 'join');
ALTER TABLE clients DROP CONSTRAINT clients_source_check;
ALTER TABLE clients ADD CONSTRAINT clients_source_check CHECK (source IN ('booking', 'join'));

-- Disputes are reflected on the booking (not only the payment).
ALTER TABLE bookings DROP CONSTRAINT bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN (
  'none','due','paid','paid_external','credit','refunded','waived','failed','disputed'));

-- Booking history survives a player (e.g. a junior) being deleted: the booking keeps a name
-- snapshot and loses only the link. Removing a junior also anonymizes the snapshot.
ALTER TABLE bookings ADD COLUMN player_name text;
UPDATE bookings b SET player_name = p.display_name FROM players p WHERE p.id = b.player_id;
ALTER TABLE bookings ALTER COLUMN player_name SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE bookings DROP CONSTRAINT bookings_player_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;
