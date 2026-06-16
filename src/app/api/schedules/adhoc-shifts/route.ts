import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'

/**
 * GET /api/schedules/adhoc-shifts
 *
 * Returns distinct (timeIn, timeOut) combinations used in this company's
 * EmployeeShiftAssignment rows that DON'T correspond to any saved
 * WorkSchedule template. Used by the Schedules page to surface ad-hoc
 * shift times (e.g. an admin typed 14:00–17:00 directly into the
 * assignment dialog) as additional draggable cards in the Work Hours
 * panel, plus a "Save as template" button so they can be promoted.
 *
 * Defaults to the last 120 days to keep the result small and relevant.
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error
    const companyId = resolveCompanyIdForRequest(ctx, req)
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const since = new Date()
    since.setDate(since.getDate() - 120)

    const rows = await prisma.$queryRaw<Array<{
      timeIn: string
      timeOut: string
      usageCount: bigint
      lastUsed: Date
    }>>`
      SELECT
        a."timeIn"  AS "timeIn",
        a."timeOut" AS "timeOut",
        COUNT(*)    AS "usageCount",
        MAX(a."date") AS "lastUsed"
      FROM "employee_shift_assignments" a
      WHERE a."companyId" = ${companyId}
        AND a."date" >= ${since}
        AND a."timeIn"  IS NOT NULL
        AND a."timeOut" IS NOT NULL
        AND a."isRestDay" = false
        AND a."scheduleId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "work_schedules" ws
          WHERE ws."companyId" = ${companyId}
            AND ws."timeIn"  = a."timeIn"
            AND ws."timeOut" = a."timeOut"
            AND ws."isActive" = true
        )
      GROUP BY a."timeIn", a."timeOut"
      ORDER BY MAX(a."date") DESC, COUNT(*) DESC
      LIMIT 30
    `

    const shifts = rows.map(r => ({
      timeIn:  r.timeIn,
      timeOut: r.timeOut,
      usageCount: Number(r.usageCount),
      lastUsed:   r.lastUsed.toISOString(),
    }))

    return NextResponse.json({ shifts })
  } catch (err) {
    console.error('[GET /api/schedules/adhoc-shifts]', err)
    return NextResponse.json({ error: 'Failed to load ad-hoc shifts' }, { status: 500 })
  }
}
