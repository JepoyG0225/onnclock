type Schedule = {
  timeIn: string | null
  timeOut: string | null
  breakEnabled?: boolean
  breakMinutes?: number | null
  workHoursPerDay?: unknown
  workDays?: unknown
}
type Assignment = {
  date: Date
  timeIn: string | null
  timeOut: string | null
  isRestDay: boolean
  schedule: Schedule | null
}
type Attendance = {
  date: Date
  isAbsent: boolean
  isLeave: boolean
  isLeavePaid: boolean
  isHalfDay?: boolean
}
export interface ScheduledPayDay {
  date: string
  hours: number
  source: 'assignment' | 'default-schedule'
}
const dayKey = (date: Date) => date.toISOString().slice(0, 10)
const minutes = (value: string | null) => {
  const match = value && /^(\d{1,2}):([0-5]\d)$/.exec(value)
  if (!match || Number(match[1]) > 23) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** Clock ranges are authoritative for lesson assignments: a 2h lesson must
 * never inherit the template's default 8 net hours. Unpaid gaps are excluded.
 * Missing/overlapping schedules fail validation instead of guessing wages. */
export function scheduledHourlyPayDays(input: {
  attendance: Attendance[]
  assignments: Assignment[]
  defaultSchedule: Schedule | null
  trackTime: boolean
  start: Date
  end: Date
}): { days: ScheduledPayDay[]; hours: number; errors: string[] } {
  const paidDates = new Map<string, number>()
  const workedFractions = new Map<string, number>()
  const leaveFractions = new Map<string, number>()
  for (const d of input.attendance) {
    if (d.isAbsent || (d.isLeave && !d.isLeavePaid)) continue
    const fraction = d.isHalfDay ? 0.5 : 1
    const category = d.isLeave ? leaveFractions : workedFractions
    category.set(dayKey(d.date), Math.max(category.get(dayKey(d.date)) ?? 0, fraction))
    paidDates.set(dayKey(d.date), Math.min(1, (workedFractions.get(dayKey(d.date)) ?? 0) + (leaveFractions.get(dayKey(d.date)) ?? 0)))
  }
  // Preserve fixed/non-clocked pay only where an actual schedule exists.
  if (!input.trackTime && input.attendance.length === 0) {
    const workDays = Array.isArray(input.defaultSchedule?.workDays) ? input.defaultSchedule.workDays.map(Number) : []
    for (let date = new Date(input.start); date <= input.end; date = new Date(date.getTime() + 86400000)) {
      const assigned = input.assignments.filter(a => dayKey(a.date) === dayKey(date))
      if (assigned.length ? assigned.some(a => !a.isRestDay) : workDays.includes(date.getUTCDay())) paidDates.set(dayKey(date), 1)
    }
  }
  const days: ScheduledPayDay[] = []
  const errors: string[] = []
  if (!input.trackTime && !input.attendance.length && !input.defaultSchedule && !input.assignments.some(a => !a.isRestDay)) {
    errors.push('no schedule for non-clocked hourly employee')
  }
  for (const [date, fraction] of [...paidDates].sort(([a], [b]) => a.localeCompare(b))) {
    const assigned = input.assignments.filter(a => dayKey(a.date) === date)
    const sessions = assigned.length ? assigned.filter(a => !a.isRestDay) : input.defaultSchedule ? [{ timeIn: null, timeOut: null, schedule: input.defaultSchedule }] : []
    if (!sessions.length) { errors.push(`${date}: no payable schedule`); continue }
    const intervals: Array<[number, number]> = []
    let paidMinutes = 0
    let invalid = false
    for (const session of sessions) {
      const schedule = session.schedule
      const start = minutes(session.timeIn ?? schedule?.timeIn ?? null)
      let end = minutes(session.timeOut ?? schedule?.timeOut ?? null)
      if (start === null || end === null) {
        // A genuinely flexible default schedule may specify only net hours.
        const netHours = Number(schedule?.workHoursPerDay)
        if (!assigned.length && start === null && end === null && netHours > 0 && netHours <= 24) {
          paidMinutes += netHours * 60
          continue
        }
        errors.push(`${date}: incomplete lesson start/end time`); invalid = true; continue
      }
      if (end <= start) end += 1440
      if (intervals.some(([a, b]) => start < b && end! > a)) {
        errors.push(`${date}: overlapping lesson schedules`); invalid = true; continue
      }
      intervals.push([start, end])
      const span = end - start
      // Short lesson blocks do not inherit a full-day meal break. Direct
      // assignments without a template have no implicit meal-break deduction.
      const unpaidBreak = schedule?.breakEnabled === false || span < 300
        ? 0 : Math.max(0, Number(schedule?.breakMinutes ?? 0))
      if (unpaidBreak >= span) { errors.push(`${date}: break consumes the entire lesson`); invalid = true; continue }
      paidMinutes += span - unpaidBreak
    }
    if (!invalid) days.push({ date, hours: paidMinutes / 60 * fraction, source: assigned.length ? 'assignment' : 'default-schedule' })
  }
  return { days, hours: days.reduce((sum, d) => sum + d.hours, 0), errors }
}
