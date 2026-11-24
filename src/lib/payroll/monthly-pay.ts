export type MonthlyPayDay = { date: string; rate: number; share: number; absentDays: number; status: string }
const key = (date: Date) => date.toISOString().slice(0, 10)
const money = (n: number) => Number(n.toFixed(2))
export function monthlyPayAmounts(days: MonthlyPayDay[], divisor: number) {
  const basicPay = money(days.reduce((n, d) => n + d.rate * d.share, 0))
  const absenceDeduction = Math.min(basicPay, money(days.reduce((n, d) => n + d.rate / divisor * d.absentDays, 0)))
  return { basicPay, absenceDeduction }
}
/** Snapshot calendar entitlement separately from scheduled absence deductions. */
export function monthlyPayDays(input: {
  start: Date; end: Date; frequency: string; salary: number; trackTime: boolean;
  hireDate: Date; terminationDate: Date | null;
  workDays: unknown; assignments: { date: Date; isRestDay: boolean }[];
  attendance: { date: Date; isAbsent: boolean; isLeave: boolean; isLeavePaid: boolean; isHalfDay?: boolean; isRestDay: boolean }[];
  leaves: { startDate: Date; endDate: Date; isHalfDay: boolean; leaveType: { isWithPay: boolean } }[];
  holidays: { date: Date }[];
}): MonthlyPayDay[] {
  const start = new Date(key(input.start)), end = new Date(key(input.end))
  const dates: Date[] = []
  for (let date = start; date <= end; date = new Date(date.getTime() + 86400000)) dates.push(date)
  const share = (input.frequency === 'WEEKLY' ? 12 / 52 : input.frequency === 'SEMI_MONTHLY' ? 0.5 : 1) / dates.length
  if (input.trackTime && !Array.isArray(input.workDays) && !input.assignments.length) throw new Error('Assign a work schedule before computing monthly DTR-based payroll.')
  return dates.map(date => {
    const day = key(date), employed = day >= key(input.hireDate) && (!input.terminationDate || day <= key(input.terminationDate))
    const assignments = input.assignments.filter(a => key(a.date) === day)
    const scheduled = assignments.length ? assignments.some(a => !a.isRestDay) : Array.isArray(input.workDays) && input.workDays.map(Number).includes(date.getUTCDay())
    const holiday = input.holidays.some(h => key(h.date) === day)
    const rows = input.attendance.filter(a => key(a.date) === day && !a.isRestDay)
    const worked = Math.max(0, ...rows.filter(r => !r.isAbsent && !r.isLeave).map(r => r.isHalfDay ? 0.5 : 1))
    const paidLeaveRows = Math.max(0, ...rows.filter(r => r.isLeave && r.isLeavePaid).map(r => r.isHalfDay ? 0.5 : 1))
    const paidLeaveRequests = Math.min(1, input.leaves.filter(l => l.leaveType.isWithPay && key(l.startDate) <= day && key(l.endDate) >= day).reduce((n, l) => n + (l.isHalfDay ? 0.5 : 1), 0))
    const credit = Math.min(1, worked + Math.max(paidLeaveRows, paidLeaveRequests))
    const absentDays = employed && input.trackTime && scheduled && !holiday ? 1 - credit : 0
    return { date: day, rate: input.salary, share: employed ? share : 0, absentDays,
      status: !employed ? 'Outside employment' : holiday ? 'Holiday' : !scheduled ? 'Rest day' : !input.trackTime ? 'DTR tracking off' : absentDays === 1 ? 'Absent / unpaid leave' : absentDays > 0 ? 'Half-day absence / unpaid leave' : worked ? 'Present' : 'Paid leave' }
  })
}

export function earnedBasicPay(ps: { basicSalary: unknown; absenceDeduction: unknown; lateDeduction: unknown; undertimeDeduction: unknown; calculationBasis: unknown }) {
  const monthly = (ps.calculationBasis as {monthlyPay?: {version?:number}} | null)?.monthlyPay?.version === 1
  return Math.max(0, Number(ps.basicSalary) - (monthly ? Number(ps.absenceDeduction) + Number(ps.lateDeduction) + Number(ps.undertimeDeduction) : 0))
}
