/**
 * Cash Advance request — individual operations.
 *
 * GET    /api/cash-advance/[id]   Fetch one
 * PATCH  /api/cash-advance/[id]   HR approves or rejects
 *   Body: { action: 'APPROVE' | 'REJECT', rejectionReason?: string }
 *   On APPROVE we create the matching EmployeeLoan (type CASH_ADVANCE) so the
 *   existing payroll loan-deduction logic handles the repayment automatically.
 * DELETE /api/cash-advance/[id]   Employee cancels their own pending request
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN']

const patchSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().max(500).optional().nullable(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const request = await prisma.cashAdvanceRequest.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true, employeeNo: true,
          basicSalary: true, userId: true,
          department: { select: { name: true } },
        },
      },
      loan: { select: { id: true, balance: true, status: true, monthlyAmortization: true } },
    },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ request })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Only HR can approve or reject cash advance requests' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }
  const { action, rejectionReason } = parsed.data

  const existing = await prisma.cashAdvanceRequest.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true, userId: true,
          basicSalary: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: `Request is already ${existing.status.toLowerCase()}` }, { status: 400 })
  }

  if (action === 'REJECT') {
    const updated = await prisma.cashAdvanceRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: ctx.userId,
        approvedAt: new Date(),
        rejectionReason: rejectionReason ?? null,
      },
    })

    if (existing.employee.userId) {
      await createNotification({
        companyId: ctx.companyId,
        userId: existing.employee.userId,
        type: 'GENERIC',
        title: 'Cash advance rejected',
        body: rejectionReason
          ? `Your ₱${Number(existing.amountRequested).toLocaleString()} request was rejected: ${rejectionReason}`
          : `Your ₱${Number(existing.amountRequested).toLocaleString()} cash advance request was rejected.`,
        link: '/portal/cash-advance',
      })
    }
    return NextResponse.json({ request: updated })
  }

  // ── APPROVE ───────────────────────────────────────────────────────────────
  // Create the matching EmployeeLoan so payroll deductions automatically pull
  // the amortization each cutoff. The cash-advance row is updated to point at
  // it via linkedLoanId.
  const amount = Number(existing.amountRequested)
  const months = Math.max(1, Math.min(3, existing.repaymentMonths))
  const monthlyAmortization = parseFloat((amount / months).toFixed(2))

  const updated = await prisma.$transaction(async (tx) => {
    const loan = await tx.employeeLoan.create({
      data: {
        companyId:           ctx.companyId,
        employeeId:          existing.employeeId,
        loanType:            'CASH_ADVANCE',
        principalAmount:     amount,
        balance:             amount,
        monthlyAmortization,
        startDate:           new Date(),
        status:              'ACTIVE',
        notes:               `Auto-created from cash advance request ${existing.id}`,
      },
    })

    return tx.cashAdvanceRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: ctx.userId,
        approvedAt: new Date(),
        rejectionReason: null,
        linkedLoanId: loan.id,
      },
      include: {
        loan: { select: { id: true, balance: true, monthlyAmortization: true, status: true } },
      },
    })
  })

  if (existing.employee.userId) {
    await createNotification({
      companyId: ctx.companyId,
      userId: existing.employee.userId,
      type: 'GENERIC',
      title: 'Cash advance approved',
      body: `Your ₱${amount.toLocaleString()} cash advance was approved. Repayment: ₱${monthlyAmortization.toLocaleString()}/month over ${months} month${months > 1 ? 's' : ''}.`,
      link: '/portal/cash-advance',
    })
  }

  return NextResponse.json({ request: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const existing = await prisma.cashAdvanceRequest.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { employee: { select: { userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'Only pending requests can be cancelled' }, { status: 400 })
  }

  const isHR = HR_ROLES.includes(ctx.role)
  const isOwner = existing.employee.userId === ctx.userId
  if (!isHR && !isOwner) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const updated = await prisma.cashAdvanceRequest.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })
  return NextResponse.json({ request: updated })
}
