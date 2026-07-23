-- Demo seed mirroring src/lib/domain/catalog.ts. Idempotent (ON CONFLICT DO NOTHING).
-- Applied automatically after 0001_init.sql by docker compose.

-- users (coach + parent first for FK parent_id)
INSERT INTO users (id, email, role, display_name, gender, utr_singles, utr_doubles, ntrp, parent_id) VALUES
  ('coach_1',   'coach@demo.com', 'coach',   'Coach Alex',    'M', 6.2, 6.0, NULL, NULL),
  ('parent_1',  'dave@demo.com',  'parent',  'Dave (Parent)', 'M', NULL, NULL, NULL, NULL),
  ('student_1', 'maya@demo.com',  'student', 'Maya',          'F', 4.5, 4.2, 3.5, NULL),
  ('student_2', 'sarah@demo.com', 'student', 'Sarah',         'F', 4.8, 4.5, 4.0, NULL),
  ('student_3', 'leo@demo.com',   'student', 'Leo (Junior)',  'M', 4.5, 4.0, 3.5, 'parent_1'),
  ('student_4', 'emma@demo.com',  'student', 'Emma (Junior)', 'F', 4.2, 3.9, 3.0, 'parent_1')
ON CONFLICT (id) DO NOTHING;

-- events
INSERT INTO events (id, coach_id, title, discipline, type, capacity, price_cents, level_min_utr, level_max_utr, location_name, location_address, match_format, scoring_system) VALUES
  ('evt_1', 'coach_1', 'Adult 3.5 Doubles Clinic',           'open_doubles',   'group_clinic', 8,  4000, 3.5, 5.0, 'Fremont Tennis Center', 'Fremont, CA 94536 - Court 2', 'best_of_3_10pt_tb', 'no_ad'),
  ('evt_2', 'coach_1', 'Mixed Doubles - Needs 1F UTR 4-5',   'mixed_doubles',  'custom_match', 4,  0,    4.0, 5.0, 'Fremont HS Court 2',    'Fremont, CA',                 'pro_set_8_game',    'ad'),
  ('evt_3', 'coach_1', 'Private Lesson - Leo (Junior)',      'open_singles',   'private',      1,  8000, NULL, NULL, 'Central Park Courts',  'Fremont, CA',                 'timed_90',          NULL),
  ('evt_4', 'coach_1', 'Womens Doubles Ladder - Round Robin','womens_doubles', 'tournament',   12, 3500, 4.0, 6.0, 'Bay Club',              'Fremont, CA',                 NULL,                NULL)
ON CONFLICT (id) DO NOTHING;

-- one default occurrence per event (matches the /api/events/register default id)
INSERT INTO event_occurrences (id, event_id, occurrence_start_at, occurrence_end_at) VALUES
  ('evt_1_occ_default', 'evt_1', now() + interval '24 hours', now() + interval '24 hours' + interval '90 minutes'),
  ('evt_2_occ_default', 'evt_2', now() + interval '48 hours', now() + interval '48 hours' + interval '120 minutes'),
  ('evt_3_occ_default', 'evt_3', now(),                        now() + interval '60 minutes'),
  ('evt_4_occ_default', 'evt_4', now() + interval '72 hours', now() + interval '72 hours' + interval '180 minutes')
ON CONFLICT (id) DO NOTHING;

-- payments (net = amount - 5% application fee)
INSERT INTO payments (id, coach_id, student_id, amount_cents, application_fee_cents, net_to_coach_cents, type, status, description, idempotency_key, auto_capture_at) VALUES
  ('pay_1', 'coach_1', 'student_3', 8000, 400, 7600, 'lesson_auto',        'requires_capture', 'Private Lesson Mon 3pm', 'seed_pay_1', now() + interval '2 minutes'),
  ('pay_2', 'coach_1', 'student_1', 4000, 200, 3800, 'event_registration', 'captured',         'Group Clinic Sat 9am',   'seed_pay_2', NULL),
  ('pay_3', 'coach_1', 'student_2', 4000, 200, 3800, 'adhoc',              'captured',         'Stringing',              'seed_pay_3', NULL),
  ('pay_4', 'coach_1', 'student_1', 4000, 200, 3800, 'late_fee',           'pending',          'Late cancel <24h',       'seed_pay_4', NULL)
ON CONFLICT (id) DO NOTHING;

-- connections
INSERT INTO connections (requester_id, addressee_id, status) VALUES
  ('student_1', 'student_2', 'accepted')
ON CONFLICT (requester_id, addressee_id) DO NOTHING;
