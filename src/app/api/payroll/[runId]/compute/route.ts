import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { computePayroll } from '@/lib/payroll/engine'
import { getWorkingDays, isFirstCutoff } from '@/lib/utils'
import { z } from 'zod'

const variableIncomeEntrySchema = z.object({
  employeeId: z.string().min(1),
  incomeTypeId: z.string().min(1),
  amount: z.coerce.number().min(0),
})

const computePayloadSchema = z.object({
  variableIncomeEntries: z.array(variableIncomeEntrySchema).optional().default([]),
})

function countNightMinutes(params: {
  timeIn: Date
  timeOut: Date
  startMinutes: number
  endMinutes: number
}) {
  let minutes = 0
  const crossesMidnight = params.startMinutes > params.endMinutes
  let cursor = new Date(params.timeIn)
  while (cursor < params.timeOut) {
    const currentMinutes = cursor.getHours() * 60 + cursor.getMinutes()
    const inWindow = crossesMidnight
      ? currentMinutes >= params.startMinutes || currentMinutes < params.endMinutes
      : currentMinutes >= params.startMinutes && currentMinutes < params.endMinutes
    if (inWindow) minutes += 1
    cursor = new Date(cursor.getTime() + 60_000)
  }
  return minutes
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  const entries = await prisma.payrollRunIncomeEntry.findMany({
    where: { payrollRunId: runId },
    select: { employeeId: true, incomeTypeId: true, amount: true },
  })

  const employees = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    select: {
      id: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      incomeAssignments: {
        where: { isActive: true, incomeType: { isActive: true, mode: 'VARIABLE' } },
        select: {
          incomeTypeId: true,
          incomeType: {
            select: { id: true, name: true, isTaxable: true },
          },
        },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const existingMap = new Map(
    entries.map(e => [`${e.employeeId}:${e.incomeTypeId}`, e.amount.toNumber()])
  )

  const variableIncomeRequirements = employees
    .map(emp => {
      const items = emp.incomeAssignments.map(a => {
        const amount = existingMap.get(`${emp.id}:${a.incomeTypeId}`) ?? 0
        return {
          incomeTypeId: a.incomeType.id,
          name: a.incomeType.name,
          isTaxable: a.incomeType.isTaxable,
          amount,
        }
      })
      return {
        employeeId: emp.id,
        employeeNo: emp.employeeNo,
        employeeName: `${emp.lastName}, ${emp.firstName}`,
        incomes: items,
      }
    })
    .filter(row => row.incomes.length > 0)

  return NextResponse.json({ variableIncomeRequirements })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
    include: { company: { include: { contributionConfig: true } } },
  })

  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.status === 'LOCKED') {
    return NextResponse.json({ error: 'Payroll run is locked and cannot be recomputed' }, { status: 400 })
  }

  const rawBody = await req.json().catch(() => ({}))
  const parsedPayload = computePayloadSchema.safeParse(rawBody)
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'Invalid computation payload' }, { status: 422 })
  }
  const variableIncomeEntriesInput = parsedPayload.data.variableIncomeEntries

  const workingDays = getWorkingDays(run.periodStart, run.periodEnd)
  const firstCutoff = isFirstCutoff(run.periodStart)
  let payrollConfig: {
    enableOvertime: boolean
    enableNightDifferential: boolean
    nightDifferentialRate: { toNumber(): number } | number
  } | null = null
  try {
    payrollConfig = await prisma.payrollCycleConfig.findUnique({
      where: { companyId: ctx.companyId },
      select: {
        enableOvertime: true,
        enableNightDifferential: true,
        nightDifferentialRate: true,
      },
    })
  } catch {
    payrollConfig = null
  }
  const overtimeEnabled = payrollConfig?.enableOvertime ?? true
  const nightDifferentialEnabled = payrollConfig?.enableNightDifferential ?? true
  const nightDiffRate = nightDifferentialEnabled
    ? (payrollConfig?.nightDifferentialRate && typeof payrollConfig.nightDifferentialRate === 'object'
      ? payrollConfig.nightDifferentialRate.toNumber()
      : Number(payrollConfig?.nightDifferentialRate ?? 0.1))
    : 0
  const nightDiffStartMinutes = 22 * 60
  const nightDiffEndMinutes = 6 * 60

  // Fetch all active employees with their active loans
  const employees = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    include: {
      workSchedule: {
        select: { workHoursPerDay: true },
      },
      loans: { where: { status: 'ACTIVE' } },
      incomeAssignments: {
        where: { isActive: true, incomeType: { isActive: true } },
        include: { incomeType: true },
      },
    },
  })

  const variableAssignmentKeys = new Set<string>()
  for (const emp of employees) {
    for (const assignment of emp.incomeAssignments) {
      if (assignment.incomeType.mode === 'VARIABLE') {
        variableAssignmentKeys.add(`${emp.id}:${assignment.incomeTypeId}`)
      }
    }
  }

  for (const entry of variableIncomeEntriesInput) {
    const key = `${entry.employeeId}:${entry.incomeTypeId}`
    if (!variableAssignmentKeys.has(key)) {
      return NextResponse.json(
        { error: 'Invalid variable income entry submitted for payroll run' },
        { status: 422 }
      )
    }
  }

  const submittedKeys = new Set(
    variableIncomeEntriesInput.map(entry => `${entry.employeeId}:${entry.incomeTypeId}`)
  )
  const missingRequiredEntries = Array.from(variableAssignmentKeys).filter(key => !submittedKeys.has(key))
  if (missingRequiredEntries.length > 0) {
    return NextResponse.json(
      { error: 'Please enter variable income amounts for all required employees before computing payroll' },
      { status: 422 }
    )
  }

  const variableIncomeEntriesByKey = new Map<string, number>()
  for (const entry of variableIncomeEntriesInput) {
    variableIncomeEntriesByKey.set(
      `${entry.employeeId}:${entry.incomeTypeId}`,
      parseFloat(entry.amount.toFixed(2))
    )
  }

  // Fetch all company holidays for the pay period
  const companyHolidays = await prisma.holiday.findMany({
    where: { companyId: ctx.companyId, date: { gte: run.periodStart, lte: run.periodEnd } }
  })
  // Build a quick lookup: "YYYY-MM-DD" -> holiday
  const holidayMap = new Map(
    companyHolidays.map(h => [h.date.toISOString().split('T')[0], h])
  )

  // ── Build payslip input data for each employee ─────────────────────────────
  type PayslipBuildItem = {
    employeeId: string
    data: Parameters<typeof prisma.payslip.create>[0]['data']
    loanDeductions: { id: string; amount: number }[]
    incomes: { incomeTypeId: string; typeName: string; amount: number; isTaxable: boolean }[]
  }

  const builds: PayslipBuildItem[] = []
  let totalBasic = 0, totalGross = 0, totalDeductions = 0, totalNetPay = 0
  let totalSssEr = 0, totalPhEr = 0, totalPagibigEr = 0

  for (const emp of employees) {
    const dtrRecords = await prisma.dTRRecord.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: run.periodStart, lte: run.periodEnd },
      },
    })

    // Enhance each DTR record:
    // 1. Auto-detect holiday from company calendar (overrides whatever was stored)
    // 2. Auto-compute OT/regular hours from timeIn/timeOut if missing
    const enhancedDtr = dtrRecords.map(d => {
      const dateKey = new Date(d.date).toISOString().split('T')[0]
      const holiday = holidayMap.get(dateKey)

      // Recompute hours from timestamps if timeIn+timeOut are present
      // but overtimeHours wasn't stored (manual DTR entries)
      let overtimeHours = d.overtimeHours?.toNumber() ?? 0
      let nightDiffHours = d.nightDiffHours?.toNumber() ?? 0

      if (d.timeIn && d.timeOut) {
        if (!d.overtimeHours) {
          const totalMinutes = Math.max(0, (d.timeOut.getTime() - d.timeIn.getTime()) / 60000 - 60) // minus 60 min break
          const otMinutes = Math.max(0, totalMinutes - 480) // beyond 8 hours
          overtimeHours = Math.round((otMinutes / 60) * 100) / 100
        }

        // Always auto-calculate night differential from 10:00 PM–6:00 AM window.
        const nightMins = countNightMinutes({
          timeIn: d.timeIn,
          timeOut: d.timeOut,
          startMinutes: nightDiffStartMinutes,
          endMinutes: nightDiffEndMinutes,
        })
        nightDiffHours = Math.round((nightMins / 60) * 100) / 100
      }

      return {
        ...d,
        isHoliday: !!holiday,
        holidayType: holiday?.type ?? d.holidayType,
        overtimeHours,
        nightDiffHours,
      }
    })

    const hasDtr = enhancedDtr.length > 0
    const dtrWorked = enhancedDtr.filter(d => !d.isAbsent && (!d.isLeave || d.isLeavePaid)).length
    const daysWorked = emp.trackTime
      ? dtrWorked
      : (hasDtr ? dtrWorked : workingDays)

    const regularOtHoursRaw = emp.trackTime || hasDtr
      ? enhancedDtr.reduce((s, d) => s + d.overtimeHours, 0)
      : 0
    const nightDiffHoursRaw = emp.trackTime || hasDtr
      ? enhancedDtr.reduce((s, d) => s + d.nightDiffHours, 0)
      : 0
    const regularOtHours = overtimeEnabled ? regularOtHoursRaw : 0
    const nightDiffHours = nightDifferentialEnabled ? nightDiffHoursRaw : 0
    const lateMinutes = emp.trackTime || hasDtr
      ? enhancedDtr.reduce((s, d) => s + (d.lateMinutes ?? 0), 0)
      : 0
    const undertimeMinutes = emp.trackTime || hasDtr
      ? enhancedDtr.reduce((s, d) => s + (d.undertimeMinutes ?? 0), 0)
      : 0
    const dtrAbsent = enhancedDtr.filter(d => d.isAbsent).length
    // If trackTime is enabled, basic pay is already pro-rated by daysWorked,
    // so do not apply absence deductions again.
    const absentDays = emp.trackTime ? 0 : dtrAbsent
    const regularHolidaysWorked  = enhancedDtr.filter(d => d.isHoliday && d.holidayType === 'REGULAR'             && !d.isAbsent).length
    const specialHolidaysWorked  = enhancedDtr.filter(d => d.isHoliday && d.holidayType === 'SPECIAL_NON_WORKING' && !d.isAbsent).length

    // Regular holidays in the period where the employee had NO attendance or was absent
    // Only relevant for DAILY/HOURLY rate employees (monthly salary already covers holidays)
    let regularHolidayNonWorkDays = 0
    if (emp.rateType === 'DAILY' || emp.rateType === 'HOURLY') {
      const regularHolidayDates = companyHolidays
        .filter(h => h.type === 'REGULAR')
        .map(h => h.date.toISOString().split('T')[0])

      for (const hDate of regularHolidayDates) {
        const dtr = enhancedDtr.find(d => new Date(d.date).toISOString().split('T')[0] === hDate)
        // Employee didn't work this regular holiday (no DTR, or marked absent/leave)
        if (!dtr || dtr.isAbsent || (dtr.isLeave && !dtr.isLeavePaid)) {
          regularHolidayNonWorkDays++
        }
      }
    }

    // YTD from previous payslips this year
    const yearStart = new Date(run.periodStart.getFullYear(), 0, 1)
    const ytdData = await prisma.payslip.aggregate({
      where: {
        employeeId: emp.id,
        payrollRunId: { not: runId },
        payrollRun: {
          periodStart: { gte: yearStart, lt: run.periodStart },
          companyId: ctx.companyId,
        },
      },
      _sum: {
        grossPay: true,
        taxableIncome: true,
        withholdingTax: true,
        thirteenthMonthContribution: true,
      },
    })

    const dailyRate = emp.dailyRate?.toNumber() ?? emp.basicSalary.toNumber() / 22
    const configuredWorkHours = Number(emp.workSchedule?.workHoursPerDay ?? 8)
    const effectiveWorkHoursPerDay = Number.isFinite(configuredWorkHours) && configuredWorkHours > 0
      ? configuredWorkHours
      : 8
    const hourlyRate = emp.rateType === 'HOURLY'
      ? (emp.hourlyRate?.toNumber() ?? dailyRate / effectiveWorkHoursPerDay)
      : dailyRate / effectiveWorkHoursPerDay

    // ── Loan deductions: cap each at remaining balance ─────────────────────
    // For semi-monthly, deduct half the monthly amortization each period
    const periodDivisor = run.payFrequency === 'SEMI_MONTHLY' ? 2 : 1
    const loanDeductions = emp.loans.map(loan => {
      const periodAmount = loan.monthlyAmortization.toNumber() / periodDivisor
      // Never deduct more than the remaining balance
      const amount = Math.min(periodAmount, loan.balance.toNumber())
      return { id: loan.id, type: loan.loanType, amount }
    }).filter(l => l.amount > 0)

    const incomeBreakdown = emp.incomeAssignments
      .map(assignment => {
        const type = assignment.incomeType
        const key = `${emp.id}:${type.id}`
        const amount = type.mode === 'VARIABLE'
          ? (variableIncomeEntriesByKey.get(key) ?? 0)
          : Number(assignment.fixedAmount ?? type.defaultAmount)

        return {
          incomeTypeId: type.id,
          typeName: type.name,
          amount: parseFloat(amount.toFixed(2)),
          isTaxable: type.isTaxable,
        }
      })
      .filter(item => item.amount > 0)

    const additionalTaxableIncome = incomeBreakdown
      .filter(item => item.isTaxable)
      .reduce((sum, item) => sum + item.amount, 0)
    const additionalNonTaxableIncome = incomeBreakdown
      .filter(item => !item.isTaxable)
      .reduce((sum, item) => sum + item.amount, 0)
    const totalOtherIncome = additionalTaxableIncome + additionalNonTaxableIncome

    const result = computePayroll({
      employee: {
        id: emp.id,
        basicSalary:         emp.basicSalary.toNumber(),
        dailyRate,
        hourlyRate,
        rateType:            emp.rateType,
        payFrequency:        run.payFrequency === 'SEMI_MONTHLY' ? 'SEMI_MONTHLY' : 'MONTHLY',
        isMinimumWageEarner:   emp.isMinimumWageEarner,
        isExemptFromTax:       emp.isExemptFromTax,
        sssEnabled:            emp.sssEnabled,
        philhealthEnabled:     emp.philhealthEnabled,
        pagibigEnabled:        emp.pagibigEnabled,
        withholdingTaxEnabled: emp.withholdingTaxEnabled,
      },
      period: {
        start:        run.periodStart,
        end:          run.periodEnd,
        workingDays,
        payFrequency: run.payFrequency === 'SEMI_MONTHLY' ? 'SEMI_MONTHLY' : 'MONTHLY',
        isFirstCutoff: firstCutoff,
        nightDifferentialRate: nightDiffRate,
      },
      attendance: {
        daysWorked,
        regularHours:          daysWorked * 8,
        regularOtHours,
        restDayOtHours:        0,
        regularHolidayOtHours: 0,
        specialHolidayOtHours: 0,
        nightDiffHours,
        lateMinutes,
        undertimeMinutes,
        absentDays,
        regularHolidaysWorked,
        specialHolidaysWorked,
        regularHolidayNonWorkDays,
      },
      loans: loanDeductions,
      deMinimis:  { riceSubsidy: 0, clothing: 0, medical: 0, laundry: 0, meal: 0, other: 0 },
      allowances: { rice: 0, clothing: 0, medical: 0, transportation: 0, other: 0 },
      additionalTaxableIncome,
      additionalNonTaxableIncome,
      ytd: {
        grossPay:               ytdData._sum.grossPay?.toNumber()                    ?? 0,
        taxableIncome:          ytdData._sum.taxableIncome?.toNumber()               ?? 0,
        withholdingTax:         ytdData._sum.withholdingTax?.toNumber()              ?? 0,
        thirteenthMonthContrib: ytdData._sum.thirteenthMonthContribution?.toNumber() ?? 0,
      },
    })

    const sssLoans     = loanDeductions.filter(l => l.type.startsWith('SSS')        ).reduce((s, l) => s + l.amount, 0)
    const pagibigLoans = loanDeductions.filter(l => l.type.startsWith('PAGIBIG')    ).reduce((s, l) => s + l.amount, 0)
    const companyLoans = loanDeductions.filter(l => l.type === 'COMPANY_LOAN'       ).reduce((s, l) => s + l.amount, 0)
    const otherLoans   = loanDeductions.filter(l => !l.type.startsWith('SSS') && !l.type.startsWith('PAGIBIG') && l.type !== 'COMPANY_LOAN').reduce((s, l) => s + l.amount, 0)

    builds.push({
      employeeId: emp.id,
      loanDeductions: loanDeductions.map(l => ({ id: l.id, amount: l.amount })),
      data: {
        payrollRunId:               runId,
        employeeId:                 emp.id,
        basicSalary:                result.basicPay,
        dailyRate,
        daysWorked,
        hoursWorked:                daysWorked * 8,
        regularOtHours,
        regularOtAmount:            result.regularOtAmount,
        restDayOtHours:             0,
        restDayOtAmount:            result.restDayOtAmount,
        holidayOtHours:             0,
        holidayOtAmount:            result.holidayOtAmount,
        nightDiffHours,
        nightDiffAmount:            result.nightDiffAmount,
        holidayPayAmount:           result.holidayPayAmount,
        otherAllowances:            additionalNonTaxableIncome,
        otherEarnings:              totalOtherIncome,
        grossPay:                   result.grossPay,
        sssEmployee:                result.sssEmployee,
        sssEc:                      result.sssEc,
        philhealthEmployee:         result.philhealthEmployee,
        pagibigEmployee:            result.pagibigEmployee,
        withholdingTax:             result.withholdingTax,
        sssEmployer:                result.sssEmployer,
        philhealthEmployer:         result.philhealthEmployer,
        pagibigEmployer:            result.pagibigEmployer,
        sssLoanDeduction:           sssLoans,
        pagibigLoan:                pagibigLoans,
        companyLoan:                companyLoans + otherLoans,
        lateDeduction:              result.lateDeduction,
        undertimeDeduction:         result.undertimeDeduction,
        absenceDeduction:           result.absenceDeduction,
        totalDeductions:            result.totalDeductions,
        netPay:                     result.netPay,
        thirteenthMonthContribution:result.thirteenthMonthContribution,
        taxableIncome:              result.taxableIncome,
        nonTaxableIncome:           result.nonTaxableIncome,
        ytdGrossPay:                result.ytdGrossPay,
        ytdTaxableIncome:           result.ytdTaxableIncome,
        ytdWithholdingTax:          result.ytdWithholdingTax,
      },
      incomes: incomeBreakdown,
    })

    totalBasic       += result.basicPay
    totalGross       += result.grossPay
    totalDeductions  += result.totalDeductions
    totalNetPay      += result.netPay
    totalSssEr       += result.sssEmployer
    totalPhEr        += result.philhealthEmployer
    totalPagibigEr   += result.pagibigEmployer
  }

  await prisma.$transaction(async tx => {
    await tx.payrollRunIncomeEntry.deleteMany({
      where: {
        payrollRunId: runId,
        incomeType: { mode: 'VARIABLE' },
      },
    })
    if (variableIncomeEntriesInput.length > 0) {
      await tx.payrollRunIncomeEntry.createMany({
        data: variableIncomeEntriesInput
          .filter(entry => entry.amount > 0)
          .map(entry => ({
            payrollRunId: runId,
            employeeId: entry.employeeId,
            incomeTypeId: entry.incomeTypeId,
            amount: parseFloat(entry.amount.toFixed(2)),
          })),
      })
    }
  })

  // ── Persist everything in a transaction ───────────────────────────────────
  // Step 1: delete old payslip loan deductions + payslips (recompute-safe)
  await prisma.$transaction([
    prisma.payslipLoanDeduction.deleteMany({
      where: { payslip: { payrollRunId: runId } },
    }),
    prisma.payslip.deleteMany({ where: { payrollRunId: runId } }),
  ])

  // Step 2: create new payslips individually so we get their IDs back,
  //         then create PayslipLoanDeduction ledger records
  // Track total deducted per loan across all payslips
  const loanTotalsDeducted = new Map<string, number>()

  for (const build of builds) {
    const payslip = await prisma.payslip.create({ data: build.data })

    if (build.loanDeductions.length > 0) {
      await prisma.payslipLoanDeduction.createMany({
        data: build.loanDeductions.map(ld => ({
          payslipId: payslip.id,
          loanId:    ld.id,
          amount:    ld.amount,
        })),
      })
      for (const ld of build.loanDeductions) {
        loanTotalsDeducted.set(ld.id, (loanTotalsDeducted.get(ld.id) ?? 0) + ld.amount)
      }
    }

    if (build.incomes.length > 0) {
      await prisma.payslipIncome.createMany({
        data: build.incomes.map(income => ({
          payslipId: payslip.id,
          incomeTypeId: income.incomeTypeId,
          typeName: income.typeName,
          amount: income.amount,
          isTaxable: income.isTaxable,
        })),
      })
    }
  }

  // Step 3: update each loan's balance; mark PAID when fully settled
  for (const [loanId, deducted] of loanTotalsDeducted) {
    const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId } })
    if (!loan) continue

    const newBalance = parseFloat(Math.max(0, loan.balance.toNumber() - deducted).toFixed(2))
    await prisma.employeeLoan.update({
      where: { id: loanId },
      data: {
        balance:  newBalance,
        status:   newBalance <= 0 ? 'FULLY_PAID' : 'ACTIVE',
        endDate:  newBalance <= 0 ? run.periodEnd : loan.endDate,
      },
    })
  }

  // Step 4: update payroll run totals
  await prisma.payrollRun.update({
    where: { id: runId },
    data: {
      status: 'COMPUTED',
      totalBasic,
      totalGross,
      totalDeductions,
      totalNetPay,
      totalSssEr,
      totalPhEr,
      totalPagibigEr,
    },
  })

  return NextResponse.json({
    success:       true,
    employeeCount: employees.length,
    totalGross,
    totalNetPay,
    loansUpdated:  loanTotalsDeducted.size,
  })
}
