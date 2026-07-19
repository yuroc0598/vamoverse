// Seed script for demo data - can be run via npm run seed
// For MVP, data is mocked in components, but this file documents the seed that would be inserted into Supabase

export const seedData = {
  users: [
    { id: 'coach_1', email: 'coach@demo.com', role: 'coach', display_name: 'Coach Alex', gender: 'M' },
    { id: 'student_1', email: 'maya@demo.com', role: 'student', display_name: 'Maya', gender: 'F', utr_singles: 4.5, utr_doubles: 4.2, ntrp: 3.5 },
    { id: 'student_2', email: 'sarah@demo.com', role: 'student', display_name: 'Sarah', gender: 'F', utr_singles: 4.8, utr_doubles: 4.5, ntrp: 4.0 },
    { id: 'student_3', email: 'leo@demo.com', role: 'student', display_name: 'Leo (Junior)', gender: 'M', utr_singles: 4.5, utr_doubles: 4.0, ntrp: 3.5, parent_id: 'parent_1' },
    { id: 'student_4', email: 'emma@demo.com', role: 'student', display_name: 'Emma (Junior)', gender: 'F', utr_singles: 4.2, utr_doubles: 3.9, ntrp: 3.0, parent_id: 'parent_1' },
    { id: 'parent_1', email: 'dave@demo.com', role: 'parent', display_name: 'Dave (Parent)', gender: 'M' },
  ],
  events: [
    { title: 'Adult 3.5 Doubles Clinic', discipline: 'open_doubles', type: 'group_clinic', capacity: 8, price_cents: 4000, is_paid: true, level_min_utr: 3.5, level_max_utr: 5.0 },
    { title: 'Mixed Doubles - Needs 1F', discipline: 'mixed_doubles', type: 'custom_match', capacity: 4, price_cents: 0, is_paid: false, level_min_utr: 4, level_max_utr: 5 },
    { title: 'Private Lesson Leo', discipline: 'open_singles', type: 'private', capacity: 1, price_cents: 8000, is_paid: true },
  ],
  payments: [
    { student: 'Leo', amount: 8000, type: 'lesson_auto', status: 'requires_capture', auto_capture_in: '2min demo' },
    { student: 'Maya', amount: 4000, type: 'event_registration', status: 'captured' },
  ],
  connections: [
    { requester: 'Maya', addressee: 'Sarah', status: 'accepted' },
  ]
}

console.log('Seed data defined - in mock mode components use this directly. To seed real Supabase, implement inserts here.')

export default seedData
