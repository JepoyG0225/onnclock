/**
 * Final Pay Calculator endpoint.
 *
 * POST /api/final-pay
 *   Body: {
 *     employeeId: string
 *     lastWorkingDay: 'YYYY-MM-DD'
 *     reason: SeparationReason
 *     unusedLeaveDays?: number       // pulled from balances if omitted
 *     unpaidWorkedDays?: number
 *     outstandingLoans?: number      // pulled from active loans if omitted
 *     cashAdvanceBalance?: number    // pulled from approved cash advances if omitted
 *     unreturnedAssetsCost?: number
 *     additionalTaxableEarnings?: number
 *     additionalNonTaxableEarnings?: number
 *   }
 *
 * Returns a full FinalPayResult plus the employee/company info needed
 * to render a printable Final Pay statement.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { computeFinalPay, type SeparationReason } from '@/lib/payroll/final-pay'
import { z } from 'zod'

export const runtime = 'nodejs'

const ReasonEnum = z.enum([
  'RESIGNATION',
  'TERMINATION_JUST_CAUSE',
  'TERMINATION_AUTHORIZED',
  'REDUNDANCY',
  'RETRENCHMENT',
  'CLOSURE_NO_LOSSES',
  'DISEASE',
  'RETIREMENT',
  'END_OF_CONTRACT',
])

const bodySchema = z.object({
  employeeId:        z.string(),
  lastWorkingDay:    z.string(),  // YYYY-MM-DD
  reason:            ReasonEnum,
  unusedLeaveDays:   z.number().nonnegative().optional(),
  unpaidWorkedDays:  z.number().nonnegative().optional(),
  outstandingLoans:  z.number().nonnegative().optional(),
  cashAdvanceBalance: z.number().nonnegative().optional(),
  unreturnedAssetsCost: z.number().nonnegative().optional(),
  additionalTaxableEarnings:    z.number().nonnegative().optional(),
  additionalNonTaxableEarnings: z.number().nonnegative().optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const roleGate = requireAdminOrHR(ctx)
  if (roleGate) return roleGate

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const input  = parsed.data
  const lastDay = new Date(input.lastWorkingDay)
  if (isNaN(lastDay.getTime())) {
    return NextResponse.json({ error: 'Invalid lastWorkingDay' }, { status: 400 })
  }
  const year = lastDay.getFullYear()
  const yearStart = new Date(year, 0, 1)
  const yearEnd   = new Date(year, 11, 31, 23, 59, 59)

  // ── Pull employee ─────────────────────────────────────────────────────────
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: ctx.companyId },
    select: {
      id: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      middleName: true,
      basicSalary: true,
      hireDate: true,
      department: { select: { name: true } },
      position:   { select: { title: true } },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // ── YTD aggregates from payslips ─────────────────────────────────────────
  const payslips = await prisma.payslip.findMany({
    where: {
      employeeId: input.employeeId,
      payrollRun: { payDate: { gte: yearStart, lte: yearEnd }, companyId: ctx.companyId },
    },
    select: {
      basicSalary: true,
      taxableIncome: true,
      withholdingTax: true,
      thirteenthMonthContribution: true,
    },
  })
  const basicEarnedYTD     = payslips.reduce((s, p) => s + p.basicSalary.toNumber(),          0)
  const taxableIncomeYTD   = payslips.reduce((s, p) => s + p.taxableIncome.toNumber(),         0)
  const taxWithheldYTD     = payslips.reduce((s, p) => s + p.withholdingTax.toNumber(),        0)
  const thirteenthPaidYTD  = payslips.reduce((s, p) => s + p.thirteenthMonthContribution.toNumber(), 0)

  // ── Leave balance (auto-fill if not provided) ─────────────────────────────
  let unusedLeaveDays = input.unusedLeaveDays
  if (unusedLeaveDays == null) {
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId: input.employeeId, year },
      include: { leaveType: { select: { isPaidOut: true } } },
    })
    unusedLeaveDays = balances
      .filter(b => b.leaveType.isPaidOut)
      .reduce((s, b) => {
        const entitled = b.entitled.toNumber()
        const used     = b.used.toNumber()
        return s + Math.max(0, entitled - used)
      }, 0)
  }

  // ── Outstanding loans (auto-fill) ─────────────────────────────────────────
  let outstandingLoans = input.outstandingLoans
  if (outstandingLoans == null) {
    const loans = await prisma.employeeLoan.findMany({
      where: { employeeId: input.employeeId, status: 'ACTIVE' },
      select: { balance: true },
    })
    outstandingLoans = loans.reduce((s, l) => s + l.balance.toNumber(), 0)
  }

  // ── Outstanding cash-advance balance ──────────────────────────────────────
  let cashAdvanceBalance = input.cashAdvanceBalance
  if (cashAdvanceBalance == null) {
    try {
      const cas = await prisma.cashAdvanceRequest.findMany({
        where: {
          employeeId: input.employeeId,
          status: 'APPROVED',
          loan: { status: 'ACTIVE' },
        },
        include: { loan: { select: { balance: true } } },
      })
      cashAdvanceBalance = cas.reduce((s, ca) => s + (ca.loan?.balance.toNumber() ?? 0), 0)
      // Don't double-count: cash-advance balances are already in EmployeeLoan
      // (CASH_ADVANCE type) which we summed above. Zero this so we don't deduct twice.
      cashAdvanceBalance = 0
    } catch {
      // Cash advance table may not exist on companies not yet migrated.
      cashAdvanceBalance = 0
    }
  }

  // ── Compute ───────────────────────────────────────────────────────────────
  const result = computeFinalPay({
    employeeId:                  employee.id,
    monthlySalary:               employee.basicSalary.toNumber(),
    hireDate:                    employee.hireDate,
    lastWorkingDay:              lastDay,
    reason:                      input.reason as SeparationReason,
    thirteenthMonthAlreadyPaid:  thirteenthPaidYTD,
    basicEarnedYTD:              basicEarnedYTD || (employee.basicSalary.toNumber() * 1), // fallback in case no payslips
    unusedLeaveDays,
    unpaidWorkedDays:            input.unpaidWorkedDays,
    taxWithheldYTD,
    taxableIncomeYTD,
    outstandingLoans,
    cashAdvanceBalance,
    unreturnedAssetsCost:        input.unreturnedAssetsCost,
    additionalTaxableEarnings:   input.additionalTaxableEarnings,
    additionalNonTaxableEarnings: input.additionalNonTaxableEarnings,
  })

  return NextResponse.json({
    employee: {
      id: employee.id,
      employeeNo: employee.employeeNo,
      name: `${employee.firstName} ${employee.middleName ?? ''} ${employee.lastName}`.replace(/\s+/g, ' ').trim(),
      department: employee.department?.name ?? null,
      position:   employee.position?.title ?? null,
      hireDate:   employee.hireDate,
      monthlySalary: employee.basicSalary.toNumber(),
    },
    snapshot: {
      lastWorkingDay: input.lastWorkingDay,
      reason: input.reason,
      basicEarnedYTD,
      taxableIncomeYTD,
      taxWithheldYTD,
      thirteenthPaidYTD,
      unusedLeaveDays,
      outstandingLoans,
      cashAdvanceBalance,
    },
    result,
  })
}
