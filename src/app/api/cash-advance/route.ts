/**
 * Cash Advance request endpoints.
 *
 * GET  /api/cash-advance              List requests
 *   - HR roles see all requests in their company
 *   - Employees see only their own (or pass ?own=true to force)
 *   - ?status=PENDING|APPROVED|REJECTED|CANCELLED filters by status
 *
 * POST /api/cash-advance              Employee files a new request
 *   - amountRequested capped server-side at 30% of monthly basic salary
 *   - repaymentMonths must be 1..3
 *
 * Approval/rejection happens at /api/cash-advance/[id].
 *
 * Cash Advance is available on Basic + Pro plans (no Pro gate here).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { computeCashAdvanceLimit } from '@/lib/cash-advance-limit'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN']

const createSchema = z.object({
  amountRequested: z.number().positive(),
  reason: z.string().min(3).max(500),
  repaymentMonths: z.number().int().min(1).max(3).default(1),
  // HR can file on behalf of an employee
  employeeId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { id: true },
  })
  const ownEmployeeId = employee?.id ?? null

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status') || undefined
  const ownOnly  = searchParams.get('own') === 'true'
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit    = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))

  const isHR = HR_ROLES.includes(ctx.role ?? '')

  if (ownOnly && !ownEmployeeId) {
    return NextResponse.json({ requests: [], total: 0, page, limit })
  }

  const where: Record<string, unknown> = {
    companyId: ctx.companyId,
    ...(status && { status }),
    ...(isHR && !ownOnly ? {} : { employeeId: ownEmployeeId }),
  }

  const [requests, total] = await Promise.all([
    prisma.cashAdvanceRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNo: true,
            rateType: true,
            basicSalary: true,
            dailyRate: true,
            hourlyRate: true,
            department: { select: { name: true } },
          },
        },
        loan: { select: { id: true, balance: true, status: true, monthlyAmortization: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.cashAdvanceRequest.count({ where }),
  ])

  // For employee self-service requests, also surface their CURRENT cap so
  // the portal can render "you may request up to ₱X" without a 2nd round-trip.
  let myLimit = null
  if (ownEmployeeId && ownOnly) {
    const me = await prisma.employee.findUnique({
      where: { id: ownEmployeeId },
      select: { id: true, rateType: true, basicSalary: true, dailyRate: true, hourlyRate: true },
    })
    if (me) {
      myLimit = await computeCashAdvanceLimit({
        id:          me.id,
        rateType:    me.rateType,
        basicSalary: Number(me.basicSalary),
        dailyRate:   me.dailyRate ? Number(me.dailyRate) : null,
        hourlyRate:  me.hourlyRate ? Number(me.hourlyRate) : null,
      })
    }
  }

  return NextResponse.json({ requests, total, page, limit, myLimit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { amountRequested, reason, repaymentMonths, employeeId: targetEmployeeId } = parsed.data
  const isHR = HR_ROLES.includes(ctx.role ?? '')

  // Resolve who the request is for.
  let employeeId: string | null = null
  if (targetEmployeeId && isHR) {
    const target = await prisma.employee.findFirst({
      where: { id: targetEmployeeId, companyId: ctx.companyId },
      select: { id: true },
    })
    if (!target) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    employeeId = target.id
  } else {
    const own = await prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId },
      select: { id: true },
    })
    employeeId = own?.id ?? null
  }
  if (!employeeId) {
    return NextResponse.json({ error: 'No employee profile linked to this account' }, { status: 400 })
  }

  // Load the employee to validate against monthly-equivalent income
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      rateType: true,
      basicSalary: true,
      dailyRate: true,
      hourlyRate: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  })
  if (!employee || !employee.isActive) {
    return NextResponse.json({ error: 'Employee not found or inactive' }, { status: 404 })
  }

  // Resolve the cap properly:
  //   - convert basicSalary to monthly equivalent (DAILY × 22, HOURLY × 8 × 22)
  //   - subtract any outstanding cash-advance balance so cumulative debt
  //     against the company never exceeds 30% of monthly income
  const limit = await computeCashAdvanceLimit({
    id:          employee.id,
    rateType:    employee.rateType,
    basicSalary: Number(employee.basicSalary),
    dailyRate:   employee.dailyRate ? Number(employee.dailyRate) : null,
    hourlyRate:  employee.hourlyRate ? Number(employee.hourlyRate) : null,
  })

  if (amountRequested > limit.available) {
    const reason = limit.outstanding > 0
      ? `Cap is 30% of monthly income (₱${limit.rawCap.toLocaleString()}) minus your outstanding cash-advance balance (₱${limit.outstanding.toLocaleString()}) = max ₱${limit.available.toLocaleString()}`
      : `Cap is 30% of monthly income (max ₱${limit.available.toLocaleString()})`
    return NextResponse.json({ error: reason }, { status: 400 })
  }

  // Prevent overlapping pending requests (one outstanding at a time)
  const pendingCount = await prisma.cashAdvanceRequest.count({
    where: { employeeId, status: 'PENDING' },
  })
  if (pendingCount > 0) {
    return NextResponse.json({
      error: 'You already have a pending cash advance request. Please wait for it to be reviewed.',
    }, { status: 400 })
  }

  const request = await prisma.cashAdvanceRequest.create({
    data: {
      companyId:       ctx.companyId,
      employeeId,
      amountRequested,
      reason,
      repaymentMonths,
      status:          'PENDING',
    },
  })

  // Notify HR/admin users in the company so they see the new request
  try {
    const admins = await prisma.userCompany.findMany({
      where: {
        companyId: ctx.companyId,
        role: { in: ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'] },
      },
      select: { userId: true },
    })
    await Promise.all(
      admins.map((a) =>
        createNotification({
          companyId: ctx.companyId,
          userId: a.userId,
          type: 'GENERIC',
          title: 'New cash advance request',
          body: `${employee.firstName} ${employee.lastName} requested ₱${amountRequested.toLocaleString()}`,
          link: '/cash-advance',
        }),
      ),
    )
  } catch {
    // non-fatal
  }

  return NextResponse.json({ request }, { status: 201 })
}
