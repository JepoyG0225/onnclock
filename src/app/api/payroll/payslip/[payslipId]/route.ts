import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/payroll/payslip/[payslipId]
// Allows HR/admin to manually adjust earnings and deductions on a computed payslip.
// Blocked when the parent payroll run is LOCKED or APPROVED.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ payslipId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { payslipId } = await params

  // Load payslip + run to check ownership and lock state
  const payslip = await prisma.payslip.findFirst({
    where: { id: payslipId, payrollRun: { companyId: ctx.companyId } },
    select: {
      id: true,
      payrollRunId: true,
      sssEc: true,
      sssLoanDeduction: true,
      pagibigLoan: true,
      companyLoan: true,
      riceAllowance: true,
      clothingAllowance: true,
      medicalAllowance: true,
      otherAllowances: true,
      payrollRun: { select: { status: true } },
    },
  })

  if (!payslip) {
    return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  }
  if (payslip.payrollRun.status === 'LOCKED' || payslip.payrollRun.status === 'APPROVED') {
    return NextResponse.json({ error: 'Cannot edit a locked or approved payroll run' }, { status: 400 })
  }

  const body = await req.json()
  const n = (v: unknown) => (v != null && v !== '' ? Number(v) : null)

  // Only allow editing these fields
  const basicSalary        = n(body.basicSalary)
  const regularOtAmount    = n(body.regularOtAmount)
  const restDayOtAmount    = n(body.restDayOtAmount)
  const holidayOtAmount    = n(body.holidayOtAmount)
  const nightDiffAmount    = n(body.nightDiffAmount)
  const holidayPayAmount   = n(body.holidayPayAmount)
  const otherEarnings      = n(body.otherEarnings)
  const sssEmployee        = n(body.sssEmployee)
  const philhealthEmployee = n(body.philhealthEmployee)
  const pagibigEmployee    = n(body.pagibigEmployee)
  const withholdingTax     = n(body.withholdingTax)
  const lateDeduction      = n(body.lateDeduction)
  const undertimeDeduction = n(body.undertimeDeduction)
  const absenceDeduction   = n(body.absenceDeduction)
  const otherDeductions    = n(body.otherDeductions)

  // Build data object — only include fields that were provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}
  if (basicSalary        != null) data.basicSalary        = basicSalary
  if (regularOtAmount    != null) data.regularOtAmount    = regularOtAmount
  if (restDayOtAmount    != null) data.restDayOtAmount    = restDayOtAmount
  if (holidayOtAmount    != null) data.holidayOtAmount    = holidayOtAmount
  if (nightDiffAmount    != null) data.nightDiffAmount    = nightDiffAmount
  if (holidayPayAmount   != null) data.holidayPayAmount   = holidayPayAmount
  if (otherEarnings      != null) data.otherEarnings      = otherEarnings
  if (sssEmployee        != null) data.sssEmployee        = sssEmployee
  if (philhealthEmployee != null) data.philhealthEmployee = philhealthEmployee
  if (pagibigEmployee    != null) data.pagibigEmployee    = pagibigEmployee
  if (withholdingTax     != null) data.withholdingTax     = withholdingTax
  if (lateDeduction      != null) data.lateDeduction      = lateDeduction
  if (undertimeDeduction != null) data.undertimeDeduction = undertimeDeduction
  if (absenceDeduction   != null) data.absenceDeduction   = absenceDeduction
  if (otherDeductions    != null) data.otherDeductions    = otherDeductions

  // Recompute grossPay and totals from the merged values
  const cur = await prisma.payslip.findUniqueOrThrow({
    where: { id: payslipId },
    select: {
      basicSalary: true, regularOtAmount: true, restDayOtAmount: true,
      holidayOtAmount: true, nightDiffAmount: true, holidayPayAmount: true,
      riceAllowance: true, clothingAllowance: true, medicalAllowance: true,
      otherAllowances: true, otherEarnings: true,
      sssEmployee: true, sssEc: true, philhealthEmployee: true,
      pagibigEmployee: true, withholdingTax: true,
      sssLoanDeduction: true, pagibigLoan: true, companyLoan: true,
      lateDeduction: true, undertimeDeduction: true, absenceDeduction: true,
      otherDeductions: true,
    },
  })

  // Merge current values with incoming edits
  const merged = {
    basicSalary:        data.basicSalary        ?? cur.basicSalary.toNumber(),
    regularOtAmount:    data.regularOtAmount    ?? cur.regularOtAmount.toNumber(),
    restDayOtAmount:    data.restDayOtAmount    ?? cur.restDayOtAmount.toNumber(),
    holidayOtAmount:    data.holidayOtAmount    ?? cur.holidayOtAmount.toNumber(),
    nightDiffAmount:    data.nightDiffAmount    ?? cur.nightDiffAmount.toNumber(),
    holidayPayAmount:   data.holidayPayAmount   ?? cur.holidayPayAmount.toNumber(),
    riceAllowance:      cur.riceAllowance.toNumber(),
    clothingAllowance:  cur.clothingAllowance.toNumber(),
    medicalAllowance:   cur.medicalAllowance.toNumber(),
    otherAllowances:    cur.otherAllowances.toNumber(),
    otherEarnings:      data.otherEarnings      ?? cur.otherEarnings.toNumber(),
    sssEmployee:        data.sssEmployee        ?? cur.sssEmployee.toNumber(),
    sssEc:              cur.sssEc.toNumber(),
    philhealthEmployee: data.philhealthEmployee ?? cur.philhealthEmployee.toNumber(),
    pagibigEmployee:    data.pagibigEmployee    ?? cur.pagibigEmployee.toNumber(),
    withholdingTax:     data.withholdingTax     ?? cur.withholdingTax.toNumber(),
    sssLoanDeduction:   cur.sssLoanDeduction.toNumber(),
    pagibigLoan:        cur.pagibigLoan.toNumber(),
    companyLoan:        cur.companyLoan.toNumber(),
    lateDeduction:      data.lateDeduction      ?? cur.lateDeduction.toNumber(),
    undertimeDeduction: data.undertimeDeduction ?? cur.undertimeDeduction.toNumber(),
    absenceDeduction:   data.absenceDeduction   ?? cur.absenceDeduction.toNumber(),
    otherDeductions:    data.otherDeductions    ?? cur.otherDeductions.toNumber(),
  }

  const grossPay = parseFloat((
    merged.basicSalary
    + merged.regularOtAmount + merged.restDayOtAmount + merged.holidayOtAmount
    + merged.nightDiffAmount + merged.holidayPayAmount
    + merged.riceAllowance + merged.clothingAllowance + merged.medicalAllowance + merged.otherAllowances
    + merged.otherEarnings
  ).toFixed(2))

  const totalDeductions = parseFloat((
    merged.sssEmployee + merged.sssEc
    + merged.philhealthEmployee
    + merged.pagibigEmployee
    + merged.withholdingTax
    + merged.sssLoanDeduction + merged.pagibigLoan + merged.companyLoan
    + merged.lateDeduction + merged.undertimeDeduction + merged.absenceDeduction
    + merged.otherDeductions
  ).toFixed(2))

  const netPay = parseFloat((grossPay - totalDeductions).toFixed(2))

  // Update the payslip
  await prisma.payslip.update({
    where: { id: payslipId },
    data: { ...data, grossPay, totalDeductions, netPay },
  })

  // Recalculate run-level totals from all payslips
  const agg = await prisma.payslip.aggregate({
    where: { payrollRunId: payslip.payrollRunId },
    _sum: {
      basicSalary: true,
      grossPay: true,
      totalDeductions: true,
      netPay: true,
      sssEmployer: true,
      philhealthEmployer: true,
      pagibigEmployer: true,
    },
  })

  await prisma.payrollRun.update({
    where: { id: payslip.payrollRunId },
    data: {
      totalBasic:      agg._sum.basicSalary      ?? 0,
      totalGross:      agg._sum.grossPay         ?? 0,
      totalDeductions: agg._sum.totalDeductions  ?? 0,
      totalNetPay:     agg._sum.netPay           ?? 0,
      totalSssEr:      agg._sum.sssEmployer      ?? 0,
      totalPhEr:       agg._sum.philhealthEmployer ?? 0,
      totalPagibigEr:  agg._sum.pagibigEmployer  ?? 0,
    },
  })

  return NextResponse.json({ ok: true, grossPay, totalDeductions, netPay })
}
