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
