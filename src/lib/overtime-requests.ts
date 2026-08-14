import { prisma } from '@/lib/prisma'

const AUTO_OT_REASON_PREFIX = '[AUTO_OT]'

function formatManilaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatManilaTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hh = parts.find(p => p.type === 'hour')?.value ?? '00'
  const mm = parts.find(p => p.type === 'minute')?.value ?? '00'
  return `${hh}:${mm}`
}

function buildAutoReason(hours: number): string {
  return `${AUTO_OT_REASON_PREFIX} Auto-generated from attendance (${hours.toFixed(2)}h). Awaiting approval.`
}

/**
 * Whether this employee is on DTR-based pay.
 *
 * Overtime is derived from clock data, so it only means anything for someone
 * whose pay is computed from their DTR. Fails CLOSED (returns false) if the
 * employee can't be read — better to skip creating an overtime row than to
 * invent one for somebody who may not be entitled to it.
 */
export async function isTimeTrackedEmployee(employeeId: string): Promise<boolean> {
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { trackTime: true },
    })
    return emp?.trackTime === true
  } catch {
    return false
  }
}

export async function syncAutoOvertimeRequest(params: {
  companyId: string
  employeeId: string
  date: Date
  timeIn: Date | null
  timeOut: Date | null
  overtimeHours: number
}) {
  const { companyId, employeeId, date, timeIn, timeOut } = params
  const overtimeHours = Number(params.overtimeHours || 0)
  const normalizedHours = Math.round(Math.max(0, overtimeHours) * 100) / 100

  // Two independent reasons to suppress auto-OT, sharing one cleanup path:
  //
  //   1. Overtime pay is disabled company-wide (payroll settings), or
  //   2. This employee isn't on DTR-based pay (trackTime = false). Overtime
  //      is derived entirely from clock data, so for someone whose pay
  //      doesn't come from their DTR it's a number with nothing behind it.
  //
  // In both cases we also delete any PENDING auto-OT already sitting there,
  // so turning either switch off actually clears the queue rather than
  // leaving orphaned rows an approver could still act on.
  const [otEnabled, timeTracked] = await Promise.all([
    isOvertimeEnabledForEmployee(companyId, employeeId),
    isTimeTrackedEmployee(employeeId),
  ])
  if (!otEnabled || !timeTracked) {
    // Delete stale PENDING auto-OT if it exists
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
    const stale = await prisma.overtimeRequest.findFirst({
      where: {
        companyId, employeeId,
        date: { gte: dayStart, lt: dayEnd },
        reason: { startsWith: AUTO_OT_REASON_PREFIX },
        status: 'PENDING',
      },
    })
    if (stale) await prisma.overtimeRequest.delete({ where: { id: stale.id } })
    return
  }

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const existingAuto = await prisma.overtimeRequest.findFirst({
    where: {
      companyId,
      employeeId,
      date: { gte: dayStart, lt: dayEnd },
      reason: { startsWith: AUTO_OT_REASON_PREFIX },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!timeIn || !timeOut || normalizedHours <= 0) {
    if (existingAuto?.status === 'PENDING') {
      await prisma.overtimeRequest.delete({ where: { id: existingAuto.id } })
    }
    return
  }

  const startTime = formatManilaTime(timeIn)
  const endTime = formatManilaTime(timeOut)
  const reason = buildAutoReason(normalizedHours)
  const normalizedDate = new Date(formatManilaDateKey(date))

  if (existingAuto) {
    if (existingAuto.status === 'PENDING') {
      await prisma.overtimeRequest.update({
        where: { id: existingAuto.id },
        data: {
          date: normalizedDate,
          startTime,
          endTime,
          hours: normalizedHours,
          reason,
        },
      })
    }
    return
  }

  await prisma.overtimeRequest.create({
    data: {
      companyId,
      employeeId,
      date: normalizedDate,
      startTime,
      endTime,
      hours: normalizedHours,
      reason,
      status: 'PENDING',
    },
  })
}

/**
 * Apply an explicit OT override made by an admin on the timesheet. Unlike the
 * auto-sync (which creates a PENDING request awaiting approval), a manual
 * override is authoritative: we replace the day's auto-OT with an APPROVED
 * request for the overridden hours so it shows on the timesheet (which renders
 * approved OT) AND pays in payroll. Overriding to 0 clears the day's auto-OT.
 */
export async function applyManualOtOverride(params: {
  companyId: string
  employeeId: string
  date: Date
  hours: number
  approvedById: string
  timeIn: Date | null
  timeOut: Date | null
}) {
  const dayStart = new Date(params.date); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)

  // The override supersedes any auto-generated OT for the day, whatever its
  // status. (Employee-filed manual requests — without the AUTO tag — are left
  // untouched.)
  await prisma.overtimeRequest.deleteMany({
    where: {
      companyId: params.companyId,
      employeeId: params.employeeId,
      date: { gte: dayStart, lt: dayEnd },
      reason: { startsWith: AUTO_OT_REASON_PREFIX },
    },
  })

  const hours = Math.round(Math.max(0, Number(params.hours) || 0) * 100) / 100
  // Nothing to credit if OT is disabled for the company or the override is 0.
  if (hours <= 0 || !(await isOvertimeEnabledForEmployee(params.companyId, params.employeeId))) return

  const startTime = params.timeIn ? formatManilaTime(params.timeIn) : '00:00'
  const endTime = params.timeOut ? formatManilaTime(params.timeOut) : '00:00'
  await prisma.overtimeRequest.create({
    data: {
      companyId: params.companyId,
      employeeId: params.employeeId,
      date: new Date(formatManilaDateKey(params.date)),
      startTime,
      endTime,
      hours,
      reason: `${AUTO_OT_REASON_PREFIX} Manual override from timesheet (${hours.toFixed(2)}h).`,
      status: 'APPROVED',
      approvedById: params.approvedById,
      approvedAt: new Date(),
    },
  })
}

export async function getApprovedOtHoursMap(params: {
  companyId: string
  dateFrom: Date
  dateTo: Date
}) {
  const requests = await prisma.overtimeRequest.findMany({
    where: {
      companyId: params.companyId,
      status: 'APPROVED',
      date: { gte: params.dateFrom, lte: params.dateTo },
    },
    select: {
      employeeId: true,
      date: true,
      hours: true,
    },
  })

  const map = new Map<string, number>()
  for (const request of requests) {
    const key = `${request.employeeId}:${formatManilaDateKey(request.date)}`
    map.set(key, (map.get(key) ?? 0) + Number(request.hours ?? 0))
  }
  return map
}

export function buildOtMapKey(employeeId: string, date: Date): string {
  return `${employeeId}:${formatManilaDateKey(date)}`
}

/**
 * Check whether OT pay is enabled in the company's payroll settings.
 * Defaults to TRUE if the config row doesn't exist yet (matches payroll compute).
 * Safe to call from any route that handles DTR approval.
 */
export async function isOvertimeEnabledForCompany(companyId: string): Promise<boolean> {
  try {
    const config = await prisma.payrollCycleConfig.findUnique({
      where: { companyId },
      select: { enableOvertime: true },
    })
    return config?.enableOvertime ?? true
  } catch {
    // Table missing or other DB hiccup — fall back to the same default
    // payroll compute uses, so behavior stays consistent.
    return true
  }
}

/** Company policy, with an explicit employee-level opt-in taking precedence. */
export async function isOvertimeEnabledForEmployee(companyId: string, employeeId: string): Promise<boolean> {
  const companyEnabled = await isOvertimeEnabledForCompany(companyId)
  if (companyEnabled) return true
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { overtimePayOverride: true },
  })
  return employee?.overtimePayOverride === true
}

