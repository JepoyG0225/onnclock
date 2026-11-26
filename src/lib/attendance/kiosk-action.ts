import { scheduleInstants, timezone } from './timezone'
import { halfDayWorkedShift } from './half-day-leave'
import { prisma } from '@/lib/prisma'
import { chooseAssignment } from '@/lib/attendance/schedule-location'

export type OpenKioskShift = { halfDayWindow?: unknown; isHalfDay?: boolean; isLeave?: boolean; halfDayPeriod?: string | null; date: Date; timeIn: Date | null; breakIn: Date | null; breakOut: Date | null }
export function kioskNextAction(open: OpenKioskShift | null, breakMinutes: number, end: Date | null, now = new Date()) {
  if (!open) return 'IN'
  if (end && now >= end) return 'OUT'
  if (open.breakIn && !open.breakOut) return 'BREAK_END'
  if (open.breakOut || breakMinutes <= 0) return 'OUT'
  return 'BREAK_START'
}
export function shiftEnd(date: Date, start?: string | null, end?: string | null) {
  if (!start || !end || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null
  const value = new Date(`${date.toISOString().slice(0, 10)}T${end}:00+08:00`)
  if (!Number.isFinite(value.getTime())) return null
  if (end <= start) value.setTime(value.getTime() + 86400000)
  return value
}
export async function resolveKioskShift(companyId: string, employeeId: string, open: OpenKioskShift) {
  const employee = await prisma.employee.findFirstOrThrow({ where: { id: employeeId, companyId }, include: { workSchedule: true } })
  const assignments = await prisma.employeeShiftAssignment.findMany({ where: { companyId, employeeId, date: open.date, isRestDay: false }, include: { schedule: true }, orderBy: { id: 'asc' } })
  const assigned = chooseAssignment(assignments, open.timeIn, timezone(employee.workSchedule?.timezone))
  const schedule = assigned?.schedule ?? employee.workSchedule
  let fallback = 60
  if (!schedule) {
    const rows = await prisma.$queryRaw<Array<{ defaultBreakMinutes: number | null }>>`SELECT "defaultBreakMinutes" FROM "companies" WHERE "id" = ${companyId} LIMIT 1`
    fallback = rows[0]?.defaultBreakMinutes ?? 60
  }
  const bounds=scheduleInstants(open.date,assigned?.timeIn??schedule?.timeIn,assigned?.timeOut??schedule?.timeOut,timezone(schedule?.timezone))
  const worked = halfDayWorkedShift({
    ...bounds,
    scheduleTimeIn: assigned?.timeIn ?? schedule?.timeIn ?? null,
    scheduleTimeOut: assigned?.timeOut ?? schedule?.timeOut ?? null,
    allowedBreakMinutes: schedule?.breakEnabled === false ? 0 : Math.max(0, Math.min(720, schedule?.breakMinutes ?? fallback)),
    plannedRegularMinutes: 480,
  }, open)
  return {
    breakMinutes: worked.allowedBreakMinutes,
    end: worked.scheduledEnd ?? shiftEnd(open.date, worked.scheduleTimeIn, worked.scheduleTimeOut),
  }
}
