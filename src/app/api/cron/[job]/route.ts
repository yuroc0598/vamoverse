// Scheduled jobs. Vercel Cron sends GET with "Authorization: Bearer $CRON_SECRET".
import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/lib/logger'
import { secret } from '@/server/config'
import { JOBS, runJob } from '@/server/jobs'

function authorized(req: NextRequest): boolean {
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret('CRON_SECRET')}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { job } = await params
  if (!(job in JOBS)) return NextResponse.json({ error: 'Unknown job' }, { status: 404 })
  try {
    return NextResponse.json({ ok: true, result: await runJob(job as keyof typeof JOBS) })
  } catch (error) {
    logger.error('job.failed', { job, error })
    return NextResponse.json({ error: 'Job failed' }, { status: 500 })
  }
}
