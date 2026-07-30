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
import { logAudit } from '@/lib/audit'
import { Prisma } from '@prisma/client'
import { evaluateApprovalAction, type RequestFacts } from '@/lib/approvals/engine'
import { notifyAfterApprove } from '@/lib/approvals/notify'
import { periodsPerMonth, perCutoffDeduction, monthlyEquivalent } from '@/lib/cash-advance-limit'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN']

const trailOf = (v: unknown) => (Array.isArray(v) ? v : [])

const patchSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().max(500).optional().nullable(),
})

// HR/admins may adjust a PENDING request's terms before approving it.
const editSchema = z
  .object({
    amountRequested: z.number().positive().max(10_000_000).optional(),
    repaymentMonths: z.number().int().min(1).max(3).optional(),
    singleCutoff: z.boolean().optional(),
    reason: z.string().min(1).max(500).optional(),
  })
  .refine(
    d =>
      d.amountRequested !== undefined ||
      d.repaymentMonths !== undefined ||
      d.singleCutoff !== undefined ||
      d.reason !== undefined,
    { message: 'Provide at least one field to update' },
  )

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
  const { action, rejectionReason } = parsed.data

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
        link: '/portal/cash-advance',
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
  const months = Math.max(1, Math.min(3, existing.repaymentMonths))
  // Single-cutoff: repay the whole amount in ONE cutoff. Payroll deducts
  // monthlyAmortization / periodDivisor each cutoff, so setting the monthly
  // amortization to amount × cutoffs-per-month makes the per-cutoff deduction
  // equal the full amount (fully paid after one cutoff). Otherwise spread the
  // amount across the chosen months as before.
  const cycleCfg = existing.singleCutoff
    ? await prisma.payrollCycleConfig.findUnique({
        where: { companyId: ctx.companyId },
        select: { payFrequency: true },
      }).catch(() => null)
    : null
  const periodsPerMo = periodsPerMonth(cycleCfg?.payFrequency)
  const monthlyAmortization = existing.singleCutoff
    ? parseFloat((amount * periodsPerMo).toFixed(2))
    : parseFloat((amount / months).toFixed(2))

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
      body: existing.singleCutoff
        ? `Your ₱${amount.toLocaleString()} cash advance was approved. Repayment: ₱${amount.toLocaleString()} in a single cutoff.`
        : `Your ₱${amount.toLocaleString()} cash advance was approved. Repayment: ₱${monthlyAmortization.toLocaleString()}/month over ${months} month${months > 1 ? 's' : ''}.`,
      link: '/portal/cash-advance',
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

/**
 * PUT /api/cash-advance/[id] — HR/admin edits a PENDING request's terms
 * (amount, repayment months, reason) before approving it. Once approved the
 * loan is created from these values, so edits must happen while PENDING.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Only HR/admins can edit cash advance requests' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = editSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await prisma.cashAdvanceRequest.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true,
          rateType: true, basicSalary: true, dailyRate: true, hourlyRate: true,
        },
      },
      loan: { select: { id: true, balance: true, principalAmount: true, status: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Editable while PENDING, or after approval as long as repayment hasn't
  // started yet — no payroll deduction has ever been recorded against the
  // linked loan. Once a cutoff has deducted from it, the terms are locked.
  let editingApprovedLoanId: string | null = null
  if (existing.status === 'PENDING') {
    // editable
  } else if (existing.status === 'APPROVED' && existing.linkedLoanId) {
    const priorDeductions = await prisma.payslipLoanDeduction.count({
      where: { loanId: existing.linkedLoanId },
    })
    if (priorDeductions > 0) {
      return NextResponse.json(
        { error: 'Repayment has already started on this cash advance — its terms can no longer be edited.' },
        { status: 400 },
      )
    }
    editingApprovedLoanId = existing.linkedLoanId
  } else {
    return NextResponse.json(
      { error: `This ${existing.status.toLowerCase()} request can no longer be edited.` },
      { status: 400 },
    )
  }

  // Guardrail on the effective (post-edit) terms: the deduction from a single
  // cutoff must not exceed the employee's salary for that cutoff.
  const effAmount = parsed.data.amountRequested ?? Number(existing.amountRequested)
  const effMonths = parsed.data.repaymentMonths ?? existing.repaymentMonths
  const effSingleCutoff = parsed.data.singleCutoff ?? existing.singleCutoff
  const cycleCfg = await prisma.payrollCycleConfig.findUnique({
    where: { companyId: ctx.companyId },
    select: { payFrequency: true },
  }).catch(() => null)
  const periodsPerMo = periodsPerMonth(cycleCfg?.payFrequency)
  const monthlyIncome = monthlyEquivalent({
    rateType: existing.employee.rateType as 'MONTHLY' | 'DAILY' | 'HOURLY',
    basicSalary: Number(existing.employee.basicSalary),
    dailyRate: existing.employee.dailyRate ? Number(existing.employee.dailyRate) : null,
    hourlyRate: existing.employee.hourlyRate ? Number(existing.employee.hourlyRate) : null,
  })
  const perCutoffSalary = parseFloat((monthlyIncome / periodsPerMo).toFixed(2))
  const cutoffDeduction = perCutoffDeduction(effAmount, { singleCutoff: effSingleCutoff, repaymentMonths: effMonths }, periodsPerMo)
  if (cutoffDeduction > perCutoffSalary) {
    return NextResponse.json({
      error: `Per-cutoff deduction (₱${cutoffDeduction.toLocaleString()}) exceeds the employee's ₱${perCutoffSalary.toLocaleString()} salary for one cutoff. Lower the amount or spread it over more cutoffs.`,
    }, { status: 400 })
  }

  const data: Prisma.CashAdvanceRequestUpdateInput = {}
  if (parsed.data.amountRequested !== undefined) data.amountRequested = parsed.data.amountRequested
  if (parsed.data.repaymentMonths !== undefined) data.repaymentMonths = parsed.data.repaymentMonths
  if (parsed.data.singleCutoff !== undefined) data.singleCutoff = parsed.data.singleCutoff
  if (parsed.data.reason !== undefined) data.reason = parsed.data.reason

  // When editing an already-approved (not-yet-repaid) advance, recompute the
  // linked loan's terms so the payroll engine deducts the corrected amount.
  const newMonths = Math.max(1, Math.min(3, effMonths))
  const newMonthlyAmort = effSingleCutoff
    ? parseFloat((effAmount * periodsPerMo).toFixed(2))
    : parseFloat((effAmount / newMonths).toFixed(2))

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.cashAdvanceRequest.update({ where: { id }, data })
    if (editingApprovedLoanId) {
      await tx.employeeLoan.update({
        where: { id: editingApprovedLoanId },
        data: {
          principalAmount: effAmount,
          balance: effAmount, // no repayment yet → balance tracks principal
          monthlyAmortization: newMonthlyAmort,
          status: 'ACTIVE',
          endDate: null,
        },
      })
    }
    return u
  })

  const requesterName = `${existing.employee?.firstName ?? ''} ${existing.employee?.lastName ?? ''}`.trim() || 'an employee'
  logAudit(ctx, 'UPDATE', 'CashAdvance', id, {
    description: `Edited cash advance terms for ${requesterName}${editingApprovedLoanId ? ' (approved, pre-repayment — linked loan updated)' : ''}`,
    oldValues: {
      amountRequested: Number(existing.amountRequested),
      repaymentMonths: existing.repaymentMonths,
      singleCutoff: existing.singleCutoff,
      reason: existing.reason,
    },
    newValues: parsed.data,
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
