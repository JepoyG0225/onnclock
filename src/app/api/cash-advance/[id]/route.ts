/**
 * Cash Advance request — individual operations.
 *
 * GET    /api/cash-advance/[id]   Fetch one
 * PATCH  /api/cash-advance/[id]   HR approves or rejects
 *   Body: { action: 'APPROVE' | 'REJECT' | 'UPDATE_TERMS',
 *           rejectionReason?: string, repaymentMonths?: 1..3 }
 *   On APPROVE we create the matching EmployeeLoan (type CASH_ADVANCE) so the
 *   existing payroll loan-deduction logic handles the repayment automatically.
 * DELETE /api/cash-advance/[id]   Employee cancels their own pending request
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { logAudit } from '@/lib/audit'
import { getPeriodDivisor } from '@/lib/payroll/cutoffs'
import { Prisma } from '@prisma/client'
import { evaluateApprovalAction, type RequestFacts } from '@/lib/approvals/engine'
import { notifyAfterApprove } from '@/lib/approvals/notify'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN']

const trailOf = (v: unknown) => (Array.isArray(v) ? v : [])

const patchSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'UPDATE_TERMS']),
  /** UPDATE_TERMS only: new repayment length, 1-3 months. */
  repaymentMonths: z.number().int().min(1).max(3).optional(),
  /** UPDATE_TERMS only: repay in N cutoffs instead. Takes precedence. */
  repaymentCutoffs: z.number().int().min(1).max(6).optional(),
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
  // Authority is chain-driven when a workflow exists; otherwise legacy HR gate.
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }
  const { action, rejectionReason, repaymentMonths, repaymentCutoffs } = parsed.data



  const existing = await prisma.cashAdvanceRequest.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true, userId: true,
          basicSalary: true, departmentId: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Change repayment terms ────────────────────────────────────────────────
  // Allowed while PENDING and after APPROVAL. Once approved the request has a
  // linked EmployeeLoan doing the actual deducting, so the new amortisation has
  // to be written there too or the change would be cosmetic.
  //
  // The amortisation is recomputed from the REMAINING BALANCE, not the original
  // amount: re-spreading the full principal over the new term would re-charge
  // what has already been deducted.
  if (action === 'UPDATE_TERMS') {
    if (!repaymentMonths && !repaymentCutoffs) {
      return NextResponse.json(
        { error: 'repaymentMonths or repaymentCutoffs is required' }, { status: 400 },
      )
    }
    if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `Cannot change terms on a ${existing.status.toLowerCase()} request.` },
        { status: 400 },
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      if (existing.linkedLoanId) {
        const loan = await tx.employeeLoan.findUnique({
          where: { id: existing.linkedLoanId },
          select: { balance: true, status: true },
        })
        if (loan && loan.status === 'ACTIVE') {
          const remaining = Number(loan.balance)
          // Recomputed from the REMAINING balance, so shortening the term never
          // re-charges what has already been deducted.
          const newAmort = repaymentCutoffs
            ? parseFloat(((remaining * (await getPeriodDivisor(ctx.companyId))) / repaymentCutoffs).toFixed(2))
            : parseFloat((remaining / (repaymentMonths ?? 1)).toFixed(2))
          await tx.employeeLoan.update({
            where: { id: existing.linkedLoanId },
            data: { monthlyAmortization: newAmort },
          })
        }
      }
      return tx.cashAdvanceRequest.update({
        where: { id },
        data: {
          ...(repaymentMonths ? { repaymentMonths } : {}),
          repaymentCutoffs: repaymentCutoffs ?? null,
        },
      })
    })

    logAudit(ctx, 'UPDATE', 'CashAdvance', id, {
      description: `Changed repayment term to ${repaymentMonths} month${repaymentMonths === 1 ? '' : 's'}`,
    })

    return NextResponse.json({ request: result })
  }
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: `Request is already ${existing.status.toLowerCase()}` }, { status: 400 })
  }

  const requesterDepartmentId = existing.employee?.departmentId ?? null
  const requesterName = `${existing.employee?.firstName ?? ''} ${existing.employee?.lastName ?? ''}`.trim() || 'An employee'
  const decision = await evaluateApprovalAction({
    companyId: ctx.companyId,
    type: 'CASH_ADVANCE',
    requesterDepartmentId,
    requesterEmployeeId: existing.employeeId,
    facts: { amount: Number(existing.amountRequested), departmentId: requesterDepartmentId ?? '' } as RequestFacts,
    currentLevel: existing.approvalLevel ?? 0,
    actorUserId: ctx.userId,
    action: action === 'APPROVE' ? 'approve' : 'reject',
    notes: rejectionReason ?? null,
  })

  if (decision.usedWorkflow) {
    if (!decision.authorized) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
  } else if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Only HR can approve or reject cash advance requests' }, { status: 403 })
  }

  const newTrail = [...trailOf(existing.approvalTrail), decision.trailEntry] as Prisma.InputJsonValue

  if (action === 'REJECT') {
    const updated = await prisma.cashAdvanceRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: ctx.userId,
        approvedAt: new Date(),
        rejectionReason: rejectionReason ?? null,
        approvalLevel: decision.nextLevel,
        approvalTrail: newTrail,
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
        link: '/portal/loans?tab=cash-advance',
      })
    }
    return NextResponse.json({ request: updated })
  }

  // ── APPROVE ───────────────────────────────────────────────────────────────
  // Intermediate approval in a multi-step chain: advance the level, keep the
  // request PENDING, and DON'T create the loan yet — that only happens on the
  // final approval.
  if (decision.usedWorkflow && !decision.isFinal) {
    const updated = await prisma.cashAdvanceRequest.update({
      where: { id },
      data: { approvalLevel: decision.nextLevel, approvalTrail: newTrail },
    })
    if (decision.plan) {
      await notifyAfterApprove({
        plan: decision.plan,
        nextLevel: decision.nextLevel,
        isFinal: false,
        ctx: { companyId: ctx.companyId, requesterEmployeeId: existing.employeeId, requesterDepartmentId, link: '/cash-advance', vars: { requestType: 'Cash Advance', requesterName } },
        nextApproverTitle: 'Cash advance awaiting your approval',
        nextApproverBody: `${requesterName} · ₱${Number(existing.amountRequested).toLocaleString()}`,
      })
    }
    return NextResponse.json({ request: updated })
  }

  // Final approval — create the matching EmployeeLoan so payroll deductions
  // automatically pull the amortization each cutoff. The cash-advance row is
  // updated to point at it via linkedLoanId.
  const amount = Number(existing.amountRequested)

  // A cutoff-based term wins over the month-based one when the employee chose
  // it. Payroll computes `monthlyAmortization / periodDivisor` and caps that at
  // the remaining balance, so to clear the advance in N cutoffs the stored
  // monthly figure has to be amount x divisor / N. For N = 1 that means the
  // whole amount comes out of the next payslip and nothing after.
  let monthlyAmortization: number
  let termLabel: string
  if (existing.repaymentCutoffs && existing.repaymentCutoffs > 0) {
    const divisor = await getPeriodDivisor(ctx.companyId)
    const cutoffs = existing.repaymentCutoffs
    monthlyAmortization = parseFloat(((amount * divisor) / cutoffs).toFixed(2))
    // Per-cutoff is the figure that lands on a payslip, so quote that rather
    // than the stored monthly number, which is deliberately inflated here.
    const perCutoff = parseFloat((amount / cutoffs).toFixed(2))
    termLabel = `₱${perCutoff.toLocaleString()} per cutoff over ${cutoffs} cutoff${cutoffs > 1 ? 's' : ''}`
  } else {
    const months = Math.max(1, Math.min(3, existing.repaymentMonths))
    monthlyAmortization = parseFloat((amount / months).toFixed(2))
    termLabel = `₱${monthlyAmortization.toLocaleString()}/month over ${months} month${months > 1 ? 's' : ''}`
  }

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
        approvalLevel: decision.nextLevel,
        approvalTrail: newTrail,
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
      body: `Your ₱${amount.toLocaleString()} cash advance was approved. Repayment: ${termLabel}.`,
      link: '/portal/loans?tab=cash-advance',
    })
  }

  if (decision.plan) {
    await notifyAfterApprove({
      plan: decision.plan,
      nextLevel: decision.nextLevel,
      isFinal: true,
      ctx: { companyId: ctx.companyId, requesterEmployeeId: existing.employeeId, requesterDepartmentId, link: '/cash-advance', vars: { requestType: 'Cash Advance', requesterName } },
      nextApproverTitle: '', nextApproverBody: '',
    })
  }

  logAudit(ctx, action === 'APPROVE' ? 'APPROVE' : 'REJECT', 'CashAdvance', id, {
    description: `${action === 'APPROVE' ? 'Approved' : 'Rejected'} ₱${Number(existing.amountRequested).toLocaleString()} cash advance for ${requesterName}`,
    newValues: { status: updated.status },
  }).catch(() => {})

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
  logAudit(ctx, 'CANCEL', 'CashAdvance', id, {
    description: `Cancelled cash advance request ₱${Number(existing.amountRequested).toLocaleString()}`,
  }).catch(() => {})
  return NextResponse.json({ request: updated })
}
