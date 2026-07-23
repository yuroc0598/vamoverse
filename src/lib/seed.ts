// Seed script for demo data - can be run via npm run seed.
// Derives entirely from the canonical catalog (src/lib/domain/catalog.ts) so the
// documented seed can never drift from what the app actually renders. To seed a
// real Supabase instance, map these records to inserts here.
import { CATALOG_PLAYERS, CATALOG_EVENTS, CATALOG_PAYMENTS, playerName } from '@/lib/domain/catalog'

export const seedData = {
  users: CATALOG_PLAYERS.map((p) => ({
    id: p.id,
    email: p.email,
    role: p.role,
    display_name: p.displayName,
    gender: p.gender,
    utr_singles: p.utrSingles,
    utr_doubles: p.utrDoubles,
    ntrp: p.ntrp,
    parent_id: p.parentId,
  })),
  events: CATALOG_EVENTS.map((e) => ({
    id: e.id,
    title: e.title,
    discipline: e.discipline,
    type: e.type,
    capacity: e.capacity,
    price_cents: e.priceCents,
    is_paid: e.priceCents > 0,
    level_min_utr: e.levelMinUtr,
    level_max_utr: e.levelMaxUtr,
  })),
  payments: CATALOG_PAYMENTS.map((p) => ({
    student: playerName(p.studentId),
    amount: p.amountCents,
    type: p.type,
    status: p.status,
  })),
  connections: [
    { requester: 'Maya', addressee: 'Sarah', status: 'accepted' },
  ],
}

if (require.main === module) {
  // eslint-disable-next-line no-console
  console.log('Seed data derived from catalog. In mock mode components read the catalog directly.')
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(seedData, null, 2))
}

export default seedData
