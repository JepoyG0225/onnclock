import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logAudit } from '@/lib/audit'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'

// PATCH /api/payroll/payslip/[payslipId]
// Allows HR/admin to manually adjust earnings and deductions on a computed payslip.
// Blocked when the parent payroll run is LOCKED or APPROVED.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ payslipId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!(await ctxHasPermission(ctx, 'payroll:write'))) {
    return NextResponse.json({ error: 'You do not have access to adjust payroll inputs' }, { status: 403 })
  }

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
      employee: { select: { firstName: true, lastName: true } },
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
  type CustomAdjustment = { label: string; amount: number }
  const parseAdjustments = (value: unknown): CustomAdjustment[] | null => {
    if (value === undefined) return null
    if (!Array.isArray(value) || value.length > 30) return []
    return value.map(item => ({
      label: typeof item?.label === 'string' ? item.label.trim().slice(0, 80) : '',
      amount: Number(item?.amount),
    }))
  }
  const customIncomes = parseAdjustments(body.customIncomes)
  const customDeductions = parseAdjustments(body.customDeductions)
  const invalidCustomItems = [customIncomes, customDeductions]
    .filter((items): items is CustomAdjustment[] => items !== null)
    .flat()
    .some(item => !item.label || !Number.isFinite(item.amount) || item.amount <= 0)
  if (invalidCustomItems || customIncomes?.length === 0 && Array.isArray(body.customIncomes) && body.customIncomes.length > 30 || customDeductions?.length === 0 && Array.isArray(body.customDeductions) && body.customDeductions.length > 30) {
    return NextResponse.json({ error: 'Custom items require a label and a positive amount (maximum 30 items each)' }, { status: 422 })
  }

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
      manualEdits: true,
    },
  })

  const prevEdits = (cur.manualEdits as Record<string, unknown> | null) ?? {}
  const previousCustomIncomes = Array.isArray(prevEdits.customIncomes) ? prevEdits.customIncomes as CustomAdjustment[] : []
  const previousCustomDeductions = Array.isArray(prevEdits.customDeductions) ? prevEdits.customDeductions as CustomAdjustment[] : []
  const nextCustomIncomes = customIncomes ?? previousCustomIncomes
  const nextCustomDeductions = customDeductions ?? previousCustomDeductions
  const sumAdjustments = (items: CustomAdjustment[]) => items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const baseOtherEarnings = Math.max(0, cur.otherEarnings.toNumber() - sumAdjustments(previousCustomIncomes))
  const baseOtherDeductions = Math.max(0, cur.otherDeductions.toNumber() - sumAdjustments(previousCustomDeductions))
  if (customIncomes !== null) data.otherEarnings = parseFloat((baseOtherEarnings + sumAdjustments(nextCustomIncomes)).toFixed(2))
  if (customDeductions !== null) data.otherDeductions = parseFloat((baseOtherDeductions + sumAdjustments(nextCustomDeductions)).toFixed(2))

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

  // otherEarnings already includes non-taxable income (which is also
  // stored in otherAllowances for display). Adding both would double-count.
  const grossPay = parseFloat((
    merged.basicSalary
    + merged.regularOtAmount + merged.restDayOtAmount + merged.holidayOtAmount
    + merged.nightDiffAmount + merged.holidayPayAmount
    + merged.riceAllowance + merged.clothingAllowance + merged.medicalAllowance
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

  // Persist the manual override per field so future recomputes keep these
  // values. The compute route merges manualEdits back in after rebuilding
  // the payslip from the engine.
  const persistedFieldEdits: Record<string, unknown> = { ...data }
  // Labeled adjustments are re-added to the freshly calculated base during
  // recompute; persisting their aggregate as a field override would freeze
  // the old configured-income/deduction base and double count later.
  if (customIncomes !== null) delete persistedFieldEdits.otherEarnings
  if (customDeductions !== null) delete persistedFieldEdits.otherDeductions
  const nextManualEdits: Record<string, unknown> = {
    ...prevEdits,
    ...persistedFieldEdits,
    customIncomes: nextCustomIncomes,
    customDeductions: nextCustomDeductions,
  }
  if (customIncomes !== null) delete nextManualEdits.otherEarnings
  if (customDeductions !== null) delete nextManualEdits.otherDeductions

  // Update the payslip
  await prisma.payslip.update({
    where: { id: payslipId },
    data: {
      ...data,
      grossPay,
      totalDeductions,
      netPay,
      manualEdits: nextManualEdits as Prisma.InputJsonValue,
    },
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

  // Build a human-readable summary of changed fields for the audit log
  const changedFields = Object.keys(data)
  const employeeName = `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim()
  const oldVals: Record<string, number> = {}
  const newVals: Record<string, number> = {}
  for (const key of changedFields) {
    oldVals[key] = (cur as unknown as Record<string, { toNumber: () => number }>)[key]?.toNumber?.() ?? 0
    newVals[key] = data[key]
  }

  logAudit(ctx, 'EDIT_PAYSLIP', 'PayrollRun', payslip.payrollRunId, {
    description: `Manually edited payslip for ${employeeName} (${changedFields.join(', ')})`,
    oldValues: oldVals,
    newValues: { ...newVals, employeeName, payslipId },
  }).catch(() => {})

  return NextResponse.json({ ok: true, grossPay, totalDeductions, netPay })
}

// DELETE /api/payroll/payslip/[payslipId]
// Removes one employee from an editable payroll run and refreshes run totals.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ payslipId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!(await ctxHasPermission(ctx, 'payroll:write'))) {
    return NextResponse.json({ error: 'You do not have access to remove payroll inputs' }, { status: 403 })
  }

  const { payslipId } = await params
  const payslip = await prisma.payslip.findFirst({
    where: { id: payslipId, payrollRun: { companyId: ctx.companyId } },
    select: {
      id: true,
      payrollRunId: true,
      employee: { select: { firstName: true, lastName: true, employeeNo: true } },
      payrollRun: { select: { status: true } },
      loanDeductions: { select: { loanId: true, amount: true } },
    },
  })
  if (!payslip) return NextResponse.json({ error: 'Payroll input not found' }, { status: 404 })
  if (!['DRAFT', 'COMPUTED'].includes(payslip.payrollRun.status)) {
    return NextResponse.json({ error: 'Employees can only be removed from a draft or computed payroll run' }, { status: 400 })
  }
  const inputCount = await prisma.payslip.count({ where: { payrollRunId: payslip.payrollRunId } })
  if (inputCount <= 1) {
    return NextResponse.json({ error: 'A payroll run must keep at least one employee' }, { status: 400 })
  }

  await prisma.$transaction(async tx => {
    // Computing payroll debits each source loan. Restore those balances when
    // the employee is removed so the deleted payslip does not consume them.
    for (const deduction of payslip.loanDeductions) {
      await tx.employeeLoan.update({
        where: { id: deduction.loanId },
        data: {
          balance: { increment: deduction.amount },
          status: 'ACTIVE',
          endDate: null,
        },
      })
    }
    await tx.payslip.delete({ where: { id: payslipId } })
    const remainingInputs = await tx.payslip.findMany({
      where: { payrollRunId: payslip.payrollRunId },
      select: { employeeId: true },
    })
    const totals = await tx.payslip.aggregate({
      where: { payrollRunId: payslip.payrollRunId },
      _sum: {
        basicSalary: true, grossPay: true, totalDeductions: true, netPay: true,
        sssEmployer: true, philhealthEmployer: true, pagibigEmployer: true,
      },
    })
    await tx.payrollRun.update({
      where: { id: payslip.payrollRunId },
      data: {
        // Persist the remaining employee set so a later Recompute does not
        // silently add the removed employee back into the run.
        employeeScopeMode: 'CUSTOM',
        employeeIds: remainingInputs.map(input => input.employeeId),
        employmentTypeFilter: [],
        totalBasic: totals._sum.basicSalary ?? 0,
        totalGross: totals._sum.grossPay ?? 0,
        totalDeductions: totals._sum.totalDeductions ?? 0,
        totalNetPay: totals._sum.netPay ?? 0,
        totalSssEr: totals._sum.sssEmployer ?? 0,
        totalPhEr: totals._sum.philhealthEmployer ?? 0,
        totalPagibigEr: totals._sum.pagibigEmployer ?? 0,
      },
    })
  })

  const employeeName = `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim()
  logAudit(ctx, 'DELETE_PAYSLIP', 'PayrollRun', payslip.payrollRunId, {
    description: `Removed ${employeeName} (${payslip.employee.employeeNo}) from payroll inputs`,
    oldValues: { payslipId, employeeName, employeeNo: payslip.employee.employeeNo },
  }).catch(() => {})

  return NextResponse.json({ ok: true, payrollRunId: payslip.payrollRunId })
}
