import type { ScheduledPayDay } from './scheduled-hours'

type Attendance = { id?: string; date: Date; isAbsent: boolean; isLeave: boolean; isLeavePaid: boolean; isHalfDay?: boolean; isHoliday: boolean; holidayType: string | null }
type Holiday = { date: Date; name: string; type: string }
export type PayDay = { attendanceId?: string; rate?: number; date: string; status: string; days: number; hours: number; holiday: string; basic: number; holidayCredit: number; premium: number; premiumUnits: number; premiumFactor: number }
export type DailyBreakdown = { version: 1; rate: number; unit: string; rows: PayDay[]; basicTotal: number; premiumTotal: number; basicDifference: number; premiumDifference: number }
const round = (n: number) => Number(n.toFixed(2))
const key = (d: Date) => d.toISOString().slice(0, 10)
/** Persist the actual calculation inputs, never reconstruct old pay from live DTRs. */
export function dailyBreakdown(input: {
  attendance: Attendance[]; holidays: Holiday[]; hourlyDays: ScheduledPayDay[] | null;
  holidayHours: Record<string, number>; rateType: string; dailyRate: number; hourlyRate: number;
  workHours: number; trackTime: boolean; start: Date; end: Date; disableHoliday: boolean;
  basicTotal: number; premiumTotal: number;
}): DailyBreakdown {
  const hourly = input.rateType === 'HOURLY'
  const rate = hourly ? input.hourlyRate : input.dailyRate
  const rows: PayDay[] = []
  const groups = new Map<string, { units: number; amount: number }>()
  const allocate = (group: string, units: number, unitRate: number, roundUnits = false) => {
    const prior = groups.get(group) ?? { units: 0, amount: 0 }
    const totalUnits = prior.units + units
    const total = round((roundUnits ? round(totalUnits) : totalUnits) * unitRate)
    groups.set(group, { units: totalUnits, amount: total })
    return round(total - prior.amount)
  }
  const attendance = [...input.attendance].sort((a,b) => key(a.date).localeCompare(key(b.date)))
  const make = (date: string, status: string, days: number, hours: number): PayDay => ({ date, status, days, hours, holiday: input.holidays.find(h => key(h.date) === date)?.name ?? '', basic: 0, holidayCredit: 0, premium: 0, premiumUnits: 0, premiumFactor: 0 })
  for (const d of attendance) {
    const date = key(d.date)
    const paid = !d.isAbsent && (!d.isLeave || d.isLeavePaid)
    const days = paid ? d.isHalfDay ? 0.5 : 1 : 0
    const row = make(date, d.isAbsent ? 'Absent' : d.isLeave ? d.isLeavePaid ? 'Paid leave' : 'Unpaid leave' : d.isHalfDay ? 'Present (half day)' : 'Present', days, hourly ? 0 : days * input.workHours)
    row.attendanceId=d.id
    if (!hourly) row.basic = allocate('basic', days, rate)
    if (d.isHoliday) row.holiday = [row.holiday, d.holidayType?.replaceAll('_', ' ')].filter(Boolean).join(' - ')
    if (!input.disableHoliday && d.isHoliday && !d.isAbsent && (!hourly || !d.isLeave || d.isLeavePaid)) {
      const factor = d.holidayType === 'REGULAR' ? 1 : d.holidayType === 'SPECIAL_NON_WORKING' ? 0.3 : 0
      row.premiumUnits = hourly ? input.holidayHours[d.id ?? date] ?? 0 : 1
      row.premiumFactor = factor
      if (factor) row.premium = allocate(d.holidayType!, row.premiumUnits, rate * factor, hourly)
    }
    rows.push(row)
  }
  if (hourly) {
    for (const d of input.hourlyDays ?? []) {
      const row = rows.find(r => r.date === d.date && r.days > 0) ?? make(d.date, 'Scheduled (no attendance record)', 0, 0)
      if (!rows.includes(row)) rows.push(row)
      row.hours = d.hours
      row.basic = allocate('basic', d.hours, rate)
    }
  } else if (!attendance.length && !input.trackTime) {
    for (let date = new Date(input.start); date <= input.end; date = new Date(date.getTime() + 86400000)) {
      if ([0,6].includes(date.getUTCDay()) || input.holidays.some(h => key(h.date) === key(date))) continue
      const row = make(key(date), 'Calendar fallback (no attendance record)', 1, input.workHours)
      row.basic = allocate('basic', 1, rate); rows.push(row)
    }
  }
  for (const h of input.holidays) {
    const date = key(h.date), d = attendance.find(a => key(a.date) === date)
    const unworked = !d || d.isAbsent || (d.isLeave && !d.isLeavePaid)
    if (!unworked) continue
    const row = rows.find(r => r.date === date) ?? make(date, 'Holiday (not worked)', 0, 0)
    if (!rows.includes(row)) rows.push(row)
    row.holiday = `${h.name} - ${h.type.replaceAll('_', ' ')}`
    if (!input.disableHoliday && input.rateType === 'DAILY' && h.type === 'REGULAR') row.holidayCredit = allocate('credit', 1, input.dailyRate)
  }
  rows.sort((a,b) => a.date.localeCompare(b.date))
  return { version: 1, rate, unit: hourly ? 'hour' : 'day', rows, basicTotal: input.basicTotal, premiumTotal: input.premiumTotal,
    basicDifference: round(input.basicTotal - rows.reduce((s,r) => s + r.basic + r.holidayCredit, 0)),
    premiumDifference: round(input.premiumTotal - rows.reduce((s,r) => s + r.premium, 0)) }
}
export function readDailyBreakdown(value: unknown): DailyBreakdown | null {
  const v = (value as { dailyBreakdown?: DailyBreakdown } | null)?.dailyBreakdown
  return v?.version === 1 && Array.isArray(v.rows) && [v.rate,v.basicTotal,v.premiumTotal,v.basicDifference,v.premiumDifference].every(Number.isFinite)
    && v.rows.every(r => typeof r.date === 'string' && typeof r.status === 'string' && [r.days,r.hours,r.basic,r.holidayCredit,r.premium].every(Number.isFinite)) ? v : null
}
