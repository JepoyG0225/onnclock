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
