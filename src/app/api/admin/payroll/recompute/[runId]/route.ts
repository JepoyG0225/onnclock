/**
 * POST /api/admin/payroll/recompute/[runId]?key=<MIGRATION_APPLY_KEY>
 *
 * SUPER_ADMIN-only proxy that re-runs the standard payroll compute against
 * the existing /api/payroll/[runId]/compute endpoint with the run's owning
 * company scope (no impersonation cookie needed).
 *
 * Refuses to recompute LOCKED runs (mirroring the underlying compute route).
 *
 * Returns: { run, payslips: count, recomputed: true }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// Trim — pulled-from-Vercel values can carry surrounding whitespace / quotes
const APPLY_KEY = (process.env.MIGRATION_APPLY_KEY ?? '').trim().replace(/^"|"$/g, '')

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (ctx.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'SUPER_ADMIN only' }, { status: 403 })
  }
  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!APPLY_KEY || key !== APPLY_KEY) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 })
  }

  const { runId } = await params
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: { id: true, companyId: true, status: true },
  })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status === 'LOCKED') {
    return NextResponse.json({ error: 'Locked runs cannot be recomputed' }, { status: 400 })
  }

  // Reload the variable-income entries previously saved for this run so
  // the compute route's "all required employees must have an entry"
  // validation passes without an admin re-typing every value.
  const priorEntries = await prisma.payrollRunIncomeEntry.findMany({
    where: { payrollRunId: runId },
    select: { employeeId: true, incomeTypeId: true, amount: true },
  })
  const variableIncomeEntries = priorEntries.map((e) => ({
    employeeId: e.employeeId,
    incomeTypeId: e.incomeTypeId,
    amount: Number(e.amount),
  }))

  // Forward to the existing compute endpoint, scoped to the run's owning
  // company via ?companyId (SUPER_ADMIN-only override added on that route).
  const origin = new URL(req.url).origin
  const cookieHeader = req.headers.get('cookie') ?? ''
  const computeRes = await fetch(`${origin}/api/payroll/${runId}/compute?companyId=${encodeURIComponent(run.companyId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cookie': cookieHeader,
    },
    body: JSON.stringify({ variableIncomeEntries }),
  })
  const computeJson = await computeRes.json().catch(() => ({}))
  if (!computeRes.ok) {
    return NextResponse.json(
      { error: computeJson.error ?? 'Compute failed', detail: computeJson, status: computeRes.status },
      { status: 502 },
    )
  }

  return NextResponse.json({
    runId,
    companyId: run.companyId,
    recomputed: true,
    compute: computeJson,
  })
}
