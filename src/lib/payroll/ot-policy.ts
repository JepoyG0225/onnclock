import { normalizeSingleShiftTimeOut } from '@/lib/timesheet/compute'
import { scheduledShiftEnd } from '@/lib/attendance/shift-end'

export type OtPolicy = { disableEarlyInOt?: boolean; disableBeyondScheduleOt?: boolean }
type Session = { date: Date; timeIn: Date | null; timeOut: Date | null; breakIn: Date | null; breakOut: Date | null }
type Shift = { scheduledStart?: Date | null; scheduledEnd?: Date | null; scheduleTimeIn: string | null; scheduleTimeOut: string | null; allowedBreakMinutes: number; plannedRegularMinutes: number }

/** Maximum payable OT for a session; raw attendance is never modified. */
export function eligibleOtHours(session: Session, shift: Shift, policy: OtPolicy): number {
  if (!session.timeIn || !session.timeOut) return 0
  if (policy.disableEarlyInOt && policy.disableBeyondScheduleOt) return 0
  const start = session.timeIn.getTime()
  const end = normalizeSingleShiftTimeOut(session.timeIn, session.timeOut).getTime()
  const duration = Math.max(0, (end - start) / 60000)
  const allowed = duration < 300 ? 0 : shift.allowedBreakMinutes
  const breakStart = session.breakIn ? Math.max(start, session.breakIn.getTime()) : null
  const breakEnd = session.breakOut ? Math.min(end, session.breakOut.getTime()) : null
  const actualBreak = breakStart !== null && breakEnd !== null ? Math.max(0, (breakEnd - breakStart) / 60000) : allowed
  const worked = Math.max(0, duration - Math.min(allowed, actualBreak))
  const netScheduled = Math.max(1, shift.plannedRegularMinutes - allowed)
  let overtime = Math.max(0, worked - netScheduled)
  const scheduledEnd = (shift.scheduledEnd ?? scheduledShiftEnd(session.date, session.timeIn, shift.scheduleTimeIn, shift.scheduleTimeOut))
  // A restriction cannot be safely evaluated without a known schedule.
  if (!scheduledEnd && (policy.disableEarlyInOt || policy.disableBeyondScheduleOt)) return 0
  if (scheduledEnd) {
    const clock = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
    const span = (clock(shift.scheduleTimeOut!) - clock(shift.scheduleTimeIn!) + 1440) % 1440
    const scheduledStart = shift.scheduledStart?.getTime() ?? scheduledEnd.getTime() - span * 60000
    const overlapBreak = (from: number, to: number) => breakStart !== null && breakEnd !== null ? Math.max(0, Math.min(to, breakEnd) - Math.max(from, breakStart)) / 60000 : 0
    if (policy.disableEarlyInOt) {
      const earlyEnd = Math.min(end, scheduledStart)
      const early = Math.max(0, (earlyEnd - start) / 60000 - overlapBreak(start, earlyEnd))
      const shortBreak = Math.max(0, allowed - actualBreak)
      overtime -= early + shortBreak
    }
    if (policy.disableBeyondScheduleOt) {
      const lateStart = Math.max(start, scheduledEnd.getTime())
      overtime -= Math.max(0, (end - lateStart) / 60000 - overlapBreak(lateStart, end))
    }
  }
  return Math.round(Math.max(0, overtime) / 60 * 100) / 100
}
