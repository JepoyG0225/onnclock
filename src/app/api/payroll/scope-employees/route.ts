/**
 * GET /api/payroll/scope-employees
 *
 * Returns the active-employee list used by the "New Payroll Run" form's
 * scope picker. Slim payload: id / employeeNo / first+last / employmentType
 * / department / position. The form lets the user either filter by
 * employment-type group or hand-pick individuals.
 *
 * Sorted by lastName so the picker is alphabetical without extra work on
 * the client.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employees = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    select: {
      id: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      employmentType: true,
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(
    { employees },
    {
      // Private cache — the picker is opened repeatedly during a normal
      // HR session; reuse the response across quick mode-toggles. Invalidated
      // automatically when a new employee is added because the picker mounts
      // fresh on each visit to /payroll/new.
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    },
  )
}
