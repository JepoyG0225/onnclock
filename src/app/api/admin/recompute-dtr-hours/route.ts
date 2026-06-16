/**
 * POST /api/admin/recompute-dtr-hours?adminKey=...&companyId=...
 *
 * Admin-only endpoint that re-derives regularHours / overtimeHours /
 * nightDiffHours / late / undertime on every DTR for a company over the
 * last N days, using the current timesheet engine. Used as a one-off
 * after engine changes that affect persisted DTR values (e.g. the
 * assume-break-when-unclocked fix).
 *
 * Auth: admin-key bypass (MIGRATION_APPLY_KEY env var) OR session
 * SUPER_ADMIN. Same pattern as /api/payroll/[runId]/compute.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { recomputeCompanyDtrHours } from '@/lib/timesheet/recompute'

export async function POST(req: NextRequest) {
  const adminKey = (req.nextUrl.searchParams.get('adminKey') ?? '').trim()
  const expectedKey = (process.env.MIGRATION_APPLY_KEY ?? '').trim().replace(/^"|"$/g, '')
  const isAdminKeyAuth = expectedKey.length > 0 && adminKey === expectedKey

  if (!isAdminKeyAuth) {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    if (auth.ctx.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'SUPER_ADMIN required' }, { status: 403 })
    }
  }

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  const daysBack = parseInt(req.nextUrl.searchParams.get('daysBack') ?? '365', 10)

  try {
    const result = await recomputeCompanyDtrHours(companyId, { daysBack })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