/**
 * Approve all PENDING auto-OT requests for a single (employee, date).
 * Returns number of OT request rows updated.
 */
export async function approveAutoOtForDtr(params: {
  companyId: string
  employeeId: string
  date: Date
  approvedById: string
}): Promise<number> {
  const dayStart = new Date(params.date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const result = await prisma.overtimeRequest.updateMany({
    where: {
      companyId: params.companyId,
      employeeId: params.employeeId,
      date: { gte: dayStart, lt: dayEnd },
      status: 'PENDING',
      reason: { startsWith: AUTO_OT_REASON_PREFIX },
    },
    data: {
      status: 'APPROVED',
      approvedById: params.approvedById,
      approvedAt: new Date(),
    },
  })
  return result.count
}

/**
 * Approve a hand-picked set of PENDING auto-OT requests by id.
 *
 * Used by the timesheet-approval modal once the admin has ticked which
 * specific OT rows to approve. We still scope by companyId so a payload
 * carrying ids from another tenant can't sneak through, and we keep the
 * AUTO_OT_REASON_PREFIX filter so manually-filed OT requests stay
 * untouched by this bulk path (they go through their own approval flow).
 */
export async function approveAutoOtByIds(params: {
  companyId: string
  ids: string[]
  approvedById: string
}): Promise<number> {
  if (params.ids.length === 0) return 0
  const result = await prisma.overtimeRequest.updateMany({
    where: {
      id: { in: params.ids },
      companyId: params.companyId,
      status: 'PENDING',
      reason: { startsWith: AUTO_OT_REASON_PREFIX },
    },
    data: {
      status: 'APPROVED',
      approvedById: params.approvedById,
      approvedAt: new Date(),
    },
  })
  return result.count
}

/**
 * Bulk-approve PENDING auto-OT requests for a company across a date range.
 * Optionally restrict to a single employee (used by weekly-approve).
 */
export async function approveAutoOtForRange(params: {
  companyId: string
  dateFrom: Date
  dateTo: Date // inclusive end date
  approvedById: string
  employeeId?: string
}): Promise<number> {
  const start = new Date(params.dateFrom)
  start.setHours(0, 0, 0, 0)
  const endPlus = new Date(params.dateTo)
  endPlus.setHours(0, 0, 0, 0)
  endPlus.setDate(endPlus.getDate() + 1)
  const result = await prisma.overtimeRequest.updateMany({
    where: {
      companyId: params.companyId,
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
      date: { gte: start, lt: endPlus },
      status: 'PENDING',
      reason: { startsWith: AUTO_OT_REASON_PREFIX },
    },
    data: {
      status: 'APPROVED',
      approvedById: params.approvedById,
      approvedAt: new Date(),
    },
  })
  return result.count
}

export async function syncAutoOvertimeRequestsForCompany(params: {
  companyId: string
  dateFrom: Date
  dateTo: Date
}) {
  const records = await prisma.dTRRecord.findMany({
    where: {
      employee: { companyId: params.companyId },
      date: { gte: params.dateFrom, lte: params.dateTo },
      timeIn: { not: null },
      timeOut: { not: null },
    },
    select: {
      employeeId: true,
      date: true,
      timeIn: true,
      timeOut: true,
      overtimeHours: true,
    },
    take: 3000,
    orderBy: { date: 'desc' },
  })

  for (const record of records) {
    await syncAutoOvertimeRequest({
      companyId: params.companyId,
      employeeId: record.employeeId,
      date: record.date,
      timeIn: record.timeIn,
      timeOut: record.timeOut,
      overtimeHours: Number(record.overtimeHours ?? 0),
    })
  }
}
