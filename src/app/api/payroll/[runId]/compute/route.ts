import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { employeePeriodDivisor } from '@/lib/payroll/cutoff-frequency'
import { monthlyPayDays, monthlyPayAmounts, earnedBasicPay } from '@/lib/payroll/monthly-pay'
import { scheduleInstants, zonedParts, timezone } from '@/lib/attendance/timezone'
import { restDayPay } from '@/lib/payroll/rest-day-pay'
import { approvedChanges } from '@/lib/salary/service'
import { calculateSalary, salaryAt, salaryBreakdown, type SalarySnapshot } from '@/lib/salary/calculation'
import type { PayrollInput } from '@/lib/payroll/types'
import { dailyBreakdown } from '@/lib/payroll/daily-breakdown'
import { ADJUSTABLE_FIELDS } from '@/lib/payroll/review'
import { allocateDeductions, readDeductionCarryover } from '@/lib/payroll/deduction-carryover'
import { scheduledHourlyPayDays } from '@/lib/payroll/scheduled-hours'
import { hourlyCalculationBasis } from '@/lib/payroll/calculation-basis'
import { payslipTotals } from '@/lib/payroll/payslip-totals'
import { deriveDailyRate, deriveHourlyRate } from '@/lib/payroll/rates'
import { loanInstallment } from '@/lib/payroll/loan-repayment'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOtMapKey, getApprovedOtHoursMap } from '@/lib/overtime-requests'
import { computePayroll } from '@/lib/payroll/engine'
import { getWorkingDays } from '@/lib/utils'
import { logAudit } from '@/lib/audit'
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
/**
 * Roll timeOut forward by 24h when it lands at or before timeIn — covers
 * overnight shifts where the operator (or a manual DTR edit) stored
 * timeOut on the same calendar day as timeIn. Without this, an
 * 23:00 → 08:00 shift saved as 23:00 → 08:00 SAME DAY produces a
 * negative duration which gets clamped to 0, silently zeroing out the
 * employee's regular hours, OT, and ND. This applies to any code path
 * that computes (timeOut - timeIn).
 */
function normalizeOvernightOut(timeIn: Date, timeOut: Date): Date {
  if (timeOut.getTime() > timeIn.getTime()) return timeOut
  return new Date(timeOut.getTime() + 24 * 60 * 60 * 1000)
}

// Hard ceiling on per-shift night-differential. Matches PH practice of an
// 8-hour shift minus a 1-hour unpaid break = 7 paid hours, all of which
// can fall inside the ND window (22:00–06:00) at most. The cap stops
// early clock-ins (e.g. 22:45 for a scheduled 23:00 start) from padding
// ND beyond what the employee is actually being paid for the shift.
// Companies running planned shifts longer than 8 hours that want to
// credit more than 7 hours of ND should set this via PayrollCycleConfig
// in a follow-up — for now we apply a flat ceiling.
const MAX_ND_MINUTES_PER_SHIFT = 7 * 60

function countNightMinutes(params: {
  timeIn: Date
  timeOut: Date
  startMinutes: number
  endMinutes: number
}) {
  let minutes = 0
  const crossesMidnight = params.startMinutes > params.endMinutes
  const effectiveTimeOut = normalizeOvernightOut(params.timeIn, params.timeOut)
  let cursor = new Date(params.timeIn)
  while (cursor < effectiveTimeOut) {
    // PHT minute-of-day, regardless of server TZ
    const utcMin = cursor.getUTCHours() * 60 + cursor.getUTCMinutes()
    const currentMinutes = (utcMin + 8 * 60) % (24 * 60)
    const inWindow = crossesMidnight
      ? currentMinutes >= params.startMinutes || currentMinutes < params.endMinutes
      : currentMinutes >= params.startMinutes && currentMinutes < params.endMinutes
    if (inWindow) minutes += 1
    cursor = new Date(cursor.getTime() + 60_000)
  }
  // Cap at 7 paid hours per shift (see MAX_ND_MINUTES_PER_SHIFT note).
  return Math.min(minutes, MAX_ND_MINUTES_PER_SHIFT)
}

// ── Schedule-derived ND fallback ────────────────────────────────────────────
// When an employee has a FIXED schedule (e.g. "Nightshift 23:00–08:00") but
// no DTR rows in the period AND trackTime is off, we previously credited
// zero night-differential. That's wrong for monthly night-shift hires whose
// biometric isn't enrolled — they're contractually paid for the shift but
// the engine was acting as if they worked daytime. These helpers reconstruct
// scheduled ND from the assigned shift's overlap with the ND window times
// the number of workdays in the period.

function parseClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1]), mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h > 23 || mm > 59) return null
  return h * 60 + mm
}

function rangeSegments(start: number, end: number): Array<[number, number]> {
  // [start, end) within a single 24h day. When start >= end the range wraps
  // midnight and is split into two segments at midnight.
  if (start === end) return []
  if (start < end) return [[start, end]]
  return [[start, 1440], [0, end]]
}

/** Minutes a shift overlaps with the ND window in a single day. */
function shiftNdOverlapMinutes(
  shiftStart: number, shiftEnd: number,
  ndStart: number, ndEnd: number,
): number {
  let total = 0
  for (const [aStart, aEnd] of rangeSegments(shiftStart, shiftEnd)) {
    for (const [bStart, bEnd] of rangeSegments(ndStart, ndEnd)) {
      const s = Math.max(aStart, bStart)
      const e = Math.min(aEnd, bEnd)
      if (e > s) total += e - s
    }
  }
  return total
}

/**
 * Scheduled ND hours for the entire period. Iterates each calendar day in
 * [start, end] (inclusive) and credits the shift's ND overlap for every day
 * whose weekday is in the schedule's workDays mask.
 *
 * Uses getUTCDay() because periodStart/End are stored as UTC midnight in
 * Prisma — same convention used elsewhere in this route.
 */
