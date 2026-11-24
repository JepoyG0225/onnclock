import { scheduleInstants, timezone } from './timezone'
type Schedule = { timezone?: string; name: string; timeIn: string | null; timeOut: string | null; workDays?: unknown; breakEnabled?: boolean; breakMinutes?: number; scheduleType?: string }
type Assignment = { date: Date; timeIn: string | null; timeOut: string | null; isRestDay: boolean; schedule: Schedule | null }
export function scheduleDays(today: Date, assignments: Assignment[], fixed: Schedule | null, count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getTime() + index * 86400000), key = date.toISOString().slice(0,10)
    const rows = assignments.filter(a => a.date.toISOString().slice(0,10) === key)
    const source = rows.length ? rows.map(a => ({ name: a.isRestDay ? 'Rest day' : a.schedule?.name ?? 'Assigned shift', timeIn: a.timeIn ?? a.schedule?.timeIn ?? null, timeOut: a.timeOut ?? a.schedule?.timeOut ?? null, isRestDay: a.isRestDay, schedule: a.schedule })) : fixed ? [{ name: fixed.name, timeIn: fixed.timeIn, timeOut: fixed.timeOut, isRestDay: Array.isArray(fixed.workDays) && !fixed.workDays.map(Number).includes(date.getUTCDay()), schedule: fixed }] : []
    const shifts = source.map(s => ({ timezone:timezone(s.schedule?.timezone??fixed?.timezone), ...(!s.isRestDay?scheduleInstants(date,s.timeIn,s.timeOut,timezone(s.schedule?.timezone??fixed?.timezone)):{}), name: s.isRestDay ? 'Rest day' : s.name, timeIn: s.isRestDay ? null : s.timeIn, timeOut: s.isRestDay ? null : s.timeOut, isRestDay: s.isRestDay, nextDay: !s.isRestDay && !!s.timeIn && !!s.timeOut && s.timeOut <= s.timeIn, breakMinutes: s.isRestDay ? 0 : s.schedule?.breakEnabled === false ? 0 : s.schedule?.breakMinutes ?? null, scheduleType: s.schedule?.scheduleType ?? null })).sort((a,b) => (a.timeIn ?? '99:99').localeCompare(b.timeIn ?? '99:99'))
    return { date: key, shifts }
  })
}
