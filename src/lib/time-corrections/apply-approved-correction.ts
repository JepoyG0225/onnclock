import { prisma } from "@/lib/prisma";
import { syncAutoOvertimeRequest } from "@/lib/overtime-requests";
import {
  computeHours,
  computeLateAndUndertime,
  getCompanyNightDiffWindow,
  resolveShiftForDtr,
} from "@/lib/timesheet/compute";
import { clearLateDeductionForApprovedCorrection } from "./clear-late-deduction";

interface ApprovedCorrection {
  id: string;
  companyId: string;
  employeeId: string;
  dtrRecordId: string | null;
  date: Date;
  timeIn: string | null;
  timeOut: string | null;
  breakIn: string | null;
  breakOut: string | null;
  reason: string;
}

function manilaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function requestedDateTime(date: Date, time: string | null): Date | null {
  return time ? new Date(`${manilaDateKey(date)}T${time}:00+08:00`) : null;
}

/** Apply a final time correction and refresh every value derived from its punches. */
export async function applyApprovedTimeCorrection(
  correction: ApprovedCorrection,
) {
  const [employee, company, ndWindow] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: correction.employeeId, companyId: correction.companyId },
      select: {
        id: true,
        workScheduleId: true,
        workSchedule: {
          select: {
            timeIn: true,
            timeOut: true,
            breakMinutes: true,
            workHoursPerDay: true,
          },
        },
      },
    }),
    prisma.company.findUnique({
      where: { id: correction.companyId },
      select: { defaultBreakMinutes: true },
    }),
    getCompanyNightDiffWindow(correction.companyId),
  ]);
  if (!employee) throw new Error("Employee for time correction was not found");

  const target = correction.dtrRecordId
    ? await prisma.dTRRecord.findFirst({
        where: {
          id: correction.dtrRecordId,
          employeeId: correction.employeeId,
        },
      })
    : await prisma.dTRRecord.findFirst({
        where: { employeeId: correction.employeeId, date: correction.date },
        orderBy: { createdAt: "desc" },
      });

  const timeIn =
    requestedDateTime(correction.date, correction.timeIn) ??
    target?.timeIn ??
    null;
  const timeOut =
    requestedDateTime(correction.date, correction.timeOut) ??
    target?.timeOut ??
    null;
  const breakIn =
    requestedDateTime(correction.date, correction.breakIn) ??
    target?.breakIn ??
    null;
  const breakOut =
    requestedDateTime(correction.date, correction.breakOut) ??
    target?.breakOut ??
    null;

  let regularHours = 0;
  let overtimeHours = 0;
  let nightDiffHours = 0;
  let lateMinutes = 0;
  let undertimeMinutes = 0;

  if (timeIn && timeOut) {
    const shift = await resolveShiftForDtr({
      employeeId: correction.employeeId,
      date: correction.date,
      actualTimeIn: timeIn,
      employee: {
        workScheduleId: employee.workScheduleId,
        workSchedule: employee.workSchedule,
      },
      defaultBreakMinutes: company?.defaultBreakMinutes ?? 60,
    });
    const hours = computeHours(timeIn, timeOut, breakIn, breakOut, {
      plannedRegularMinutes: shift.plannedRegularMinutes,
      allowedBreakMinutes: shift.allowedBreakMinutes,
      nightDiffStartMins: ndWindow.startMins,
      nightDiffEndMins: ndWindow.endMins,
      nightDiffIncludesBreak: ndWindow.includesBreak,
      scheduledTimeIn: shift.scheduleTimeIn,
      scheduledTimeOut: shift.scheduleTimeOut,
    });
    const tardiness = computeLateAndUndertime(
      timeIn,
      timeOut,
      shift.scheduleTimeIn,
      shift.scheduleTimeOut,
    );
    regularHours = hours.regularHours;
    overtimeHours = hours.overtimeHours;
    nightDiffHours = hours.nightDiffHours;
    lateMinutes = tardiness.lateMinutes;
    undertimeMinutes = tardiness.undertimeMinutes;
  }

  const data = {
    timeIn,
    timeOut,
    breakIn,
    breakOut,
    regularHours,
    overtimeHours,
    nightDiffHours,
    lateMinutes,
    undertimeMinutes,
    isAbsent: false,
  };
  const dtr = target
    ? await prisma.dTRRecord.update({ where: { id: target.id }, data })
    : await prisma.dTRRecord.create({
        data: {
          employeeId: correction.employeeId,
          date: correction.date,
          ...data,
          source: "MANUAL_CORRECTION",
          remarks: `Created from manual time correction request (${correction.id}). Employee reason: ${correction.reason}`,
        },
      });

  await syncAutoOvertimeRequest({
    companyId: correction.companyId,
    employeeId: correction.employeeId,
    date: correction.date,
    timeIn: dtr.timeIn,
    timeOut: dtr.timeOut,
    overtimeHours: Number(dtr.overtimeHours ?? 0),
  });

  if ((dtr.lateMinutes ?? 0) === 0) {
    await clearLateDeductionForApprovedCorrection({
      companyId: correction.companyId,
      employeeId: correction.employeeId,
      correctionDate: correction.date,
      dtrRecordId: dtr.id,
    });
  }

  return dtr;
}