function computeScheduledNdHoursForPeriod(opts: {
  timezone?: string
  shiftStartMin: number
  shiftEndMin: number
  workDays: number[]
  ndStartMin: number
  ndEndMin: number
  breakMinutes: number
  ndIncludesBreak: boolean
  periodStart: Date
  periodEnd: Date
}): number {
  // Same per-shift ceiling we apply to DTR-derived ND so monthly night-
  // shift hires don't end up with more credited ND than their actually-
  // clocked-in peers under the cap.
  let totalMin = 0
  const cursor = new Date(opts.periodStart)
  // Inclusive end — match the rest of the route which filters DTRs with `lte`
  const endMs = opts.periodEnd.getTime()
  while (cursor.getTime() <= endMs) {
    if (opts.workDays.includes(cursor.getUTCDay())) {
      const clock=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
      const bounds=scheduleInstants(cursor,clock(opts.shiftStartMin),clock(opts.shiftEndMin),timezone(opts.timezone))
      const start=bounds.scheduledStart?zonedParts(bounds.scheduledStart).minutes:opts.shiftStartMin
      const end=bounds.scheduledEnd?zonedParts(bounds.scheduledEnd).minutes:opts.shiftEndMin
      const overlap=Math.min(shiftNdOverlapMinutes(start,end,opts.ndStartMin,opts.ndEndMin),MAX_ND_MINUTES_PER_SHIFT)
      totalMin += opts.ndIncludesBreak?overlap:Math.max(0,overlap-opts.breakMinutes)
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return Math.round((totalMin / 60) * 100) / 100
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

  // Mirror the POST handler's scope when surfacing the variable-income
  // matrix — otherwise HR is asked to enter amounts for employees the run
  // will silently exclude later.
  const runScopeGet = run as unknown as {
    employeeScopeMode?: string | null
    employmentTypeFilter?: string[] | null
    employeeIds?: string[] | null
  }
  const scopeModeGet = runScopeGet.employeeScopeMode ?? 'ALL'
  const employeeWhereGet: {
    companyId: string
    isActive?: boolean
    id?: { in: string[] }
    employmentType?: { in: ('FULL_TIME' | 'PART_TIME' | 'CONTRACTUAL')[] }
  } = { companyId: ctx.companyId, isActive: true }
  if (scopeModeGet === 'CUSTOM' && (runScopeGet.employeeIds ?? []).length > 0) {
    employeeWhereGet.id = { in: runScopeGet.employeeIds! }
  } else if (scopeModeGet === 'EMPLOYMENT_TYPE' && (runScopeGet.employmentTypeFilter ?? []).length > 0) {
    employeeWhereGet.employmentType = {
      in: runScopeGet.employmentTypeFilter! as ('FULL_TIME' | 'PART_TIME' | 'CONTRACTUAL')[],
    }
  }

  const employees = await prisma.employee.findMany({
    where: employeeWhereGet,
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

  const preview = req.nextUrl.searchParams.get('review') === 'true'
  if (!isAdminKeyAuth && !await ctxHasPermission(ctx, 'payroll:write')) return NextResponse.json({error:'Payroll write permission required.'},{status:403})
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: scopedCompanyId },
    include: { company: { include: { contributionConfig: true } } },
  })

  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.runType === 'FINAL_PAY' || await prisma.payslip.findFirst({where:{payrollRunId:runId,calculationBasis:{path:['kind'],equals:'FINAL_PAY'}},select:{id:true}})) return NextResponse.json({error:'This run contains reviewed final pay. Remove its final-pay payslip before recomputing regular payroll, then generate final pay again.'},{status:409})
  if (run.runType === 'LEAVE_ENCASHMENT') return NextResponse.json({error:'This is a dedicated leave encashment payroll. Cancel the editable batch in Leave Encashment and generate a new batch to revise it.'},{status:409})
  if (run.runType === 'THIRTEENTH_MONTH') return NextResponse.json({error:'This is a 13th-month payroll. Delete the editable run and regenerate from 13th Month Pay to revise it.'},{status:409})
  if (!preview && ['APPROVED', 'LOCKED', 'DISBURSED'].includes(run.status)) {
    return NextResponse.json({ error: 'Payroll run is locked and cannot be recomputed' }, { status: 400 })
  }

  if(preview && !['APPROVED','LOCKED','DISBURSED'].includes(run.status))return NextResponse.json({error:'Review corrections on a finalized payroll.'},{status:409})
  const computationStartedAt = new Date()
  const claimed = preview ? {count:1} : await prisma.payrollRun.updateMany({
    where: { id: runId, payslips:{none:{calculationBasis:{path:['kind'],equals:'FINAL_PAY'}}}, OR: [{ computationStartedAt: null }, { computationStartedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } }], status: { notIn: ['APPROVED', 'LOCKED', 'DISBURSED'] } },
    data: { computationStartedAt },
  })
  if (!claimed.count) return NextResponse.json({ error: 'Payroll is already being computed or is locked' }, { status: 409 })
  try {
  const leaveEncashments = await prisma.leaveEncashment.findMany({
    where: { payrollRunId: runId, companyId: scopedCompanyId, status: 'APPROVED' },
    include: { balance: { select: { employeeId: true } }, incomeType: { select: { name: true } } },
  })
  const rawBody = await req.json().catch(() => ({}))
  const parsedPayload = computePayloadSchema.safeParse(rawBody)
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'Invalid computation payload' }, { status: 422 })
  }
  const variableIncomeEntriesInput = preview ? (await prisma.payrollRunIncomeEntry.findMany({where:{payrollRunId:runId}})).map(e=>({employeeId:e.employeeId,incomeTypeId:e.incomeTypeId,amount:Number(e.amount)})) : parsedPayload.data.variableIncomeEntries

  const rawWorkingDays = getWorkingDays(run.periodStart, run.periodEnd)
  const firstCutoff = run.payDate.getUTCDate() <= 15
  let payrollConfig: {
    enableOvertime: boolean
    enableNightDifferential: boolean
    nightDifferentialRate: { toNumber(): number } | number
    nightDifferentialStart?: string | null
    nightDifferentialEnd?: string | null
    nightDifferentialIncludesBreak?: boolean | null
    disableLateDeductions?: boolean
    disableUndertimeDeductions?: boolean
    workingDaysPerMonth?: { toNumber(): number } | number
    mandatoryDeductionFrequency?: 'SEMI_MONTHLY' | 'MONTHLY'
  } | null = null
  try {
    payrollConfig = await prisma.payrollCycleConfig.findUnique({
      where: { companyId: scopedCompanyId },
      select: {
        enableOvertime: true,
        enableNightDifferential: true,
        nightDifferentialRate: true,
        nightDifferentialStart: true,
        nightDifferentialEnd: true,
        nightDifferentialIncludesBreak: true,
        disableLateDeductions: true,
        disableUndertimeDeductions: true,
        workingDaysPerMonth: true,
        mandatoryDeductionFrequency: true,
      },
    })
  } catch {
    payrollConfig = null
  }
  const overtimeEnabled = payrollConfig?.enableOvertime ?? true
  const disableLateDeductions = payrollConfig?.disableLateDeductions ?? false
  const disableUndertimeDeductions = payrollConfig?.disableUndertimeDeductions ?? false
  const workingDaysPerMonth = Number(payrollConfig?.workingDaysPerMonth ?? 22)
  const mandatoryDeductionFrequency = payrollConfig?.mandatoryDeductionFrequency ?? 'SEMI_MONTHLY'
  const nightDifferentialEnabled = payrollConfig?.enableNightDifferential ?? true
  const nightDiffRate = nightDifferentialEnabled
    ? (payrollConfig?.nightDifferentialRate && typeof payrollConfig.nightDifferentialRate === 'object'
      ? payrollConfig.nightDifferentialRate.toNumber()
      : Number(payrollConfig?.nightDifferentialRate ?? 0.1))
    : 0
  // Honor the configured ND window if present; else fall back to PH DOLE
  // default of 22:00–06:00. Parsed once for both DTR scanning and the new
  // schedule-derived fallback so they agree on the boundary.
  const nightDiffStartMinutes = parseClockMinutes(payrollConfig?.nightDifferentialStart ?? null) ?? 22 * 60
  const nightDiffEndMinutes = parseClockMinutes(payrollConfig?.nightDifferentialEnd ?? null) ?? 6 * 60
  const ndIncludesBreak = payrollConfig?.nightDifferentialIncludesBreak ?? true
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

  // Fetch all active employees with their active loans. Schedule fields
  // (timeIn/timeOut/workDays/scheduleType) are needed for the schedule-
  // derived ND fallback applied to monthly night-shift hires with no DTR.
  // Honor the per-run employee scope set when the run was created. Default
  // mode "ALL" includes every active employee (back-compat). When the run
  // is targeted at a subset, narrow the where-clause so only those rows
  // get payslips. Cast read because Prisma types lag the new columns on
  // older deploys — the DDL has been applied to prod.
  const runScope = run as unknown as {
    employeeScopeMode?: string | null
    employmentTypeFilter?: string[] | null
    employeeIds?: string[] | null
  }
  const scopeMode = runScope.employeeScopeMode ?? 'ALL'
  const scopeEmploymentTypes = runScope.employmentTypeFilter ?? []
  const scopeEmployeeIds = runScope.employeeIds ?? []
  const employeeWhere: {
    companyId: string
    isActive?: boolean
    id?: { in: string[] }
    employmentType?: { in: ('FULL_TIME' | 'PART_TIME' | 'CONTRACTUAL')[] }
  } = { companyId: scopedCompanyId, isActive: true }
  if (scopeMode === 'CUSTOM' && scopeEmployeeIds.length > 0) {
    employeeWhere.id = { in: scopeEmployeeIds }
  } else if (scopeMode === 'EMPLOYMENT_TYPE' && scopeEmploymentTypes.length > 0) {
    employeeWhere.employmentType = {
      in: scopeEmploymentTypes as ('FULL_TIME' | 'PART_TIME' | 'CONTRACTUAL')[],
    }
  }

  if(preview){delete employeeWhere.isActive;delete employeeWhere.employmentType;employeeWhere.id={in:(await prisma.payslip.findMany({where:{payrollRunId:runId},select:{employeeId:true}})).map(p=>p.employeeId)}}
  const adjustmentRecords=await prisma.hrOperation.findMany({where:{companyId:scopedCompanyId,kind:'PAYROLL_ADJUSTMENT',status:'APPROVED',data:{path:['targetRunId'],equals:runId}},orderBy:{id:'asc'}})
  if(!preview&&adjustmentRecords.some(r=>!r.employeeId))throw new Error('An adjustment has no employee.')
  const sourceRuns = await prisma.payrollRun.findMany({
    where: { companyId: scopedCompanyId, id: { not: runId } },
    select: { id: true, updatedAt: true }, orderBy: { id: 'asc' },
  })
  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    include: {
      workSchedule: {
        select: {
          timezone: true,
          workHoursPerDay: true,
          scheduleType: true,
          timeIn: true,
          timeOut: true,
          workDays: true,
          breakMinutes: true,
          breakEnabled: true,
        },
      },
      loans: { where: { OR: [{ status: 'ACTIVE' }, { deductions: { some: { payslip: { payrollRunId: runId } } } }] }, orderBy: [{ startDate: 'asc' }, { id: 'asc' }] },
      incomeAssignments: {
        where: { isActive: true, incomeType: { isActive: true } },
        include: { incomeType: true },
      },
    },
  })

  const existingRepayments = await prisma.payslipLoanDeduction.findMany({
    where: { payslip: { payrollRunId: runId } }, select: { loanId: true, amount: true },
  })
  const restoredLoanAmounts = new Map(existingRepayments.map(d => [d.loanId, Number(d.amount)]))
  // A downstream payroll has consumed this run's carryover. Prevent stale chains.
  const laterPayroll = await prisma.payslip.findFirst({ where: {
    employeeId: { in: employees.map(e => e.id) },
    payrollRun: { runType: 'REGULAR', companyId: scopedCompanyId, id: { not: runId }, status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] }, OR: [
      { payDate: { gt: run.payDate } },
      { payDate: run.payDate, periodEnd: { gt: run.periodEnd } },
      { payDate: run.payDate, periodEnd: run.periodEnd, createdAt: { gt: run.createdAt } },
    ] },
  }, select: { id: true } })
  if (laterPayroll && !preview) return NextResponse.json({ error: 'A later payroll already exists for these employees. Remove or cancel later draft payrolls before recomputing an earlier cycle so carried deductions are not counted twice.' }, { status: 409 })

  // Per-employee "Other Deductions" line items. Fetched separately (and
  // guarded) so a not-yet-migrated table can't break the whole payroll compute
  // — it just yields zero deductions until the migration is applied. We keep
  // the individual items so the payslip can show a breakdown.
  const otherDeductionMap = new Map<string, { label: string; amount: number }[]>()
  try {
    const items = await prisma.employeeOtherDeduction.findMany({
      where: { employeeId: { in: employees.map(e => e.id) }, isActive: true },
      select: { employeeId: true, label: true, amount: true },
      orderBy: { createdAt: 'asc' },
    })
    for (const it of items) {
      const list = otherDeductionMap.get(it.employeeId) ?? []
      list.push({ label: it.label, amount: Number(it.amount) })
      otherDeductionMap.set(it.employeeId, list)
    }
    // Active employee-paid benefit premiums are monthly amounts. Split them
    // across the run frequency and include them in the same itemized deduction
    // bucket used by recurring employee deductions.
    const benefitDivisor = run.payFrequency === 'MONTHLY' ? 1 : run.payFrequency === 'SEMI_MONTHLY' ? 2 : run.payFrequency === 'WEEKLY' ? 4 : 22
    const enrollments = await prisma.employeeBenefitEnrollment.findMany({
      where: {
        employeeId: { in: employees.map(e => e.id) }, status: 'ACTIVE',
        effectiveDate: { lte: run.periodEnd }, OR: [{ endDate: null }, { endDate: { gte: run.periodStart } }],
      },
      include: { plan: { select: { name: true, employeeShare: true, isActive: true } } },
    })
    for (const enrollment of enrollments) {
      if (!enrollment.plan.isActive) continue
      const monthly = Number(enrollment.employeeShare ?? enrollment.plan.employeeShare)
      if (monthly <= 0) continue
      const list = otherDeductionMap.get(enrollment.employeeId) ?? []
      list.push({ label: `Benefit: ${enrollment.plan.name}`, amount: Math.round(monthly / benefitDivisor * 100) / 100 })
      otherDeductionMap.set(enrollment.employeeId, list)
    }
  } catch (err) {
    console.error('[payroll compute] other deductions unavailable (run migration)', err)
  }

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

  if (leaveEncashments.some(e => !employees.some(employee => employee.id === e.balance.employeeId))) {
    return NextResponse.json({ error: 'An approved leave encashment belongs to an employee outside this payroll. Restore the employee scope or cancel the encashment before computing.' }, { status: 409 })
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
  // When overtime is disabled for the company, ignore any APPROVED OT
  // requests for this period — they shouldn't pay out and shouldn't appear
  // as overtime hours on the enhanced DTR rows either.
  const approvedOtMap = await getApprovedOtHoursMap({
    companyId: scopedCompanyId,
    dateFrom: run.periodStart,
    dateTo: run.periodEnd,
  })

  // ── Build payslip input data for each employee ─────────────────────────────
  const hourlyAssignments = await prisma.employeeShiftAssignment.findMany({
    where: { companyId: scopedCompanyId, employeeId: { in: employees.filter(e => e.rateType === 'HOURLY' || e.rateType === 'MONTHLY').map(e => e.id) }, date: { gte: run.periodStart, lte: run.periodEnd } },
    include: { schedule: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  })

  const monthlyLeaves = await prisma.leaveRequest.findMany({
    where: { employee: { companyId: scopedCompanyId }, employeeId: { in: employees.filter(e => e.rateType === 'MONTHLY').map(e => e.id) }, status: 'APPROVED', startDate: { lte: run.periodEnd }, endDate: { gte: run.periodStart } },
    include: { leaveType: { select: { isWithPay: true } } },
  })
  const salaryRecords = await prisma.hrOperation.findMany({where:{companyId:scopedCompanyId,kind:'SALARY_CHANGE',status:'APPROVED'},orderBy:{id:'asc'}})
  if(salaryRecords.some(r=>(r.data as Record<string,unknown>).retroTargetRunId===runId&&!employees.some(e=>e.id===r.employeeId)))throw new Error('A scheduled retro-pay employee is no longer in this payroll scope. Unschedule their retro pay in HR Center first.')
  type PayslipBuildItem = {
    employeeId: string
    data: Parameters<typeof prisma.payslip.create>[0]['data']
    loanDeductions: { id: string; type: string; amount: number }[]
    incomes: { incomeTypeId: string; typeName: string; amount: number; isTaxable: boolean }[]
  }

  const reviewIssues: {employeeId:string;message:string}[]=[]
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

    if(preview&&((emp.trackTime&&dtrRecords.some(d=>d.timeIn&&(!d.timeOut||!d.approvedBy)))||dtrRecords.some(d=>d.restDayApproval==='PENDING'||d.restDayApproval==='REJECTED'))){reviewIssues.push({employeeId:emp.id,message:'Complete and approve this employee attendance and rest-day shifts before reviewing corrections.'});continue}
    // Enhance each DTR record:
    // 1. Auto-detect holiday from company calendar (overrides whatever was stored)
    // 2. Auto-compute OT/regular hours from timeIn/timeOut if missing
    if (emp.trackTime && dtrRecords.some(d => d.source === 'OFFLINE' && (!d.timeOut || !d.approvedBy))) return NextResponse.json({ error: `Review ${emp.employeeNo}'s offline attendance before computing payroll.` }, { status: 409 })
    const pendingRest = dtrRecords.filter(d => d.isRestDay && (d.restDayApproval === 'PENDING' || d.restDayApproval === 'REJECTED'))
    if (pendingRest.length) return NextResponse.json({ error: `Review ${emp.employeeNo}'s unresolved rest-day shifts in Time Sheets before computing payroll.` }, { status: 409 })
    const restRecords = dtrRecords.filter(d => d.isRestDay && d.restDayApproval === 'APPROVED')
    if (restRecords.some(d => !d.timeOut || (emp.trackTime && !d.approvedBy))) return NextResponse.json({ error: `Complete and approve ${emp.employeeNo}'s rest-day attendance before computing payroll.` }, { status: 409 })
    const remainingApprovedOt = new Map(approvedOtMap)
    const enhancedDtr = dtrRecords.filter(d => !d.restDayApproval).map(d => {
      const dateKey = new Date(d.date).toISOString().split('T')[0]
      const holiday = holidayMap.get(dateKey)

      const otKey = buildOtMapKey(emp.id, d.date)
      const payableOt = d.timeIn && d.timeOut ? (remainingApprovedOt.get(otKey) ?? 0) : 0
      if (d.timeIn && d.timeOut) remainingApprovedOt.set(otKey, 0)
      let nightDiffHours = d.nightDiffHours?.toNumber() ?? 0
      if (d.timeIn && d.timeOut) {
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
        // Recognize a holiday from the company calendar OR the DTR row's own
        // flag, so a shift worked on a holiday still earns the premium (200%
        // for REGULAR) even if that date isn't in the calendar yet / was added
        // late. Calendar still wins on the holiday TYPE when present.
        isHoliday: !!holiday || d.isHoliday === true,
        holidayType: holiday?.type ?? d.holidayType,
        overtimeHours: payableOt,
        nightDiffHours,
      }
    })

    const hasDtr = enhancedDtr.length > 0
    // Half-day leave counts as 0.5 worked day (if paid) or 0.5 absent day (if unpaid).
    // Full rows: count as 1.0; half-day rows: count as 0.5.
    const dtrWorked = enhancedDtr.reduce((sum, d) => {
      if (d.isAbsent) return sum
      if (d.isLeave && !d.isLeavePaid) return sum
      return sum + ((d as { isHalfDay?: boolean }).isHalfDay ? 0.5 : 1)
    }, 0)
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
          const effOut = normalizeOvernightOut(d.timeIn, d.timeOut)
          const totalMinutes = Math.max(
            0,
            (effOut.getTime() - d.timeIn.getTime()) / 60000 - 60, // unpaid 60-min break
          )
          const regularMinutes = Math.min(totalMinutes, workHoursPerDayForCap * 60)
          regularHoursTotal += regularMinutes / 60
        } else if (d.isLeave && d.isLeavePaid) {
          // Paid leave: credit full or half standard day's hours
          const halfDay = (d as { isHalfDay?: boolean }).isHalfDay ?? false
          regularHoursTotal += halfDay ? workHoursPerDayForCap / 2 : workHoursPerDayForCap
        } else if (!d.isAbsent) {
          // Present but no timestamps (manual DTR check-mark): credit full day
          regularHoursTotal += workHoursPerDayForCap
        }
      }
      regularHoursTotal = Math.round(regularHoursTotal * 100) / 100
    } else {
      regularHoursTotal = parseFloat((daysWorked * workHoursPerDayForCap).toFixed(2))
    }

    // Overtime requires DTR-based pay — NOT `trackTime || hasDtr` like the
    // other DTR-derived figures below.
    //
    // Overtime is entirely a product of clock data. An employee with
    // trackTime=false is paid on a fixed basis, so their basic pay already
    // covers the period regardless of hours; paying overtime on top of that
    // from stray DTR rows pays twice for the same time. Night differential
    // and late/undertime deliberately keep the looser `|| hasDtr` condition:
    // those are premiums and deductions that still apply to a fixed-pay
    // employee when clock data happens to exist.
    const regularOtHoursRaw = emp.trackTime
      ? enhancedDtr.reduce((s, d) => s + d.overtimeHours, 0)
      : 0
    let nightDiffHoursRaw = emp.trackTime || hasDtr
      ? enhancedDtr.reduce((s, d) => s + d.nightDiffHours, 0)
      : 0

    // Schedule-derived ND fallback. Only fires when:
    //   - DTR-based ND is zero (either trackTime off + no DTRs, or DTRs
    //     present but none touched the ND window), AND
    //   - the employee has a FIXED schedule with valid timeIn/timeOut and
    //     non-empty workDays, AND
    //   - the shift actually overlaps the ND window (e.g. a 23:00–08:00
    //     night shift; daytime schedules naturally produce 0 and exit).
    // This catches monthly night-shift hires whose biometric isn't enrolled —
    // they're contractually paid for the night premium even when no clock
    // events are captured.
    if (nightDiffHoursRaw === 0
        && emp.workSchedule?.scheduleType === 'FIXED'
        && emp.workSchedule.timeIn
        && emp.workSchedule.timeOut) {
      const shiftStart = parseClockMinutes(emp.workSchedule.timeIn)
      const shiftEnd = parseClockMinutes(emp.workSchedule.timeOut)
      const workDays = Array.isArray(emp.workSchedule.workDays)
        ? (emp.workSchedule.workDays as unknown[])
            .map(v => Number(v))
            .filter(v => Number.isInteger(v) && v >= 0 && v <= 6)
        : []
      if (shiftStart !== null && shiftEnd !== null && workDays.length > 0) {
        const scheduledNd = computeScheduledNdHoursForPeriod({
          timezone: emp.workSchedule.timezone,
          shiftStartMin: shiftStart,
          shiftEndMin: shiftEnd,
          workDays,
          ndStartMin: nightDiffStartMinutes,
          ndEndMin: nightDiffEndMinutes,
          breakMinutes: Number(emp.workSchedule.breakMinutes ?? 60),
          ndIncludesBreak,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
        })
        if (scheduledNd > 0) nightDiffHoursRaw = scheduledNd
      }
    }

    const regularOtHours = (overtimeEnabled || emp.overtimePayOverride) ? regularOtHoursRaw : 0
    const nightDiffHours = nightDifferentialEnabled && !emp.disableNightDifferential ? nightDiffHoursRaw : 0
    const lateMinutes = emp.trackTime || hasDtr
      ? enhancedDtr.reduce((s, d) => s + (d.lateMinutes ?? 0), 0)
      : 0
    const undertimeMinutes = emp.trackTime || hasDtr
      ? enhancedDtr.reduce((s, d) => s + (d.undertimeMinutes ?? 0), 0)
      : 0
    // Credit the full scheduled value of each worked day in Basic Pay.
    // `regularHoursTotal` is actual clocked time and may already exclude
    // late/undertime minutes; using it here would deduct those minutes once
    // from Basic Pay and again in the explicit deduction lines below.
    const hourlySchedule = emp.rateType === 'HOURLY' ? scheduledHourlyPayDays({
      attendance: enhancedDtr,
      assignments: hourlyAssignments.filter(a => a.employeeId === emp.id),
      defaultSchedule: emp.workSchedule,
      trackTime: emp.trackTime,
      start: run.periodStart,
      end: run.periodEnd,
    }) : null
    if (hourlySchedule?.errors.length) {
      return NextResponse.json({ error: `Cannot compute hourly pay for ${emp.employeeNo}. Correct the schedule: ${hourlySchedule.errors.join('; ')}` }, { status: 422 })
    }
    const scheduledHoursTotal = hourlySchedule?.hours ?? Number((daysWorked * workHoursPerDayForCap).toFixed(2))
    // Unpaid half-day leave counts as 0.5 absent day
    const dtrAbsent = enhancedDtr.reduce((sum, d) => {
      if (d.isAbsent) return sum + 1
      // Unpaid half-day leave: 0.5 absent day
      if (d.isLeave && !d.isLeavePaid && (d as { isHalfDay?: boolean }).isHalfDay) return sum + 0.5
      return sum
    }, 0)
    // If trackTime is enabled, basic pay is already pro-rated by daysWorked,
    // so do not apply absence deductions again.
    const absentDays = emp.trackTime ? 0 : dtrAbsent
    const regularHolidaysWorked  = enhancedDtr.filter(d => d.isHoliday && d.holidayType === 'REGULAR'             && !d.isAbsent).length
    const specialHolidaysWorked  = enhancedDtr.filter(d => d.isHoliday && d.holidayType === 'SPECIAL_NON_WORKING' && !d.isAbsent).length

    // ── Hours-on-holiday tracking (HOURLY employees) ───────────────────
    // For each DTR that landed on a company holiday and where the
    // employee actually clocked in, sum the regular hours worked. The
    // engine uses this to pro-rate the +100% / +30% premium for HOURLY
    // employees so a half-day clock-in on a holiday yields a half-day
    // premium rather than a full day's worth. MONTHLY/DAILY ignore
    // these fields and stick to the day-count formula.
    const holidayHoursByDate: Record<string, number> = {}
    let regularHolidayHoursWorked = 0
    let specialHolidayHoursWorked = 0
    if (emp.rateType === 'HOURLY' && hasDtr) {
      for (const d of enhancedDtr) {
        if (!d.isHoliday || d.isAbsent) continue
        if (d.isLeave && !d.isLeavePaid) continue
        const stored = d.regularHours?.toNumber?.() ?? Number(d.regularHours ?? 0)
        let hrs = 0
        if (stored > 0) {
          hrs = stored
        } else if (d.timeIn && d.timeOut) {
          const effOut = normalizeOvernightOut(d.timeIn, d.timeOut)
          const totalMinutes = Math.max(
            0,
            (effOut.getTime() - d.timeIn.getTime()) / 60000 - 60,
          )
          hrs = Math.min(totalMinutes, workHoursPerDayForCap * 60) / 60
        }
        holidayHoursByDate[d.id] = hrs
        if (hrs <= 0) continue
        if (d.holidayType === 'REGULAR') regularHolidayHoursWorked += hrs
        else if (d.holidayType === 'SPECIAL_NON_WORKING') specialHolidayHoursWorked += hrs
      }
      regularHolidayHoursWorked = Math.round(regularHolidayHoursWorked * 100) / 100
      specialHolidayHoursWorked = Math.round(specialHolidayHoursWorked * 100) / 100
    }

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
          payDate: { lte: run.payDate },
          status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
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

    const configuredWorkHours = Number(emp.workSchedule?.workHoursPerDay ?? 8)
    const effectiveWorkHoursPerDay = Number.isFinite(configuredWorkHours) && configuredWorkHours > 0
      ? configuredWorkHours
      : 8
    const rateEmployee = { basicSalary: emp.basicSalary.toNumber(), dailyRate: Number(emp.dailyRate), hourlyRate: Number(emp.hourlyRate), rateType: emp.rateType }
    const rateBasis = { workHoursPerDay: effectiveWorkHoursPerDay, workingDaysPerMonth }
    const dailyRate = deriveDailyRate(rateEmployee, rateBasis)
    const hourlyRate = deriveHourlyRate(rateEmployee, rateBasis)

    // ── Loan deductions: cap each at remaining balance ─────────────────────
    const periodDivisor = employeePeriodDivisor(emp.payFrequency)
    const previousPayslip = await prisma.payslip.findFirst({
      where: { employeeId: emp.id, payrollRun: {
        companyId: scopedCompanyId, runType: 'REGULAR', id: { not: runId },
        status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
        OR: [
          { payDate: { lt: run.payDate } },
          { payDate: run.payDate, periodEnd: { lt: run.periodEnd } },
          { payDate: run.payDate, periodEnd: run.periodEnd, createdAt: { lt: run.createdAt } },
        ],
      } },
      orderBy: [{ payrollRun: { payDate: 'desc' } }, { payrollRun: { periodEnd: 'desc' } }, { payrollRun: { createdAt: 'desc' } }],
      select: { calculationBasis: true },
    })
    const incoming = readDeductionCarryover(previousPayslip?.calculationBasis)
    const loanDeductions = emp.loans.filter(l => l.startDate <= run.periodEnd && l.manualPaidBalance == null).map(loan => {
      const balance = Number(loan.balance) + (restoredLoanAmounts.get(loan.id) ?? 0)
      const arrears = incoming?.loans.find(l => l.id === loan.id)?.deferred ?? 0
      const installment = loan.cutoffInstallment != null ? Math.min(Number(loan.cutoffInstallment), balance) : loanInstallment(Number(loan.monthlyAmortization), periodDivisor, balance)
      return { id: loan.id, type: loan.loanType, label: loan.loanNo || `${loan.loanType.replaceAll('_', ' ')} (${loan.id.slice(-6)})`, incoming: Math.min(balance, arrears), amount: Math.min(balance, installment + arrears) }
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

    // Ledger entries are independent of manually entered variable income and survive recomputation.
    for (const entry of leaveEncashments.filter(e => e.balance.employeeId === emp.id)) {
      const same = incomeBreakdown.find(i => i.incomeTypeId === entry.incomeTypeId)
      if (same) same.amount = Number((same.amount + Number(entry.amount)).toFixed(2))
      else incomeBreakdown.push({ incomeTypeId: entry.incomeTypeId, typeName: entry.incomeType.name, amount: Number(entry.amount), isTaxable: entry.isTaxable })
    }
    const additionalTaxableIncome = incomeBreakdown
      .filter(item => item.isTaxable)
      .reduce((sum, item) => sum + item.amount, 0)
    const additionalNonTaxableIncome = incomeBreakdown
      .filter(item => !item.isTaxable)
      .reduce((sum, item) => sum + item.amount, 0)
    const totalOtherIncome = additionalTaxableIncome + additionalNonTaxableIncome

    // Match statutory remittance reports: reconcile by pay-date month, never
    // include this run, future runs, drafts or cancelled payrolls.
    const mandatoryPrior = await prisma.payslip.aggregate({
      where: { employeeId: emp.id, payrollRunId: { not: runId }, payrollRun: {
        companyId: scopedCompanyId, runType: 'REGULAR',
        status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
        payDate: { gte: new Date(Date.UTC(run.payDate.getUTCFullYear(), run.payDate.getUTCMonth(), 1)) },
        OR: [{ payDate: { lt: run.payDate } }, { payDate: run.payDate, periodEnd: { lt: run.periodEnd } },
          { payDate: run.payDate, periodEnd: run.periodEnd, createdAt: { lt: run.createdAt } }],
      } },
      _count: { id: true },
      _sum: { grossPay: true, lateDeduction: true, undertimeDeduction: true, absenceDeduction: true,
        sssEmployee: true, sssEmployer: true, sssEc: true, philhealthEmployee: true, philhealthEmployer: true, pagibigEmployee: true, pagibigEmployer: true },
    })
    const sums = mandatoryPrior._sum
    const mandatoryMonthToDate = {
      compensation: Math.max(0, Number(sums.grossPay ?? 0) - Number(sums.lateDeduction ?? 0) - Number(sums.undertimeDeduction ?? 0) - Number(sums.absenceDeduction ?? 0)),
      periods: mandatoryPrior._count.id,
      sssEmployee: Number(sums.sssEmployee ?? 0), sssEmployer: Number(sums.sssEmployer ?? 0), sssEc: Number(sums.sssEc ?? 0),
      philhealthEmployee: Number(sums.philhealthEmployee ?? 0), philhealthEmployer: Number(sums.philhealthEmployer ?? 0),
      pagibigEmployee: Number(sums.pagibigEmployee ?? 0), pagibigEmployer: Number(sums.pagibigEmployer ?? 0),
    }
    const payrollInput: PayrollInput = {
      mandatoryMonthToDate,
      employee: {
        id: emp.id,
        basicSalary:         emp.basicSalary.toNumber(),
        dailyRate,
        hourlyRate,
        rateType:            emp.rateType,
        payFrequency:        run.payFrequency,
        isMinimumWageEarner:   emp.isMinimumWageEarner,
        isExemptFromTax:       emp.isExemptFromTax,
        disableNightDifferential: emp.disableNightDifferential,
        disableHolidayPay:     (emp as { disableHolidayPay?: boolean }).disableHolidayPay ?? false,
        disableLateDeduction:  (emp as { disableLateDeduction?: boolean }).disableLateDeduction ?? false,
        disableUndertimeDeduction: (emp as { disableUndertimeDeduction?: boolean }).disableUndertimeDeduction ?? false,
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
        mandatoryDeductionFrequency,
        nightDifferentialRate: nightDiffRate,
        regularOtRate: differentialRules.regularOtRate,
        restDayOtRate: differentialRules.restDayOtRate,
        regularHolidayOtRate: differentialRules.regularHolidayOtRate,
        specialHolidayOtRate: differentialRules.specialHolidayOtRate,
        disableLateDeductions,
        disableUndertimeDeductions,
        workHoursPerDay: effectiveWorkHoursPerDay,
        workingDaysPerMonth,
      },
      attendance: {
        daysWorked,
        regularHours:          regularHoursTotal,
        scheduledHours:        scheduledHoursTotal,
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
        regularHolidayHoursWorked,
        specialHolidayHoursWorked,
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
    }
    const history=approvedChanges(salaryRecords.filter(r=>r.employeeId===emp.id))
    if(history.some(c=>c.rateType!==emp.rateType))throw new Error('Salary rate type changed outside the dated history. Review '+emp.employeeNo)
    const endRate=salaryAt(history,run.periodEnd.toISOString().slice(0,10),Number(emp.basicSalary))
    const monthlyDays = emp.rateType === 'MONTHLY' && ['MONTHLY', 'SEMI_MONTHLY', 'WEEKLY'].includes(run.payFrequency) ? monthlyPayDays({
      start: run.periodStart, end: run.periodEnd, frequency: run.payFrequency, salary: Number(emp.basicSalary), trackTime: emp.trackTime,
      hireDate: emp.hireDate, terminationDate: emp.terminationDate, workDays: emp.workSchedule?.workDays,
      assignments: hourlyAssignments.filter(a => a.employeeId === emp.id), attendance: enhancedDtr,
      leaves: monthlyLeaves.filter(l => l.employeeId === emp.id), holidays: companyHolidays.filter(h => h.type !== 'SPECIAL_WORKING'),
    }) : undefined
    if (monthlyDays) payrollInput.monthlyPay = monthlyPayAmounts(monthlyDays, workingDaysPerMonth)
    const originalResult=computePayroll(payrollInput)
    const originalBreakdown=dailyBreakdown({attendance:enhancedDtr,holidays:companyHolidays,hourlyDays:hourlySchedule?.days??null,holidayHours:holidayHoursByDate,rateType:emp.rateType,dailyRate,hourlyRate,workHours:workHoursPerDayForCap,trackTime:emp.trackTime,start:run.periodStart,end:run.periodEnd,disableHoliday:emp.disableHolidayPay??false,basicTotal:originalResult.basicPay,premiumTotal:originalResult.holidayPayAmount})
    const salaryDays=originalBreakdown.rows.map(row=>{
      const d=row.attendanceId?enhancedDtr.find(d=>d.id===row.attendanceId):undefined
      return {date:row.date,rate:Number(emp.basicSalary),basicUnits:emp.rateType==='HOURLY'?row.hours:row.days,holidayUnits:row.holidayCredit>0?1:0,premiumUnits:row.premiumUnits*row.premiumFactor,
        otUnits:emp.trackTime&&(overtimeEnabled||emp.overtimePayOverride)?Number(d?.overtimeHours??0)*differentialRules.regularOtRate:0,
        nightUnits:nightDifferentialEnabled&&!emp.disableNightDifferential?Number(d?.nightDiffHours??0)*nightDiffRate:0,
        lateUnits:disableLateDeductions||emp.disableLateDeduction?0:Number(d?.lateMinutes??0),underUnits:disableUndertimeDeductions||emp.disableUndertimeDeduction?0:Number(d?.undertimeMinutes??0)}
    })
    const originalSnapshot=calculateSalary({version:1,rateType:emp.rateType,divisor:workingDaysPerMonth,hours:effectiveWorkHoursPerDay,days:salaryDays,monthlyDays,amounts:originalResult,changeIds:[]},[])
    const canDateSalary=(Object.keys(originalSnapshot.amounts) as (keyof typeof originalSnapshot.amounts)[]).every(k=>Math.abs(originalSnapshot.amounts[k]-originalResult[k])<=0.02)
    const ratesChanged=[...salaryDays,...(monthlyDays??[])].some(d=>salaryAt(history,d.date,d.rate)!==d.rate)
    if(ratesChanged&&!canDateSalary)throw new Error('Dated salary computation requires a reconciled daily breakdown for '+emp.employeeNo+'. Review daily pay and scheduled night differential before computing.')
    const salarySnapshot:SalarySnapshot|null=canDateSalary?calculateSalary(originalSnapshot,history):null
    payrollInput.employee.basicSalary=endRate
    payrollInput.employee.dailyRate=deriveDailyRate({...rateEmployee,basicSalary:endRate},rateBasis)
    payrollInput.employee.hourlyRate=deriveHourlyRate({...rateEmployee,basicSalary:endRate},rateBasis)
    if(history.length)payrollInput.rateAmounts=ratesChanged&&salarySnapshot?salarySnapshot.amounts:originalResult
    const retroItems=salaryRecords.filter(r=>r.employeeId===emp.id).flatMap(r=>{
      const d=r.data as Record<string,unknown>
      return d.retroTargetRunId===runId?(d.retroItems as {sourceId:string;basic:number;other:number}[]??[]):[]
    })
    const corrections=adjustmentRecords.filter(r=>r.employeeId===emp.id).map(r=>({id:r.id,...r.data as {basic:number;other:number}}))
    payrollInput.retroBasic=retroItems.reduce((n,r)=>n+r.basic,0)+corrections.reduce((n,r)=>n+r.basic,0)
    payrollInput.additionalTaxableIncome+=retroItems.reduce((n,r)=>n+r.other,0)+corrections.reduce((n,r)=>n+r.other,0)
    const restDayBreak = emp.workSchedule?.breakEnabled === false ? 0 : emp.workSchedule?.breakMinutes ?? 60
    const restDayBreakdown = restDayPay(restRecords.map(d => ({ ...d, holidayType: holidayMap.get(d.date.toISOString().slice(0,10))?.type ?? d.holidayType })), date => deriveHourlyRate({ ...rateEmployee, basicSalary: salaryAt(history, date, Number(emp.basicSalary)) }, rateBasis), restDayBreak)
    const restDayTotal = Number(restDayBreakdown.reduce((sum, row) => sum + row.total, 0).toFixed(2))
    payrollInput.additionalTaxableIncome += restDayTotal
    const result=computePayroll(payrollInput)
    const datedBreakdown=ratesChanged&&salarySnapshot?salaryBreakdown(originalBreakdown,salarySnapshot):originalBreakdown

    const sssLoans     = loanDeductions.filter(l => l.type.startsWith('SSS')        ).reduce((s, l) => s + l.amount, 0)
    const pagibigLoans = loanDeductions.filter(l => l.type.startsWith('PAGIBIG')    ).reduce((s, l) => s + l.amount, 0)
    const companyLoans = loanDeductions.filter(l => l.type === 'COMPANY_LOAN'       ).reduce((s, l) => s + l.amount, 0)
    const otherLoans   = loanDeductions.filter(l => !l.type.startsWith('SSS') && !l.type.startsWith('PAGIBIG') && l.type !== 'COMPANY_LOAN').reduce((s, l) => s + l.amount, 0)

    // Employee "Other Deductions" (recurring, set up on the employee profile).
    const otherDeductionItems = otherDeductionMap.get(emp.id) ?? []
    const otherDeductionsTotal = parseFloat(
      (otherDeductionItems.reduce((s, d) => s + d.amount, 0) + (incoming?.otherDeferred ?? 0)).toFixed(2),
    )
    const totalDeductionsWithOther = parseFloat((result.totalDeductions + otherDeductionsTotal).toFixed(2))
    const netPayWithOther = parseFloat((result.netPay - otherDeductionsTotal).toFixed(2))

    builds.push({
      employeeId: emp.id,
      loanDeductions,
      data: {
        payrollRunId:               runId,
        employeeId:                 emp.id,
        basicSalary:                result.basicPay,
        calculationBasis: { corrections, monthlyPay: monthlyDays ? { version: 1, frequency: run.payFrequency, divisor: workingDaysPerMonth, days: salarySnapshot?.monthlyDays ?? monthlyDays, ...monthlyPayAmounts(salarySnapshot?.monthlyDays ?? monthlyDays, workingDaysPerMonth) } : null, restDayBreakdown, dailyBreakdown: datedBreakdown, salarySnapshot, retroItems, ...(hourlySchedule&&!ratesChanged ? hourlyCalculationBasis(hourlyRate, hourlySchedule.days) : {}), incomingOther: incoming?.otherDeferred ?? 0 } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        dailyRate: payrollInput.employee.dailyRate,
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
        otherEarnings:              totalOtherIncome + restDayTotal + retroItems.reduce((n,r)=>n+r.other,0) + corrections.reduce((n,r)=>n+r.other,0),
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
        otherDeductions:            otherDeductionsTotal,
        totalDeductions:            totalDeductionsWithOther,
        netPay:                     netPayWithOther,
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
    totalDeductions  += totalDeductionsWithOther
    totalNetPay      += netPayWithOther
    totalSssEr       += result.sssEmployer
    totalPhEr        += result.philhealthEmployer
    totalPagibigEr   += result.pagibigEmployer
  }

  if(preview)return NextResponse.json({employees:builds.map(b=>b.data),issues:reviewIssues},{headers:{'Cache-Control':'no-store'}})
  if(adjustmentRecords.some(r=>!employees.some(e=>e.id===r.employeeId)))throw new Error('An approved adjustment employee is outside the payroll scope.')
  const { priorByLoan, priorManualEdits, aggregated, loanTotalsDeducted, changedEmployees, netPayChange } = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scopedCompanyId}))`
    await tx.$queryRaw`SELECT id FROM employee_loans WHERE "companyId" = ${scopedCompanyId} ORDER BY id FOR UPDATE`
    const correctionEmployeeIds=adjustmentRecords.map(r=>r.employeeId!).filter(Boolean)
    if(correctionEmployeeIds.length){const overrides=await tx.payslip.findMany({where:{payrollRunId:runId,employeeId:{in:correctionEmployeeIds}}});if(overrides.some(p=>p.manualEdits&&Object.keys(p.manualEdits as object).length))throw new Error('Remove manual payslip overrides for correction recipients before recomputing.')}
    const freshAdjustments=await tx.hrOperation.findMany({where:{companyId:scopedCompanyId,kind:'PAYROLL_ADJUSTMENT',status:'APPROVED',data:{path:['targetRunId'],equals:runId}},orderBy:{id:'asc'}})
    if(JSON.stringify(adjustmentRecords)!==JSON.stringify(freshAdjustments))throw new Error('Adjustments changed during computation. Recompute again.')
    const freshSalary=await tx.hrOperation.findMany({where:{companyId:scopedCompanyId,kind:'SALARY_CHANGE',status:'APPROVED'},orderBy:{id:'asc'}})
    if(JSON.stringify(salaryRecords)!==JSON.stringify(freshSalary))throw new Error('Salary approvals changed during computation. Recompute again.')
    const freshSources = await tx.payrollRun.findMany({ where: { companyId: scopedCompanyId, id: { not: runId } }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } })
    if (JSON.stringify(sourceRuns) !== JSON.stringify(freshSources)) throw new Error('Payroll inputs changed during computation. Please recompute again.')
    for (const employee of employees) {
      const freshLoans = await tx.employeeLoan.findMany({ where: { id: { in: employee.loans.map(l => l.id) } }, select: { id: true, balance: true, updatedAt: true } })
      if (employee.loans.some(l => { const fresh = freshLoans.find(f => f.id === l.id); return !fresh || Number(fresh.balance) !== Number(l.balance) || fresh.updatedAt.getTime() !== l.updatedAt.getTime() })) throw new Error('A loan changed during computation. Please recompute again.')
    }

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

  // ── Persist everything in a transaction ───────────────────────────────────
  // Step 1: recompute-safe cleanup.
  //   (a) Read every PRIOR PayslipLoanDeduction for this run so we can credit
  //       those amounts back to the source loans — otherwise repeated
  //       recomputes silently double-debit the loan balance.
  //   (b) Delete the ledger rows + payslips.
  //   (c) Restore each loan: balance += prior debit, flip FULLY_PAID → ACTIVE
  //       and clear endDate; the new pass below will re-deduct + re-flag.
  const priorDeductions = await tx.payslipLoanDeduction.findMany({
    where: { payslip: { payrollRunId: runId } },
    select: { loanId: true, amount: true },
  })
  const priorByLoan = new Map<string, number>()
  for (const d of priorDeductions) {
    priorByLoan.set(d.loanId, (priorByLoan.get(d.loanId) ?? 0) + Number(d.amount))
  }

  const previousPay = await tx.payslip.findMany({ where: { payrollRunId: runId }, select: { employeeId: true, netPay: true, grossPay: true, totalDeductions: true } })
  const oldPay = new Map(previousPay.map(p => [p.employeeId, p]))
  let changedEmployees = 0

  // Snapshot manual edits BEFORE deleting payslips so we can re-apply them
  // to the freshly-built payslips below. Key by employeeId — that's stable
  // across recomputes (payslip IDs are not).
  const priorManualEdits = await tx.payslip.findMany({
    where: { payrollRunId: runId, manualEdits: { not: null as never } },
    select: { employeeId: true, manualEdits: true },
  })
  const manualEditsByEmployee = new Map<string, Record<string, unknown>>()
  for (const p of priorManualEdits) {
    if (p.manualEdits && typeof p.manualEdits === 'object') {
      manualEditsByEmployee.set(p.employeeId, p.manualEdits as Record<string, unknown>)
    }
  }

    await tx.payslipLoanDeduction.deleteMany({
      where: { payslip: { payrollRunId: runId } },
    })
    await tx.payslip.deleteMany({ where: { payrollRunId: runId } })
    for (const [loanId, amount] of priorByLoan) {
      const priorLoan = await tx.employeeLoan.findUnique({ where: { id: loanId } })
      if (priorLoan?.manualPaidBalance != null) throw new Error('Revert the manual full payment before recomputing a payroll that previously deducted this loan.')
      await tx.employeeLoan.update({ where: { id: loanId }, data: {
        balance: { increment: amount }, status: 'ACTIVE', endDate: null,
      } })
    }


  // Step 2: create new payslips individually so we get their IDs back,
  //         then create PayslipLoanDeduction ledger records
  // Track total deducted per loan across all payslips
  const loanTotalsDeducted = new Map<string, number>()

  for (const build of builds) {
    const base = (build.data.calculationBasis ?? {}) as Record<string, unknown>
    build.data.calculationBasis = { ...base,
      calculatedValues: Object.fromEntries(ADJUSTABLE_FIELDS.map(key => [key, Number(build.data[key] ?? 0)])),
      calculatedAt: computationStartedAt.toISOString(),
    } as unknown as import('@prisma/client').Prisma.InputJsonValue
    const payslip = await tx.payslip.create({ data: build.data })

    // Re-apply any prior manual overrides for this employee on top of the
    // freshly-computed payslip. Recompute grossPay / totalDeductions / netPay
    // to reflect the overrides.
    const manual = manualEditsByEmployee.get(build.employeeId)
    if (manual && Object.keys(manual).length > 0) {
      const editableFields = [
        'basicSalary', 'regularOtAmount', 'restDayOtAmount', 'holidayOtAmount',
        'nightDiffAmount', 'holidayPayAmount', 'otherEarnings', 'sssEmployee',
        'philhealthEmployee', 'pagibigEmployee', 'withholdingTax', 'lateDeduction',
        'undertimeDeduction', 'absenceDeduction', 'otherDeductions',
      ] as const
      const numericManual: Record<string, number> = {}
      for (const field of editableFields) {
        if (typeof manual[field] === 'number' && Number.isFinite(manual[field])) {
          numericManual[field] = manual[field]
        }
      }
      if (employees.find(e => e.id === build.employeeId)?.disableNightDifferential) delete numericManual.nightDiffAmount
      const customIncomes = Array.isArray(manual.customIncomes)
        ? manual.customIncomes as Array<{ label: string; amount: number }>
        : []
      const customDeductions = Array.isArray(manual.customDeductions)
        ? manual.customDeductions as Array<{ label: string; amount: number }>
        : []
      const customIncomeTotal = customIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const customDeductionTotal = customDeductions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const cur = await tx.payslip.findUniqueOrThrow({
        where: { id: payslip.id },
        select: {
          basicSalary: true, calculationBasis: true, regularOtAmount: true, restDayOtAmount: true,
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
      const merged = {
        basicSalary:        numericManual.basicSalary        ?? cur.basicSalary.toNumber(),
        regularOtAmount:    numericManual.regularOtAmount    ?? cur.regularOtAmount.toNumber(),
        restDayOtAmount:    numericManual.restDayOtAmount    ?? cur.restDayOtAmount.toNumber(),
        holidayOtAmount:    numericManual.holidayOtAmount    ?? cur.holidayOtAmount.toNumber(),
        nightDiffAmount:    numericManual.nightDiffAmount    ?? cur.nightDiffAmount.toNumber(),
        holidayPayAmount:   numericManual.holidayPayAmount   ?? cur.holidayPayAmount.toNumber(),
        riceAllowance:      cur.riceAllowance.toNumber(),
        clothingAllowance:  cur.clothingAllowance.toNumber(),
        medicalAllowance:   cur.medicalAllowance.toNumber(),
        otherAllowances:    cur.otherAllowances.toNumber(),
        otherEarnings:      numericManual.otherEarnings      ?? cur.otherEarnings.toNumber() + customIncomeTotal,
        sssEmployee:        numericManual.sssEmployee        ?? cur.sssEmployee.toNumber(),
        sssEc:              cur.sssEc.toNumber(),
        philhealthEmployee: numericManual.philhealthEmployee ?? cur.philhealthEmployee.toNumber(),
        pagibigEmployee:    numericManual.pagibigEmployee    ?? cur.pagibigEmployee.toNumber(),
        withholdingTax:     numericManual.withholdingTax     ?? cur.withholdingTax.toNumber(),
        sssLoanDeduction:   cur.sssLoanDeduction.toNumber(),
        pagibigLoan:        cur.pagibigLoan.toNumber(),
        companyLoan:        cur.companyLoan.toNumber(),
        lateDeduction:      numericManual.lateDeduction      ?? cur.lateDeduction.toNumber(),
        undertimeDeduction: numericManual.undertimeDeduction ?? cur.undertimeDeduction.toNumber(),
        absenceDeduction:   numericManual.absenceDeduction   ?? cur.absenceDeduction.toNumber(),
        otherDeductions:    numericManual.otherDeductions    ?? cur.otherDeductions.toNumber() + customDeductionTotal,
      }
      // otherEarnings already includes non-taxable income (which is also
      // stored in otherAllowances for display). Adding both would double-count.
      const { grossPay: grossPayManual, totalDeductions: totalDeductionsManual, netPay: netPayManual } = payslipTotals(merged)
      await tx.payslip.update({
        where: { id: payslip.id },
        data: {
          ...numericManual,
          otherEarnings: merged.otherEarnings,
          otherDeductions: merged.otherDeductions,
          grossPay: grossPayManual,
          totalDeductions: totalDeductionsManual,
          netPay: netPayManual,
          ...((cur.calculationBasis as { monthlyPay?: unknown } | null)?.monthlyPay ? { thirteenthMonthContribution: Number((earnedBasicPay({ ...merged, calculationBasis: cur.calculationBasis }) / 12).toFixed(2)) } : {}),
          manualEdits: manual as never,
        },
      })
    }

    const finalPayslip = await tx.payslip.findUniqueOrThrow({ where: { id: payslip.id } })
    const numeric = Object.fromEntries(Object.entries(finalPayslip).map(([key, value]) => [key, Number(value)]))
    const basis = (finalPayslip.calculationBasis ?? {}) as Record<string, unknown>
    const allocated = allocateDeductions(numeric, build.loanDeductions, Number(finalPayslip.otherDeductions), Number(basis.incomingOther ?? 0))
    const old = oldPay.get(build.employeeId)
    await tx.payslip.update({ where: { id: payslip.id }, data: {
      ...allocated.deductions, ...allocated.totals,
      calculationBasis: { ...basis, deductionCarryover: allocated.carryover, ...(old ? { previousPay: { grossPay: Number(old.grossPay), totalDeductions: Number(old.totalDeductions), netPay: Number(old.netPay) } } : {}) } as unknown as import('@prisma/client').Prisma.InputJsonValue,
    } })
    if (old && (Number(old.netPay) !== allocated.totals.netPay || Number(old.grossPay) !== allocated.totals.grossPay || Number(old.totalDeductions) !== allocated.totals.totalDeductions)) changedEmployees += 1
    build.loanDeductions = allocated.carryover.loans.filter(l => l.paid > 0).map(l => ({ id: l.id, type: l.type, amount: l.paid }))

    if (build.loanDeductions.length > 0) {
      await tx.payslipLoanDeduction.createMany({
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
      await tx.payslipIncome.createMany({
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
    const loan = await tx.employeeLoan.findUnique({ where: { id: loanId } })
    if (!loan) continue

    const newBalance = parseFloat(Math.max(0, loan.balance.toNumber() - deducted).toFixed(2))
    await tx.employeeLoan.update({
      where: { id: loanId },
      data: {
        balance:  newBalance,
        status:   newBalance <= 0 ? 'FULLY_PAID' : 'ACTIVE',
        endDate:  newBalance <= 0 ? run.periodEnd : loan.endDate,
      },
    })
  }

  // Step 4: update payroll run totals.
  // Re-aggregate from the actual stored payslips so any manual edits we
  // re-applied above are reflected in the run-level totals.
  const aggregated = await tx.payslip.aggregate({
    where: { payrollRunId: runId },
    _sum: {
      basicSalary: true, grossPay: true, totalDeductions: true, netPay: true,
      sssEmployer: true, philhealthEmployer: true, pagibigEmployer: true,
    },
  })
  await tx.payrollRun.update({
    where: { id: runId },
    data: {
      status: 'COMPUTED',
      totalBasic:      aggregated._sum.basicSalary?.toNumber()       ?? totalBasic,
      totalGross:      aggregated._sum.grossPay?.toNumber()          ?? totalGross,
      totalDeductions: aggregated._sum.totalDeductions?.toNumber()   ?? totalDeductions,
      totalNetPay:     aggregated._sum.netPay?.toNumber()            ?? totalNetPay,
      totalSssEr:      aggregated._sum.sssEmployer?.toNumber()       ?? totalSssEr,
      totalPhEr:       aggregated._sum.philhealthEmployer?.toNumber() ?? totalPhEr,
      totalPagibigEr:  aggregated._sum.pagibigEmployer?.toNumber()   ?? totalPagibigEr,
    },
  })

    return { priorByLoan, priorManualEdits, aggregated, loanTotalsDeducted, changedEmployees, netPayChange: Number((Number(aggregated._sum.netPay ?? 0) - previousPay.reduce((sum, p) => sum + Number(p.netPay), 0)).toFixed(2)) }
  }, { timeout: 120000, maxWait: 10000 })

  const isRecompute = priorByLoan.size > 0 || priorManualEdits.length > 0
  await logAudit(ctx, isRecompute ? 'RECOMPUTE' : 'COMPUTE', 'PayrollRun', runId, {
    description: isRecompute
      ? `Recomputed payroll for ${employees.length} employees`
      : `Computed payroll for ${employees.length} employees`,
    newValues: {
      employeeCount: employees.length,
      changedEmployees, netPayChange,
      totalGross: aggregated._sum.grossPay?.toNumber() ?? totalGross,
      totalNetPay: aggregated._sum.netPay?.toNumber() ?? totalNetPay,
    },
  }).catch(() => {})

  return NextResponse.json({
    success:       true,
    employeeCount: employees.length,
    totalGross: Number(aggregated._sum.grossPay ?? 0),
    totalNetPay: Number(aggregated._sum.netPay ?? 0),
    loansUpdated:  loanTotalsDeducted.size,
    changedEmployees, netPayChange,
  })
  } finally {
    if(!preview)await prisma.payrollRun.updateMany({ where: { id: runId, computationStartedAt }, data: { computationStartedAt: null } })
  }

}
