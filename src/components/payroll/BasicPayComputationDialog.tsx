'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { readHourlyCalculationBasis } from '@/lib/payroll/calculation-basis'
import type { MonthlyPayDay } from '@/lib/payroll/monthly-pay'
import { readDailyBreakdown } from '@/lib/payroll/daily-breakdown'
import { readCalculatedValues } from '@/lib/payroll/review'
import type { RestDayPayRow } from '@/lib/payroll/rest-day-pay'
import type { PayslipRow, DtrEntry } from './PayrollRunPayslips'

type Props = { payslip: PayslipRow; dtrs: DtrEntry[]; formatAmount: (value: number) => string; onClose: () => void }

export function BasicPayComputation({ payslip: ps, dtrs, formatAmount: money }: Omit<Props, 'onClose'>) {
  const retro=[...((ps.calculationBasis as {retroItems?:{sourceId:string;basic:number;other:number}[]}|null)?.retroItems??[]),...((ps.calculationBasis as {corrections?:{id:string;basic:number;other:number}[]}|null)?.corrections??[]).map(c=>({...c,sourceId:c.id}))]
  const restDays = (ps.calculationBasis as { restDayBreakdown?: RestDayPayRow[] } | null)?.restDayBreakdown ?? []
  const monthly = (ps.calculationBasis as { monthlyPay?: {version: number; frequency: string; divisor: number; days: MonthlyPayDay[]; basicPay: number; absenceDeduction: number} } | null)?.monthlyPay
  const daily = readDailyBreakdown(ps.calculationBasis)
  const hourly = readHourlyCalculationBasis(ps.calculationBasis)
  const baseline = readCalculatedValues(ps.calculationBasis).basicSalary
  const calculated = baseline ?? daily?.basicTotal ?? hourly?.computedBasicPay
  const round = (value: number) => Number(value.toFixed(2))
  const reference = round(ps.dailyRate * ps.daysWorked)
  const adjustment = calculated === undefined ? undefined : round(ps.basicSalary - calculated)
  return <div className="space-y-4 text-sm">
    <div className="rounded-xl bg-blue-50 p-4"><p className="text-xs text-slate-600">Saved basic pay</p><p className="text-2xl font-bold">{money(ps.basicSalary)}</p><p className="mt-1 text-xs text-slate-600">{ps.employee.rateType.toLowerCase()} employee{ps.basicPayManuallyEdited ? ' | Manual override applied' : ''}</p></div>
    {restDays.length > 0 && <section className="space-y-2"><h3 className="font-semibold">Approved rest-day work (included in Other Income)</h3><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Date','Rate/hour','Hours','Multiplier','Regular pay','OT pay','Night pay','Total'].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{restDays.map(row=><tr key={row.attendanceId} className="border-t"><td className="p-2">{row.date}</td><td>{money(row.hourlyRate)}</td><td>{row.regularHours} + {row.overtimeHours} OT</td><td>{row.multiplier * 100}%</td><td>{money(row.regularPay)}</td><td>{money(row.overtimePay)}</td><td>{money(row.nightPay)}</td><td>{money(row.total)}</td></tr>)}</tbody></table></div></section>}
    {monthly?.version === 1 ? <>
      <h3 className="font-semibold">Basic pay before attendance deductions</h3>
      <p>{monthly.frequency === 'WEEKLY' ? 'Monthly salary x 12 / 52' : monthly.frequency === 'SEMI_MONTHLY' ? 'Monthly salary / 2' : 'Full monthly salary'}. Absences use the saved {monthly.divisor}-day divisor; late and undertime remain separate deductions.</p>
      <p className="text-xs text-slate-600">Dated salary changes and partial employment periods are allocated across the calendar days in this cutoff. Rest days and paid leave do not reduce the fixed entitlement.</p>
      <div className="overflow-x-auto"><table className="w-full text-xs tabular-nums"><thead><tr>{['Date / status','Monthly rate','Cutoff share','Absent days','Absence value'].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{monthly.days.map(day=><tr key={day.date} className="border-t"><td className="p-2">{day.date}<p>{day.status}</p></td><td>{money(day.rate)}</td><td>{(day.share*100).toFixed(4)}%</td><td>{day.absentDays}</td><td>{money(day.absentDays*day.rate/monthly.divisor)}</td></tr>)}</tbody></table></div>
      <p className="font-semibold">Cutoff basic pay: {money(monthly.basicPay)}</p>
      <p>Absence deduction: {money(monthly.absenceDeduction)} (capped at cutoff basic pay).</p>
      {daily && <p>Holiday premiums, separate from basic pay: {money(daily.premiumTotal)}</p>}
    </> : daily ? <>
      <h3 className="font-semibold">Daily attendance and pay breakdown</h3>
      <p>{new Set(daily.rows.filter(r => r.status.startsWith('Present')).map(r => r.date)).size} dates present | {daily.rows.filter(r => r.status === 'Paid leave').reduce((s,r) => s + r.days, 0)} paid leave days | Rates shown for each date</p>
      <p className="text-xs text-slate-600"> Paid attendance credits: {daily.rows.reduce((s,r) => s + r.days, 0)} days. Scheduled paid hours: {Number(daily.rows.reduce((s,r) => s + r.hours, 0).toFixed(4))}.</p>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-xs tabular-nums"><thead className="bg-slate-50"><tr>{['Date / status', 'Paid days / hours', 'Basic pay', 'Holiday credit in basic', 'Holiday premium (separate)'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
        <tbody>{daily.rows.map((day,index) => <tr key={`${day.date}-${index}`} className="border-t"><td className="p-2"><p className="whitespace-nowrap font-medium">{day.date}</p><p>{day.status}</p><p>{money(day.rate??daily.rate)} / {daily.unit}</p>{day.holiday && <p className="text-blue-700">{day.holiday}</p>}</td><td className="p-2">{day.days} days / {Number(day.hours.toFixed(4))} hours</td><td className="p-2">{money(day.basic)}</td><td className="p-2">{money(day.holidayCredit)}</td><td className="p-2">{money(day.premium)}{day.premiumFactor > 0 && <p className="mt-1 text-slate-500">{day.premiumUnits} {daily.unit}s x {money(day.rate??daily.rate)} x {day.premiumFactor * 100}%</p>}</td></tr>)}</tbody><tfoot className="border-t bg-slate-50 font-semibold"><tr><th className="p-2 text-left">Daily totals</th><td /><td className="p-2">{money(daily.rows.reduce((s,r) => s + r.basic, 0))}</td><td className="p-2">{money(daily.rows.reduce((s,r) => s + r.holidayCredit, 0))}</td><td className="p-2">{money(daily.rows.reduce((s,r) => s + r.premium, 0))}</td></tr></tfoot>
      </table></div>
      <p className="text-xs text-slate-500">Dates and credits saved at computation time. Basic pay uses paid days x daily rate, or scheduled paid hours x hourly rate. Holiday credits are included in basic pay; premiums are additional earnings. Daily amounts reconcile using cumulative centavo rounding.</p>
      {(daily.basicDifference !== 0 || daily.premiumDifference !== 0) && <p className="rounded-lg bg-amber-50 p-3">Calculation reconciliation requiring review: basic pay {money(daily.basicDifference)}; holiday premium {money(daily.premiumDifference)}. These differences are not assigned to attendance dates.</p>}
      <p className="font-semibold">Holiday premiums, separate from basic pay: {money(daily.premiumTotal)}</p>
    </> : hourly ? <>
      <p className="font-semibold">{hourly.scheduledHours.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} scheduled paid hours x {money(hourly.hourlyRate)} per hour = {money(hourly.computedBasicPay)}</p>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm tabular-nums"><thead className="bg-slate-50"><tr><th scope="col" className="p-3 text-left">Date</th><th scope="col" className="p-3 text-right">Paid hours</th><th scope="col" className="p-3 text-right">Rate / hour</th><th scope="col" className="p-3 text-right">Basic pay</th></tr></thead><tbody>{hourly.days.map(day => <tr key={day.date} className="border-t"><td className="p-3">{day.date}</td><td className="p-3 text-right">{Number(day.hours.toFixed(4))}</td><td className="p-3 text-right">{money(hourly.hourlyRate)}</td><td className="p-3 text-right">{money(day.amount)}</td></tr>)}</tbody><tfoot className="border-t bg-slate-50 font-semibold"><tr><th scope="row" className="p-3 text-left">Scheduled total</th><td className="p-3 text-right">{Number(hourly.scheduledHours.toFixed(4))}</td><td /><td className="p-3 text-right">{money(hourly.computedBasicPay)}</td></tr></tfoot></table></div>
      <p className="text-xs text-slate-600">Uses the schedule saved when payroll was calculated. Unpaid gaps and configured breaks are excluded. Daily amounts include centavo rounding so they reconcile to the total.</p>
      {calculated !== undefined && round(calculated - hourly.computedBasicPay) !== 0 && <p className="rounded-lg bg-amber-50 p-3">Other calculated basic-pay credits or adjustments: {money(round(calculated - hourly.computedBasicPay))}. Review the saved calculation and attendance before changing this amount.</p>}
    </> : <>
      <h3 className="font-semibold">Saved calculation references</h3>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3"><div><dt className="text-xs text-slate-500">Recorded paid days</dt><dd>{ps.daysWorked.toFixed(2)}</dd></div><div><dt className="text-xs text-slate-500">Recorded regular hours</dt><dd>{ps.hoursWorked.toFixed(2)}</dd></div><div><dt className="text-xs text-slate-500">Saved daily rate</dt><dd>{money(ps.dailyRate)}</dd></div><div><dt className="text-xs text-slate-500">Days x daily rate (reference)</dt><dd>{money(reference)}</dd></div></dl>
      <p className="text-xs text-slate-600">A complete daily calculation snapshot is not available for this payslip. These saved counters are references, not a reconstruction of its original formula. Paid leave, holidays, fractional days and overrides can cause differences.</p>
      {dtrs.length > 0 && <details><summary className="min-h-11 cursor-pointer font-semibold">View current attendance reference</summary><p className="mb-2 text-xs text-slate-500">Current records may have changed since payroll was computed. They do not replace the saved basic-pay amount.</p><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Status</th><th className="p-2 text-right">Regular hours</th></tr></thead><tbody>{dtrs.map((day,index) => <tr key={`${day.date}-${index}`} className="border-t"><td className="p-2">{day.date}</td><td className="p-2">{day.isAbsent ? 'Absent' : day.isLeave ? day.isLeavePaid ? 'Paid leave' : 'Unpaid leave' : 'Present'}</td><td className="p-2 text-right">{day.regularHours.toFixed(2)}</td></tr>)}</tbody></table></div></details>}
    </>}
    {retro.length>0&&<div className="rounded-lg border bg-blue-50 p-3"><h3 className="font-semibold">Approved retroactive salary adjustment</h3><p>Basic pay from earlier payrolls: {money(retro.reduce((n,r)=>n+r.basic,0))}</p><p>Other taxable retro pay: {money(retro.reduce((n,r)=>n+r.other,0))}</p><p className="text-xs">The daily table covers this period. Retroactive basic pay is added separately to the saved basic pay and 13th-month accrual.</p></div>}
    <dl className="rounded-lg border divide-y tabular-nums">
      {calculated !== undefined && <div className="flex justify-between gap-3 p-3"><dt>Calculated basic pay before overrides</dt><dd>{money(calculated)}</dd></div>}
      {adjustment !== undefined && adjustment !== 0 && <div className="flex justify-between gap-3 bg-amber-50 p-3"><dt>{ps.basicPayManuallyEdited ? 'Manual basic-pay adjustment' : 'Difference from saved calculation (review)'}</dt><dd>{money(adjustment)}</dd></div>}
      <div className="flex justify-between gap-3 p-3 font-bold"><dt>Saved basic pay</dt><dd>{money(ps.basicSalary)}</dd></div>
    </dl>
    <p className="text-xs text-slate-600">Late ({money(ps.lateDeduction)}), undertime ({money(ps.undertimeDeduction)}) and absence ({money(ps.absenceDeduction)}) deductions are separate payslip entries. They are not deducted again from the basic-pay figure shown here.</p>
  </div>
}

export function BasicPayComputationDialog({ onClose, ...props }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current() }
      if (event.key !== 'Tab') return
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('button, summary, [href], [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length)
      const first = items[0], last = items[items.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="basic-pay-title" tabIndex={-1} className="flex h-[100dvh] w-full max-w-6xl flex-col bg-white shadow-xl sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b p-4 sm:p-6"><div><h2 id="basic-pay-title" className="text-lg font-bold">Basic pay computation</h2><p className="text-sm text-slate-500">{props.payslip.employee.lastName}, {props.payslip.employee.firstName} | {props.payslip.employee.employeeNo}</p></div><button type="button" onClick={onClose} aria-label="Close basic pay computation" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><BasicPayComputation {...props} /></div>
      <footer className="border-t p-3 text-right"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border px-6 text-sm font-semibold">Close</button></footer>
    </div>
  </div>, document.body)
}
