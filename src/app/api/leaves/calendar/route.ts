/**
 * GET /api/leaves/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&departmentId=...
 *
 * Returns approved (and optionally pending) leave requests that overlap the
 * given date range, plus the employee + leave type info needed to render a
 * month calendar grid showing who's out on which day.
 *
 * Auth: requireAuth + company-scoped. Employees only see their own leaves;
 * HR/COMPANY_ADMIN/SUPER_ADMIN see everyone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN', 'DEPARTMENT_HEAD']

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const sp = req.nextUrl.searchParams
  const fromStr = sp.get('from')
  const toStr = sp.get('to')
  const departmentId = sp.get('departmentId') || undefined
  const includePending = sp.get('includePending') === '1'

  if (!fromStr || !toStr) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  // Find leaves whose range overlaps [from, to] — leave.startDate <= to AND leave.endDate >= from
  const statusValues: Array<'APPROVED' | 'PENDING'> = includePending
    ? ['APPROVED', 'PENDING']
    : ['APPROVED']

  // Department-head scoping: only their managed department.
  const employeeFilter: Record<string, unknown> = { companyId }
  if (departmentId) employeeFilter.departmentId = departmentId
  if (ctx.role === 'DEPARTMENT_HEAD' && ctx.managedDepartmentId) {
    employeeFilter.departmentId = ctx.managedDepartmentId
  }

  // Non-HR employees: only their own.
  const isHr = HR_ROLES.includes(ctx.role)

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: { in: statusValues },
      startDate: { lte: to },
      endDate: { gte: from },
      employee: isHr ? employeeFilter : { companyId, userId: ctx.userId },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      status: true,
      reason: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { id: true, name: true } },
        },
      },
      leaveType: { select: { name: true, code: true, isWithPay: true } },
    },
    orderBy: { startDate: 'asc' },
  })

  const departments = isHr
    ? await prisma.department.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []

  return NextResponse.json({ leaves, departments })
}
