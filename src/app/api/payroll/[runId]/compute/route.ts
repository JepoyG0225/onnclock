import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOtMapKey, getApprovedOtHoursMap } from '@/lib/overtime-requests'
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

/**
 * Count minutes of overlap with the night-differential window (PHT).
 *
 * The window is configured in Manila local time (e.g. 22:00-06:00 PHT). We
 * MUST compare cursor times in the same TZ — Vercel's Node runtime defaults
 * to UTC, so `cursor.getHours()` returns UTC hours, which would silently
 * mis-count ND for any overnight PHT shift. This function uses the UTC
 * accessors and shifts by +8 hours to get the PHT minute-of-day, so the
 * result is identical regardless of the server's TZ.
 */
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
    // PHT minute-of-day, regardless of server TZ
    const utcMin = cursor.getUTCHours() * 60 + cursor.getUTCMinutes()
    const currentMinutes = (utcMin + 8 * 60) % (24 * 60)
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

  // Allow key-auth bypass for the admin recompute trigger. When a valid
  // ?adminKey is passed, we skip session auth entirely and trust the
  // ?companyId query param. Otherwise standard session auth applies.
  const adminKey = (req.nextUrl.searchParams.get('adminKey') ?? '').trim()
  const expectedKey = (process.env.MIGRATION_APPLY_KEY ?? '').trim().replace(/^"|"$/g, '')
  const isAdminKeyAuth = expectedKey.length > 0 && adminKey === expectedKey

  let ctx: { userId: string; companyId: string; role: string; email: string }
  if (isAdminKeyAuth) {
    const queryCompanyId = req.nextUrl.searchParams.get('companyId')
    if (!queryCompanyId) {
      return NextResponse.json({ error: 'companyId is required when using adminKey' }, { status: 400 })
    }
    // Synthesize a SUPER_ADMIN context for the recompute. userId is used
    // only for audit fields (approvedBy, etc.) — use 'admin-recompute' sentinel.
    ctx = { userId: 'admin-recompute', companyId: queryCompanyId, role: 'SUPER_ADMIN', email: 'admin@onclockph.com' }
  } else {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    ctx = auth.ctx
  }

  // SUPER_ADMIN can target any company's run via ?companyId=… so the
  // admin recompute proxy works without needing an impersonation cookie.
  // Everyone else stays strictly scoped to their session's companyId.
  const overrideCompanyId = ctx.role === 'SUPER_ADMIN'
    ? (req.nextUrl.searchParams.get('companyId') ?? null)
    : null
  const scopedCompanyId = overrideCompanyId ?? ctx.companyId

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: scopedCompanyId },
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

  const rawWorkingDays = getWorkingDays(run.periodStart, run.periodEnd)
  const firstCutoff = isFirstCutoff(run.periodStart)
  let payrollConfig: {
    enableOvertime: boolean
    enableNightDifferential: boolean
    nightDifferentialRate: { toNumber(): number } | number
    disableLateDeductions?: boolean
  } | null = null
  try {
    payrollConfig = await prisma.payrollCycleConfig.findUnique({
      where: { companyId: scopedCompanyId },
      select: {
        enableOvertime: true,
        enableNightDifferential: true,
        nightDifferentialRate: true,
        disableLateDeductions: true,
      },
    })
  } catch {
    payrollConfig = null
  }
  const overtimeEnabled = payrollConfig?.enableOvertime ?? true
  const disableLateDeductions = payrollConfig?.disableLateDeductions ?? false
  const nightDifferentialEnabled = payrollConfig?.enableNightDifferential ?? true
  const nightDiffRate = nightDifferentialEnabled
    ? (payrollConfig?.nightDifferentialRate && typeof payrollConfig.nightDifferentialRate === 'object'
      ? payrollConfig.nightDifferentialRate.toNumber()
      : Number(payrollConfig?.nightDifferentialRate ?? 0.1))
    : 0
  const nightDiffStartMinutes = 22 * 60
  const nightDiffEndMinutes = 6 * 60
  let differentialRules = {
    regularOtRate: 1.25,
    restDayOtRate: 1.69,
    regularHolidayOtRate: 2.6,
    specialHolidayOtRate: 1.69,
  }
  try {
    const rows = await prisma.$queryRaw<Array<{
      regularOtRate: number | { toNumber(): number }
      restDayOtRate: number | { toNumber(): number }
      regularHolidayOtRate: number | { toNumber(): number }
      specialHolidayOtRate: number | { toNumber(): number }
    }>>`
      SELECT
        "regularOtRate",
        "restDayOtRate",
        "regularHolidayOtRate",
        "specialHolidayOtRate"
      FROM "payroll_differential_configs"
      WHERE "companyId" = ${scopedCompanyId}
      LIMIT 1
    `
    const row = rows[0]
    if (row) {
      const toNum = (value: number | { toNumber(): number }) =>
        typeof value === 'object' ? value.toNumber() : Number(value)
      differentialRules = {
        regularOtRate: toNum(row.regularOtRate),
        restDayOtRate: toNum(row.restDayOtRate),
        regularHolidayOtRate: toNum(row.regularHolidayOtRate),
        specialHolidayOtRate: toNum(row.specialHolidayOtRate),
      }
    }
  } catch {
    // defaults remain when table doesn't exist yet
  }

  // Fetch all active employees with their active loans
  const employees = await prisma.employee.findMany({
    where: { companyId: scopedCompanyId, isActive: true },
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
    where: { companyId: scopedCompanyId, date: { gte: run.periodStart, lte: run.periodEnd } }
  })
  // Build a quick lookup: "YYYY-MM-DD" -> holiday
  const holidayMap = new Map(
    companyHolidays.map(h => [h.date.toISOString().split('T')[0], h])
  )

  // PH practice: monthly employees are paid in full on holidays (Art. 94
  // Labor Code for regular holidays; established practice for special
  // non-working days). So when pro-rating monthly salary by attendance,
  // the denominator should EXCLUDE weekday holidays — otherwise the
  // employee is incorrectly docked for days they were never required to
  // work. The numerator (daysWorked) similarly excludes holidays they
  // didn't clock in on, so the ratio remains 100% for someone who worked
  // every regular workday in the period.
  const weekdayHolidayCount = companyHolidays.filter(h => {
    const d = h.date.getUTCDay()
    return d !== 0 && d !== 6
  }).length
  const workingDays = Math.max(1, rawWorkingDays - weekdayHolidayCount)
  const approvedOtMap = await getApprovedOtHoursMap({
    companyId: scopedCompanyId,
    dateFrom: run.periodStart,
    dateTo: run.periodEnd,
  })

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

        // Night-differential: always recompute from raw timestamps using
        // the PHT-aware countNightMinutes. Stored DTR values may be stale
        // (e.g. set before the PHT bug fix or by a manual import that
        // skipped ND), so the payroll-time recomputation is the source of
        // truth.
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
        overtimeHours: approvedOtMap.get(buildOtMapKey(emp.id, d.date)) ?? 0,
        nightDiffHours,
      }
    })

    const hasDtr = enhancedDtr.length > 0
    const dtrWorked = enhancedDtr.filter(d => !d.isAbsent && (!d.isLeave || d.isLeavePaid)).length
    const daysWorked = emp.trackTime
      ? dtrWorked
      : (hasDtr ? dtrWorked : workingDays)

    // ── Resolve effective work hours per day (used for regular-hour cap
    //   below and as a fallback when DTR timestamps are missing). For
    //   HOURLY employees this is critical: basic pay = hourlyRate × these
    //   hours, so we must come up with a defensible per-period total.
    const configuredWorkHoursForHours = Number(emp.workSchedule?.workHoursPerDay ?? 8)
    const workHoursPerDayForCap = Number.isFinite(configuredWorkHoursForHours) && configuredWorkHoursForHours > 0
      ? configuredWorkHoursForHours
      : 8

    // ── Actual regular hours worked (DTR-derived) ─────────────────────
    // Prefer the DTR's stored regularHours value (computed by the
    // timesheet engine, which accounts for breaks, OT cap, undertime
    // etc.). Fall back to deriving from raw timestamps only when the
    // stored value is missing — and as a last resort credit a full
    // workHoursPerDay day (paid leave / manual present-flag without
    // timestamps). When the employee has no DTR rows at all (legacy /
    // time-tracking-off) use daysWorked × workHoursPerDay.
    let regularHoursTotal = 0
    if (hasDtr) {
      for (const d of enhancedDtr) {
        if (d.isAbsent) continue
        if (d.isLeave && !d.isLeavePaid) continue
        const stored = d.regularHours?.toNumber?.() ?? Number(d.regularHours ?? 0)
        if (stored > 0) {
          regularHoursTotal += stored
          continue
        }
        if (d.timeIn && d.timeOut) {
          const totalMinutes = Math.max(
            0,
            (d.timeOut.getTime() - d.timeIn.getTime()) / 60000 - 60, // unpaid 60-min break
          )
          const regularMinutes = Math.min(totalMinutes, workHoursPerDayForCap * 60)
          regularHoursTotal += regularMinutes / 60
        } else if (d.isLeave && d.isLeavePaid) {
          // Paid leave: credit a full standard day's hours
          regularHoursTotal += workHoursPerDayForCap
        } else if (!d.isAbsent) {
          // Present but no timestamps (manual DTR check-mark): credit full day
          regularHoursTotal += workHoursPerDayForCap
        }
      }
      regularHoursTotal = Math.round(regularHoursTotal * 100) / 100
    } else {
      regularHoursTotal = parseFloat((daysWorked * workHoursPerDayForCap).toFixed(2))
    }

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
    // For DAILY/HOURLY: this is ADDITIONAL pay (Art. 94 — paid full daily rate
    //   even when not working a regular holiday).
    // For MONTHLY: this is reclassified pay — the daily-rate value is already
    //   inside the monthly salary, but we expose it as a separate
    //   holidayPayAmount line on the payslip and DEDUCT the same amount from
    //   basic pay so HR sees the holiday breakdown without changing net.
    let regularHolidayNonWorkDays = 0
    {
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
          companyId: scopedCompanyId,
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
    // Loan amortization is split the same way as mandatory deductions —
    // MONTHLY=1, SEMI=2, WEEKLY=4, DAILY=22.
    const periodDivisor =
      run.payFrequency === 'SEMI_MONTHLY' ? 2
      : run.payFrequency === 'WEEKLY' ? 4
      : run.payFrequency === 'DAILY' ? 22
      : 1
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
        payFrequency:        run.payFrequency,
        isMinimumWageEarner:   emp.isMinimumWageEarner,
        isExemptFromTax:       emp.isExemptFromTax,
        disableHolidayPay:     (emp as { disableHolidayPay?: boolean }).disableHolidayPay ?? false,
        sssEnabled:            emp.sssEnabled,
        philhealthEnabled:     emp.philhealthEnabled,
        pagibigEnabled:        emp.pagibigEnabled,
        withholdingTaxEnabled: emp.withholdingTaxEnabled,
      },
      period: {
        start:        run.periodStart,
        end:          run.periodEnd,
        workingDays,
        payFrequency: run.payFrequency,
        isFirstCutoff: firstCutoff,
        nightDifferentialRate: nightDiffRate,
        regularOtRate: differentialRules.regularOtRate,
        restDayOtRate: differentialRules.restDayOtRate,
        regularHolidayOtRate: differentialRules.regularHolidayOtRate,
        specialHolidayOtRate: differentialRules.specialHolidayOtRate,
        disableLateDeductions,
      },
      attendance: {
        daysWorked,
        regularHours:          regularHoursTotal,
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
        hoursWorked:                regularHoursTotal,
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
  // Step 1: recompute-safe cleanup.
  //   (a) Read every PRIOR PayslipLoanDeduction for this run so we can credit
  //       those amounts back to the source loans — otherwise repeated
  //       recomputes silently double-debit the loan balance.
  //   (b) Delete the ledger rows + payslips.
  //   (c) Restore each loan: balance += prior debit, flip FULLY_PAID → ACTIVE
  //       and clear endDate; the new pass below will re-deduct + re-flag.
  const priorDeductions = await prisma.payslipLoanDeduction.findMany({
    where: { payslip: { payrollRunId: runId } },
    select: { loanId: true, amount: true },
  })
  const priorByLoan = new Map<string, number>()
  for (const d of priorDeductions) {
    priorByLoan.set(d.loanId, (priorByLoan.get(d.loanId) ?? 0) + Number(d.amount))
  }

  await prisma.$transaction([
    prisma.payslipLoanDeduction.deleteMany({
      where: { payslip: { payrollRunId: runId } },
    }),
    prisma.payslip.deleteMany({ where: { payrollRunId: runId } }),
    ...[...priorByLoan.entries()].map(([loanId, amount]) =>
      prisma.employeeLoan.update({
        where: { id: loanId },
        data: {
          balance: { increment: amount },
          status: 'ACTIVE',
          endDate: null,
        },
      }),
    ),
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
