import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/lib/auth/actor'
import { hasDatabase, query } from '@/lib/db/pg'
import { listCoachPaymentsUi, listPayments, playerName, toApiPayment } from '@/lib/domain/catalog'

export async function GET(req: NextRequest) {
  const { actor, isMockMode } = await resolveActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (isMockMode) {
    const payments = actor.role === 'coach'
      ? listCoachPaymentsUi(actor.id)
      : listPayments().filter((payment) => payment.studentId === actor.id).map((payment) => ({
          ...toApiPayment(payment), student_name: playerName(payment.studentId), created_at: new Date().toISOString(),
        }))
    return NextResponse.json({ payments, demo: true })
  }
  if (!hasDatabase()) return NextResponse.json({ error: 'Payment database is not configured' }, { status: 503 })
  if (!['coach', 'student'].includes(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const column = actor.role === 'coach' ? 'p.coach_id' : 'p.student_id'
  const rows = await query(
    `SELECT p.*, u.display_name AS student_name
     FROM payments p JOIN users u ON u.id=p.student_id
     WHERE ${column}=$1 ORDER BY p.created_at DESC LIMIT 200`,
    [actor.id]
  )
  return NextResponse.json({ payments: rows, demo: false })
}
