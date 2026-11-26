import { readHalfDayWindow, excludedMinutes, type ExcludedWindow } from './custom-half-day'
import { timezone, zonedInstant } from './timezone'
type Leave = { isHalfDay: boolean; halfDayPeriod: string | null; halfDayWindow?: unknown; leaveType?: { name: string } }
type Schedule = { timezone?: string; timeIn?: string | null; timeOut?: string | null; breakEnabled?: boolean; breakMinutes?: number | null }
const minutes = (v?: string | null) => {
  const match = v?.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}
const time = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

/** Split scheduled working time evenly around the scheduled meal break.
 * AM/PM are the first/second halves of the attendance day, including overnight
 * shifts. Without fixed hours, use noon in Philippine time. */
export function halfDayWindows(schedule?: Schedule | null) {
  const start = minutes(schedule?.timeIn), rawEnd = minutes(schedule?.timeOut)
  if (start === null || rawEnd === null) return { start: 0, firstEnd: 720, secondStart: 720, end: 1440 }
  const end = rawEnd <= start ? rawEnd + 1440 : rawEnd
  const pause = Math.min(end - start, Math.max(0, schedule?.breakEnabled === false ? 0 : schedule?.breakMinutes ?? 0))
  const firstEnd = start + Math.floor((end - start - pause) / 2)
  return { start, firstEnd, secondStart: firstEnd + pause, end }
}

export function leaveClockInError(leaves: Leave[], actual: Date, attendanceDate: Date, schedule?: Schedule | null): string | null {
  const { firstEnd, secondStart } = halfDayWindows(schedule)
  // Attendance dates are UTC date-only values; clock timestamps are instants.
  const zone=timezone(schedule?.timezone)
  const boundary=(minute:number)=>zonedInstant(new Date(attendanceDate.getTime()+Math.floor(minute/1440)*86400000),time(minute),zone).getTime()
  for (const leave of leaves) {
    const name = leave.leaveType?.name ?? 'leave'
    if (!leave.isHalfDay) return `You are on approved ${name} leave today and cannot clock in.`
    const custom=readHalfDayWindow(leave.halfDayWindow)
    if(custom){if(actual>=new Date(custom.start)&&actual<new Date(custom.end))return 'Your approved half-day leave covers this time. Clock in outside your selected leave hours.';continue}
    const period = leave.halfDayPeriod ?? 'AM'
    if (period === 'AM' && actual.getTime() < boundary(secondStart)) return `Your approved morning half-day leave covers this time. You can clock in from ${time(secondStart)} (${zone}).`
    if (period === 'PM' && actual.getTime() >= boundary(firstEnd)) return `Your approved afternoon half-day leave covers this time. Clock-in is available only during the morning portion, before ${time(firstEnd)} (${zone}).`
  }
  return null
}

/** A worked DTR stores the worked period, separate from the leave-only DTR. */
export function workedHalfPeriod(leaves: Leave[]): string | null {
  const half = leaves.find(l => l.isHalfDay)
  return half ? (half.halfDayPeriod === 'PM' ? 'AM' : 'PM') : null
}

export function halfDayWorkedShift<T extends { scheduledStart?: Date | null; scheduledEnd?: Date | null; scheduleTimeIn: string | null; scheduleTimeOut: string | null; allowedBreakMinutes: number; plannedRegularMinutes: number }>(shift: T, record: { isHalfDay?: boolean; isLeave?: boolean; halfDayPeriod?: string | null; halfDayWindow?: unknown; timeIn?: Date | null; timeOut?: Date | null }): T & { excludedWindows?: ExcludedWindow[] } {
  if (!record.isHalfDay || record.isLeave) return shift
  const custom=readHalfDayWindow(record.halfDayWindow)
  if(custom){
    const excludedWindows=[{start:new Date(custom.start),end:new Date(custom.end)},{start:new Date(custom.breakStart),end:new Date(custom.breakEnd)}]
    let start=new Date(custom.shiftStart),end=new Date(custom.shiftEnd)
    for(const w of [...excludedWindows].sort((a,b)=>a.start.getTime()-b.start.getTime()))if(w.start<=start&&w.end>start)start=w.end
    for(const w of [...excludedWindows].sort((a,b)=>b.end.getTime()-a.end.getTime()))if(w.end>=end&&w.start<end)end=w.start
    if(record.timeIn && record.timeIn>=new Date(custom.end) && new Date(custom.end)>start)start=new Date(custom.end)
    if(record.timeOut && record.timeOut<=new Date(custom.start) && new Date(custom.start)<end)end=new Date(custom.start)
    const clock=(d:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d)
    return {...shift,scheduledStart:start,scheduledEnd:end,scheduleTimeIn:clock(start),scheduleTimeOut:clock(end),allowedBreakMinutes:0,plannedRegularMinutes:Math.max(0,(end.getTime()-start.getTime())/60000-excludedMinutes(start,end,excludedWindows)),excludedWindows}
  }
  if(!record.halfDayPeriod)return shift
  if (minutes(shift.scheduleTimeIn) === null || minutes(shift.scheduleTimeOut) === null) return { ...shift, allowedBreakMinutes: 0, plannedRegularMinutes: Math.max(0, Math.floor((shift.plannedRegularMinutes - shift.allowedBreakMinutes) / 2)) }
  const windows = halfDayWindows({ timeIn: shift.scheduleTimeIn, timeOut: shift.scheduleTimeOut, breakMinutes: shift.allowedBreakMinutes })
  const start = record.halfDayPeriod === 'AM' ? windows.start : windows.secondStart
  const end = record.halfDayPeriod === 'AM' ? windows.firstEnd : windows.end
  const scheduledStart=shift.scheduledStart?new Date(shift.scheduledStart.getTime()+(start-windows.start)*60000):undefined
  const scheduledEnd=shift.scheduledStart?new Date(shift.scheduledStart.getTime()+(end-windows.start)*60000):undefined
  return { ...shift, scheduleTimeIn: time(start), scheduleTimeOut: time(end), scheduledStart,scheduledEnd,allowedBreakMinutes: 0, plannedRegularMinutes: end - start }
}

/** Labels use the same boundaries enforced by clock-in and attendance computation. */
export function halfDayOptions(schedule?: Schedule | null) {
  if (minutes(schedule?.timeIn) === null || minutes(schedule?.timeOut) === null) return []
  const w = halfDayWindows(schedule)
  const label = (minute: number) => {
    const clock = time(minute)
    const hour = Number(clock.slice(0, 2))
    return `${hour % 12 || 12}:${clock.slice(3)} ${hour >= 12 ? 'PM' : 'AM'}${minute >= 1440 ? ' (next day)' : ''}`
  }
  return [
    { period: 'AM' as const, start: time(w.start), end: time(w.firstEnd), label: `${label(w.start)} - ${label(w.firstEnd)}`, workLabel: `${label(w.secondStart)} - ${label(w.end)}`, timezone: timezone(schedule?.timezone) },
    { period: 'PM' as const, start: time(w.secondStart), end: time(w.end), label: `${label(w.secondStart)} - ${label(w.end)}`, workLabel: `${label(w.start)} - ${label(w.firstEnd)}`, timezone: timezone(schedule?.timezone) },
  ]
}
