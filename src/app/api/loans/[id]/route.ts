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

  const existing = await prisma.employeeLoan.findFirst({ where: { id, companyId: ctx.companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const revert = body.action === 'REVERT_PAID'
  const markingPaid = body.status === 'FULLY_PAID'
  if (markingPaid || revert) {
    const savedBalance = existing.manualPaidBalance
    if (markingPaid && (existing.status !== 'ACTIVE' || Number(existing.balance) <= 0)) {
      return NextResponse.json({ error: 'Only active loans with an outstanding balance can be marked paid.' }, { status: 409 })
    }
    if (revert && (existing.status !== 'FULLY_PAID' || savedBalance === null)) {
      return NextResponse.json({ error: 'No saved manual-payment balance is available to restore.' }, { status: 409 })
    }
    if (body.confirmed !== true || Number(body.expectedBalance) !== Number(revert ? savedBalance : existing.balance)) {
      return NextResponse.json({ error: 'Confirm the current balance before continuing. Refresh if it has changed.' }, { status: 409 })
    }
    const data = revert
      ? { status: LoanStatus.ACTIVE, balance: savedBalance!, manualPaidBalance: null }
      : { status: LoanStatus.FULLY_PAID, balance: 0, manualPaidBalance: existing.balance }
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.employeeLoan.updateMany({
        where: { id, companyId: ctx.companyId, updatedAt: existing.updatedAt, status: existing.status }, data,
      })
      if (!updated.count) return false
      await tx.auditLog.create({ data: {
        companyId: ctx.companyId, userId: ctx.userId, action: 'UPDATE', entity: 'EmployeeLoan', entityId: id,
        oldValues: { status: existing.status, balance: Number(existing.balance) },
        newValues: { status: data.status, balance: Number(data.balance), action: revert ? 'REVERT_PAID' : 'MARK_PAID', savedBalance: Number(revert ? savedBalance : existing.balance) },
      } })
      return true
    })
    return result ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Loan changed. Refresh and try again.' }, { status: 409 })
  }
  if (body.action !== undefined) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (existing.status === 'FULLY_PAID') return NextResponse.json({ error: 'Use Revert payment to restore a manually paid loan.' }, { status: 409 })
  const updateData: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!LOAN_STATUSES.includes(body.status)) return NextResponse.json({ error: 'Unknown loan status' }, { status: 400 })
    updateData.status = body.status
  }
  if (body.notes !== undefined) updateData.notes = body.notes
  for (const field of ['monthlyAmortization', 'balance'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] < 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
      updateData[field] = body[field]
    }
  }
  const loan = await prisma.employeeLoan.updateMany({
    where: { id, companyId: ctx.companyId, updatedAt: existing.updatedAt }, data: updateData,
  })
  if (!loan.count) return NextResponse.json({ error: 'Loan changed. Refresh and try again.' }, { status: 409 })
  return NextResponse.json(loan)
}
