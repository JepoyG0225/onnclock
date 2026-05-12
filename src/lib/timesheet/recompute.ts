/**
 * Re-run computeHours + computeLateAndUndertime against every closed DTR in
 * a company over a date range, persisting any drift. Used when payroll
 * settings that affect ND (window, includesBreak toggle) change so the
 * stored numbers stay in sync with current policy.
 *
 * Strategy mirrors the live clock-out path exactly:
 *   - resolveShiftForDtr() picks the right shift (multi-shift safe)
 *   - plannedShiftMinutes() drives the regular-hours cap
 *   - getCompanyNightDiffWindow() drives the ND window + include-break flag
 * That way a recompute always produces the same values a fresh clock-out would.
 */
import { prisma } from '@/lib/prisma'
import {
  computeHours,
  computeLateAndUndertime,
  getCompanyNightDiffWindow,
  plannedShiftMinutes,
  resolveShiftForDtr,
} from './compute'

export interface RecomputeOptions {
  /** Look back this many days from today. Default 90. */
  daysBack?: number
}

export interface RecomputeResult {
  processed: number
  updated: number
  windowStart: string
  windowEnd: string
}

export async function recomputeCompanyDtrHours(
  companyId: string,
  opts: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const daysBack = opts.daysBack ?? 90
  const now = new Date()
  const since = new Date(now); since.setDate(since.getDate() - daysBack)

  const [company, ndWindow] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultBreakMinutes: true },
    }),
    getCompanyNightDiffWindow(companyId),
  ])
  const defaultBreakMinutes = company?.defaultBreakMinutes ?? 60

  const dtrs = await prisma.dTRRecord.findMany({
    where: {
      employee: { companyId },
      date: { gte: since },
      timeIn: { not: null },
      timeOut: { not: null },
    },
    select: {
      id: true,
      employeeId: true,
      date: true,
      timeIn: true,
      timeOut: true,
      breakIn: true,
      breakOut: true,
      regularHours: true,
      overtimeHours: true,
      nightDiffHours: true,
      lateMinutes: true,
      undertimeMinutes: true,
      employee: {
        select: {
          workScheduleId: true,
          workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } },
        },
      },
    },
    orderBy: { date: 'desc' },
  })

  let updated = 0
  for (const d of dtrs) {
    if (!d.timeIn || !d.timeOut) continue
    const resolved = await resolveShiftForDtr({
      employeeId: d.employeeId,
      date: d.date,
      actualTimeIn: d.timeIn,
      employee: {
        workScheduleId: d.employee.workScheduleId,
        workSchedule: d.employee.workSchedule
          ? {
              timeIn: d.employee.workSchedule.timeIn ?? null,
              timeOut: d.employee.workSchedule.timeOut ?? null,
              breakMinutes: d.employee.workSchedule.breakMinutes ?? null,
            }
          : null,
      },
      defaultBreakMinutes,
    })
    const plannedMins = plannedShiftMinutes(resolved.scheduleTimeIn, resolved.scheduleTimeOut)
    const computed = computeHours(d.timeIn, d.timeOut, d.breakIn, d.breakOut, {
      plannedRegularMinutes: plannedMins,
      allowedBreakMinutes: resolved.allowedBreakMinutes,
      nightDiffStartMins: ndWindow.startMins,
      nightDiffEndMins: ndWindow.endMins,
      nightDiffIncludesBreak: ndWindow.includesBreak,
      scheduledTimeIn: resolved.scheduleTimeIn,
      scheduledTimeOut: resolved.scheduleTimeOut,
    })
    const lateUt = computeLateAndUndertime(
      d.timeIn,
      d.timeOut,
      resolved.scheduleTimeIn,
      resolved.scheduleTimeOut,
    )

    const oldReg = Number(d.regularHours ?? 0)
    const oldOt  = Number(d.overtimeHours ?? 0)
    const oldNd  = Number(d.nightDiffHours ?? 0)
    const oldLate = Number(d.lateMinutes ?? 0)
    const oldUt  = Number(d.undertimeMinutes ?? 0)

    const drift =
      Math.abs(computed.regularHours - oldReg) +
      Math.abs(computed.overtimeHours - oldOt) +
      Math.abs(computed.nightDiffHours - oldNd) +
      Math.abs(lateUt.lateMinutes - oldLate) +
      Math.abs(lateUt.undertimeMinutes - oldUt)
    if (drift < 0.01) continue

    await prisma.dTRRecord.update({
      where: { id: d.id },
      data: {
        regularHours: computed.regularHours,
        overtimeHours: computed.overtimeHours,
        nightDiffHours: computed.nightDiffHours,
        lateMinutes: lateUt.lateMinutes,
        undertimeMinutes: lateUt.undertimeMinutes,
      },
    })
    updated++
  }

  return {
    processed: dtrs.length,
    updated,
    windowStart: since.toISOString().slice(0, 10),
    windowEnd: now.toISOString().slice(0, 10),
  }
}
