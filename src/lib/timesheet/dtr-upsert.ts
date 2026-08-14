/**
 * Shared "create or update one DTR record" logic, used by both the single
 * manual-entry endpoint (POST /api/dtr) and the bulk-import endpoint
 * (POST /api/dtr/bulk) so they compute hours identically.
 */
import { prisma } from '@/lib/prisma'
import { syncAutoOvertimeRequest } from '@/lib/overtime-requests'
import {
  computeHours,
  computeLateAndUndertime,
  getCompanyNightDiffWindow,
  resolveShiftForDtr,
} from '@/lib/timesheet/compute'
import { HolidayType } from '@prisma/client'
import { z } from 'zod'

export const dtrSchema = z.object({
  employeeId: z.string(),
  date: z.string(), // YYYY-MM-DD
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  regularHours: z.number().min(0).max(24).default(0),
  overtimeHours: z.number().min(0).max(12).default(0),
  nightDiffHours: z.number().min(0).max(12).default(0),
  lateMinutes: z.number().min(0).default(0),
  undertimeMinutes: z.number().min(0).default(0),
  isAbsent: z.boolean().default(false),
  isRestDay: z.boolean().default(false),
  isHoliday: z.boolean().default(false),
  holidayType: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
})

export type DtrInput = z.infer<typeof dtrSchema>

/**
 * Create or update the DTR row for (employee, date). Verifies the employee
 * belongs to the company, recomputes hours from the time pair when present, and
 * keeps the auto-overtime request in sync. Returns the saved record, or null if
 * the employee doesn't belong to the company.
 */
export async function upsertDtrRecord(companyId: string, data: DtrInput) {
  const [employee, companyRow] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: data.employeeId, companyId },
      select: {
        id: true,
        workScheduleId: true,
        workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true, workHoursPerDay: true } },
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultBreakMinutes: true },
    }),
  ])
  if (!employee) return null

  // Combine date + HH:mm into a +08:00 (PH) DateTime so UTC servers store the
  // correct instant.
  const timeIn  = data.timeIn  ? new Date(`${data.date}T${data.timeIn}:00+08:00`)  : null
  const timeOut = data.timeOut ? new Date(`${data.date}T${data.timeOut}:00+08:00`) : null
  const recordDate = new Date(data.date)

  // When both times are present, recompute hours from the planned shift rather
  // than trusting submitted numbers (prevents inconsistent manual entries).
  let computedHours: ReturnType<typeof computeHours> | null = null
  let computedLateUt: ReturnType<typeof computeLateAndUndertime> | null = null
  if (timeIn && timeOut) {
    const resolved = await resolveShiftForDtr({
      employeeId: data.employeeId,
      date: recordDate,
      actualTimeIn: timeIn,
      employee: {
        workScheduleId: employee.workScheduleId,
        workSchedule: employee.workSchedule,
      },
      defaultBreakMinutes: companyRow?.defaultBreakMinutes ?? 60,
    })
    const planned = resolved.plannedRegularMinutes
    const ndWindow = await getCompanyNightDiffWindow(companyId)
    computedHours = computeHours(timeIn, timeOut, null, null, {
      plannedRegularMinutes: planned,
      allowedBreakMinutes: resolved.allowedBreakMinutes,
      nightDiffStartMins: ndWindow.startMins,
      nightDiffEndMins: ndWindow.endMins,
      nightDiffIncludesBreak: ndWindow.includesBreak,
      scheduledTimeIn: resolved.scheduleTimeIn,
      scheduledTimeOut: resolved.scheduleTimeOut,
    })
    computedLateUt = computeLateAndUndertime(timeIn, timeOut, resolved.scheduleTimeIn, resolved.scheduleTimeOut)
  }

  const existing = await prisma.dTRRecord.findFirst({
    where: { employeeId: data.employeeId, date: recordDate },
    orderBy: { createdAt: 'desc' },
  })
  const dataPayload = {
    employeeId:       data.employeeId,
    date:             recordDate,
    timeIn,
    timeOut,
    regularHours:     computedHours?.regularHours ?? data.regularHours,
    overtimeHours:    computedHours?.overtimeHours ?? data.overtimeHours,
    nightDiffHours:   computedHours?.nightDiffHours ?? data.nightDiffHours,
    lateMinutes:      computedLateUt?.lateMinutes ?? data.lateMinutes,
    undertimeMinutes: computedLateUt?.undertimeMinutes ?? data.undertimeMinutes,
    isAbsent:         data.isAbsent,
    isRestDay:        data.isRestDay,
    isHoliday:        data.isHoliday,
    holidayType:      (data.holidayType ?? null) as HolidayType | null,
    remarks:          data.remarks ?? null,
  }
  const record = existing
    ? await prisma.dTRRecord.update({ where: { id: existing.id }, data: dataPayload })
    : await prisma.dTRRecord.create({ data: dataPayload })

  await syncAutoOvertimeRequest({
    companyId,
    employeeId: data.employeeId,
    date: record.date,
    timeIn: record.timeIn,
    timeOut: record.timeOut,
    overtimeHours: Number(record.overtimeHours ?? 0),
  })

  return record
}
