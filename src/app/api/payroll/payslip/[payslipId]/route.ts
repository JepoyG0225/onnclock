import { earnedBasicPay } from '@/lib/payroll/monthly-pay'
import { ADJUSTABLE_FIELDS, readCalculatedValues, type AdjustableField } from '@/lib/payroll/review'
import { allocateDeductions, readDeductionCarryover } from '@/lib/payroll/deduction-carryover'
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

  return prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
  await tx.$queryRaw`SELECT id FROM employee_loans WHERE "companyId" = ${ctx.companyId} ORDER BY id FOR UPDATE`
  // Load payslip + run to check ownership and lock state
  const payslip = await tx.payslip.findFirst({
    where: { id: payslipId, payrollRun: { companyId: ctx.companyId } },
    select: {
      id: true,
      payrollRunId: true,
      calculationBasis: true,
      sssEc: true,
      sssLoanDeduction: true,
      pagibigLoan: true,
      companyLoan: true,
      riceAllowance: true,
      clothingAllowance: true,
      medicalAllowance: true,
      otherAllowances: true,
      payrollRun: { select: { runType: true, status: true, payDate: true, periodEnd: true, createdAt: true, computationStartedAt: true } },
      employeeId: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  })

  if ((payslip?.calculationBasis as {kind?:string}|null)?.kind === 'FINAL_PAY') return NextResponse.json({error:'Remove this unapproved final-pay payslip, then recompute and transfer a reviewed replacement from Final Pay.'},{status:409})
  if (payslip?.payrollRun.runType === 'LEAVE_ENCASHMENT') return NextResponse.json({error:'This is a dedicated leave encashment payroll. Cancel the editable batch in Leave Encashment and generate a new batch to revise it.'},{status:409})
  if (payslip?.payrollRun.runType === 'THIRTEENTH_MONTH') return NextResponse.json({error:'Regenerate the editable 13th-month payroll to revise employee amounts or tax.'},{status:409})
  if (!payslip) {
    return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  }
  if (payslip.payrollRun.computationStartedAt) return NextResponse.json({ error: 'Wait for payroll computation to finish' }, { status: 409 })
  if (['LOCKED', 'APPROVED', 'DISBURSED'].includes(payslip.payrollRun.status)) {
    return NextResponse.json({ error: 'Cannot edit a locked or approved payroll run' }, { status: 400 })
  }

  const later = await tx.payslip.findFirst({ where: {
    employeeId: payslip.employeeId, payrollRun: {
      runType: 'REGULAR', companyId: ctx.companyId, id: { not: payslip.payrollRunId },
      status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
      OR: [
        { payDate: { gt: payslip.payrollRun.payDate } },
        { payDate: payslip.payrollRun.payDate, periodEnd: { gt: payslip.payrollRun.periodEnd } },
        { payDate: payslip.payrollRun.payDate, periodEnd: payslip.payrollRun.periodEnd, createdAt: { gt: payslip.payrollRun.createdAt } },
      ],
    },
  }, select: { id: true } })
  if (later) return NextResponse.json({ error: 'A later payroll already uses this employee\'s carried deductions. Remove or cancel later draft payrolls before changing this cycle.' }, { status: 409 })

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

  if (Object.values(data).some(value => !Number.isFinite(value) || value < 0)) return NextResponse.json({ error: 'Amounts must be finite and non-negative' }, { status: 422 })

  // Recompute grossPay and totals from the merged values
  const cur = await tx.payslip.findUniqueOrThrow({
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
      calculationBasis: true,
      loanDeductions: { include: { loan: true } },
      employee: { select: { rateType: true } },
    },
  })

  const prevEdits = (cur.manualEdits as Record<string, unknown> | null) ?? {}
  const previousCustomIncomes = Array.isArray(prevEdits.customIncomes) ? prevEdits.customIncomes as CustomAdjustment[] : []
  const previousCustomDeductions = Array.isArray(prevEdits.customDeductions) ? prevEdits.customDeductions as CustomAdjustment[] : []
  const nextCustomIncomes = customIncomes ?? previousCustomIncomes
  const nextCustomDeductions = customDeductions ?? previousCustomDeductions
  const sumAdjustments = (items: CustomAdjustment[]) => items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const baseOtherEarnings = Math.max(0, cur.otherEarnings.toNumber() - sumAdjustments(previousCustomIncomes))
  const previousCarry = readDeductionCarryover(cur.calculationBasis)
  const previousOtherDue = previousCarry?.otherDue ?? Number(cur.otherDeductions)
  const baseOtherDeductions = Math.max(0, previousOtherDue - sumAdjustments(previousCustomDeductions))
  if (customIncomes !== null) data.otherEarnings = parseFloat((baseOtherEarnings + sumAdjustments(nextCustomIncomes)).toFixed(2))
  if (customDeductions !== null) data.otherDeductions = parseFloat((baseOtherDeductions + sumAdjustments(nextCustomDeductions)).toFixed(2))

  const baseline = readCalculatedValues(cur.calculationBasis)
  const resetFields: AdjustableField[] = Array.isArray(body.resetFields) ? body.resetFields.filter((field: unknown): field is AdjustableField => typeof field === 'string' && ADJUSTABLE_FIELDS.includes(field as AdjustableField)) : []
  if (resetFields.some(field => baseline[field] === undefined)) return NextResponse.json({ error: 'Calculated values are not available for this saved payroll. Recompute it before resetting adjustments.' }, { status: 422 })
  for (const field of resetFields) data[field] = baseline[field]
  const adjustmentReason = typeof body.adjustmentReason === 'string' ? body.adjustmentReason.trim().slice(0, 500) : ''
  if (body.adjustmentReason !== undefined && !adjustmentReason) return NextResponse.json({ error: 'Enter a reason for the payroll adjustment' }, { status: 422 })

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
    otherDeductions:    data.otherDeductions    ?? previousOtherDue,
  }

  // otherEarnings already includes non-taxable income (which is also
  // stored in otherAllowances for display). Adding both would double-count.
  const requestedLoans = previousCarry?.loans ?? cur.loanDeductions.map(d => ({ id: d.loanId, type: d.loan.loanType, amount: Number(d.amount) }))
  const allocation = allocateDeductions(merged, requestedLoans, merged.otherDeductions, previousCarry?.incomingOther ?? 0)
  const { grossPay, totalDeductions, netPay } = allocation.totals

  // The 13th-month accrual is DERIVED from basic pay, so an edit to basic has
  // to move it too. It previously did not: the payslip kept whatever the
  // original compute had accrued, and the two silently disagreed the moment
  // anyone touched basic. 206 payslips had drifted apart this way.
  //
  // Mirrors the engine: DAILY/HOURLY basic carries the late gross-up, which the
  // accrual nets back out so 13th month still accrues on basic actually earned.
  // MONTHLY basic has no gross-up, so it accrues on the full figure.
  const hourDerivedRate = cur.employee.rateType === 'DAILY' || cur.employee.rateType === 'HOURLY'
  const thirteenthBasis = hourDerivedRate
    ? Math.max(0, merged.basicSalary - merged.lateDeduction)
    : earnedBasicPay({ ...merged, calculationBasis: cur.calculationBasis })
  const thirteenthMonthContribution = parseFloat((thirteenthBasis / 12).toFixed(2))

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
  for (const field of resetFields) delete nextManualEdits[field]
  if (adjustmentReason) nextManualEdits.adjustmentReason = adjustmentReason

  // Restore old repayments and apply only the new amounts, atomically with the payslip.
  for (const deduction of cur.loanDeductions) {
    await tx.employeeLoan.update({ where: { id: deduction.loanId }, data: { balance: { increment: deduction.amount }, status: 'ACTIVE', endDate: null } })
  }
  await tx.payslipLoanDeduction.deleteMany({ where: { payslipId } })
  for (const loan of allocation.carryover.loans.filter(l => l.paid > 0)) {
    const source = await tx.employeeLoan.findUniqueOrThrow({ where: { id: loan.id } })
    if (Number(source.balance) < loan.paid) throw new Error('Loan balance changed. Recompute this payroll before editing.')
    const balance = Number((Number(source.balance) - loan.paid).toFixed(2))
    await tx.employeeLoan.update({ where: { id: loan.id }, data: { balance, status: balance === 0 ? 'FULLY_PAID' : 'ACTIVE', endDate: balance === 0 ? payslip.payrollRun.periodEnd : null } })
    await tx.payslipLoanDeduction.create({ data: { payslipId, loanId: loan.id, amount: loan.paid } })
  }
  // Update the payslip
  await tx.payslip.update({
    where: { id: payslipId },
    data: {
      ...data,
      ...allocation.deductions,
      calculationBasis: { ...((cur.calculationBasis ?? {}) as Record<string, unknown>), deductionCarryover: allocation.carryover } as unknown as Prisma.InputJsonValue,
      grossPay,
      totalDeductions,
      netPay,
      // Deliberately NOT added to `data`/manualEdits above — freezing a derived
      // accrual as an override would stop recompute from ever correcting it.
      thirteenthMonthContribution,
      manualEdits: nextManualEdits as Prisma.InputJsonValue,
    },
  })

  // Recalculate run-level totals from all payslips
  const agg = await tx.payslip.aggregate({
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

  await tx.payrollRun.update({
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
    newValues: { ...newVals, employeeName, payslipId, adjustmentReason, resetFields },
  }).catch(() => {})

  return NextResponse.json({ ok: true, grossPay, totalDeductions, netPay, ...allocation.deductions, basicPayManuallyEdited: typeof nextManualEdits.basicSalary === 'number', hasManualEdits: ADJUSTABLE_FIELDS.some(field => typeof nextManualEdits[field] === 'number'), calculationBasis: { ...((cur.calculationBasis ?? {}) as Record<string, unknown>), deductionCarryover: allocation.carryover } })
  }, { timeout: 30000, maxWait: 10000 })
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
  return prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
  await tx.$queryRaw`SELECT id FROM employee_loans WHERE "companyId" = ${ctx.companyId} ORDER BY id FOR UPDATE`
  const payslip = await tx.payslip.findFirst({
    where: { id: payslipId, payrollRun: { companyId: ctx.companyId } },
    select: {
      id: true,
      payrollRunId: true,
      employee: { select: { firstName: true, lastName: true, employeeNo: true } },
      payrollRun: { select: { runType: true, status: true, payDate: true, periodEnd: true, createdAt: true, computationStartedAt: true } },
      employeeId: true,
      loanDeductions: { select: { loanId: true, amount: true } },
    },
  })
  if (payslip?.payrollRun.runType === 'LEAVE_ENCASHMENT') return NextResponse.json({error:'This is a dedicated leave encashment payroll. Cancel the editable batch in Leave Encashment and generate a new batch to revise it.'},{status:409})
  if (payslip?.payrollRun.runType === 'THIRTEENTH_MONTH') return NextResponse.json({error:'Regenerate the editable 13th-month payroll to revise employee amounts or tax.'},{status:409})
  if (!payslip) return NextResponse.json({ error: 'Payroll input not found' }, { status: 404 })
  if (payslip.payrollRun.computationStartedAt) return NextResponse.json({ error: 'Wait for payroll computation to finish' }, { status: 409 })
  if (!['DRAFT', 'COMPUTED'].includes(payslip.payrollRun.status)) {
    return NextResponse.json({ error: 'Employees can only be removed from a draft or computed payroll run' }, { status: 400 })
  }
  if(await tx.hrOperation.count({where:{companyId:ctx.companyId,employeeId:payslip.employeeId,kind:'SALARY_CHANGE',status:'APPROVED',data:{path:['retroTargetRunId'],equals:payslip.payrollRunId}}}))return NextResponse.json({error:'Unschedule this employee retro pay in HR Center before removing the payslip.'},{status:409})
  const later = await tx.payslip.findFirst({ where: {
    employeeId: payslip.employeeId, payrollRun: {
      runType: 'REGULAR', companyId: ctx.companyId, id: { not: payslip.payrollRunId },
      status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
      OR: [
        { payDate: { gt: payslip.payrollRun.payDate } },
        { payDate: payslip.payrollRun.payDate, periodEnd: { gt: payslip.payrollRun.periodEnd } },
        { payDate: payslip.payrollRun.payDate, periodEnd: payslip.payrollRun.periodEnd, createdAt: { gt: payslip.payrollRun.createdAt } },
      ],
    },
  }, select: { id: true } })
  if (later) return NextResponse.json({ error: 'A later payroll already uses this employee\'s carried deductions. Remove or cancel later draft payrolls before changing this cycle.' }, { status: 409 })

  const inputCount = await tx.payslip.count({ where: { payrollRunId: payslip.payrollRunId } })
  if (inputCount <= 1) {
    return NextResponse.json({ error: 'A payroll run must keep at least one employee' }, { status: 400 })
  }


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

  const employeeName = `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim()
  logAudit(ctx, 'DELETE_PAYSLIP', 'PayrollRun', payslip.payrollRunId, {
    description: `Removed ${employeeName} (${payslip.employee.employeeNo}) from payroll inputs`,
    oldValues: { payslipId, employeeName, employeeNo: payslip.employee.employeeNo },
  }).catch(() => {})

  return NextResponse.json({ ok: true, payrollRunId: payslip.payrollRunId })
  }, { timeout: 30000, maxWait: 10000 })
}
