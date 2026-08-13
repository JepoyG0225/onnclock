import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { LoanStatus } from '@prisma/client'

const LOAN_STATUSES: string[] = Object.values(LoanStatus)

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Same employee scoping as the list route: without it, an employee could read
  // any colleague's loan — amount, balance, deduction history — just by knowing
  // or guessing an id, since the filter was company-wide only.
  let selfEmployeeId: string | null = null
  if (ctx.role === 'EMPLOYEE') {
    const self = await prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId },
      select: { id: true },
    })
    if (!self) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    selfEmployeeId = self.id
  }

  const loan = await prisma.employeeLoan.findFirst({
    where: {
      id,
      companyId: ctx.companyId,
      ...(selfEmployeeId ? { employeeId: selfEmployeeId } : {}),
    },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeNo: true } },
      deductions: { orderBy: { createdAt: 'desc' }, take: 24 },
    },
  })

  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(loan)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Editing a loan is an admin action. This route only had requireAuth(), and
  // it accepts `status` and `balance` — so any signed-in employee could approve
  // their own pending request, or set the outstanding balance of their loan to
  // zero and erase what they owe. Employees file requests (POST /api/loans) and
  // read their own (GET); they do not get to change one.
  if (!(await ctxHasPermission(ctx, 'loans:write'))) {
    return NextResponse.json({ error: 'You do not have permission to edit loans.' }, { status: 403 })
  }

  const body = await req.json()

  // Build update payload — only include defined fields
  const updateData: Record<string, unknown> = {}
  if (body.status !== undefined) {
    // Validate against the enum. An unrecognised string used to reach Prisma
    // and surface as an opaque 500 rather than a useful message.
    if (!LOAN_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Unknown loan status: ${body.status}` }, { status: 400 })
    }
    updateData.status = body.status
  }
  if (body.notes               !== undefined) updateData.notes               = body.notes
  if (body.monthlyAmortization !== undefined) updateData.monthlyAmortization = body.monthlyAmortization
  if (body.balance             !== undefined) updateData.balance             = body.balance

  const loan = await prisma.employeeLoan.updateMany({
    where: { id, companyId: ctx.companyId },
    data: updateData,
  })

  return NextResponse.json(loan)
}
