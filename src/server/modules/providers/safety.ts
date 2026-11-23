// Safety checks for providers who want to work with juniors: the provider submits proof
// (USTA Safe Play, or a background check plus SafeSport training) and an admin reviews it.
import { z } from 'zod'
import { maybeOne, type Db } from '../../db'
import { fail } from '../../errors'
import { enqueue } from '../notifications/outbox'

export const safetySubmission = z.object({
  method: z.enum(['usta_safe_play', 'background_check']),
  reference: z.string().trim().min(3).max(200),
})

export async function submitSafetyCheck(db: Db, providerId: string, input: z.output<typeof safetySubmission>): Promise<void> {
  const label = input.method === 'usta_safe_play' ? 'USTA Safe Play' : 'Background check + SafeSport'
  const rows = await db.query<{ name: string }>(
    `UPDATE providers p SET safety_status = 'pending', safety_evidence = $2, safety_reviewed_at = NULL, safety_reviewed_by = NULL, updated_at = now()
     FROM users u WHERE p.id = $1 AND u.id = p.user_id AND p.safety_status <> 'verified' RETURNING u.display_name AS name`,
    [providerId, `${label}: ${input.reference}`])
  if (!rows[0]) throw fail.conflict('Your safety check is already approved.')
  const admins = await db.query<{ id: string }>(`SELECT id FROM users WHERE is_admin`)
  for (const admin of admins) {
    await enqueue(db, { userId: admin.id, kind: 'admin.safety_review', title: `Safety check to review: ${rows[0].name}`, body: label, link: '/admin', dedupeKey: `safety:${providerId}:${input.reference}` })
  }
}

export interface PendingSafety { providerId: string; name: string; email: string | null; evidence: string | null; submittedAt: Date }

export async function listPendingSafety(db: Db): Promise<PendingSafety[]> {
  return db.query<PendingSafety>(
    `SELECT p.id AS "providerId", u.display_name AS name, u.email, p.safety_evidence AS evidence, p.updated_at AS "submittedAt"
     FROM providers p JOIN users u ON u.id = p.user_id WHERE p.safety_status = 'pending' ORDER BY p.updated_at`)
}

export async function reviewSafetyCheck(db: Db, adminUserId: string, providerId: string, approve: boolean): Promise<void> {
  const row = await maybeOne<{ userId: string }>(db,
    `UPDATE providers SET safety_status = $3, safety_reviewed_at = now(), safety_reviewed_by = $2, updated_at = now()
     WHERE id = $1 AND safety_status = 'pending' RETURNING user_id AS "userId"`, [providerId, adminUserId, approve ? 'verified' : 'rejected'])
  if (!row) throw fail.notFound('Pending safety check')
  await enqueue(db, {
    userId: row.userId, kind: 'provider.safety_reviewed',
    title: approve ? 'Safety check approved' : 'Safety check needs another look',
    body: approve ? 'You can now offer sessions for juniors.' : 'We couldn’t verify the details you sent. Check them and submit again from Settings.',
    link: '/settings/business',
  })
}
