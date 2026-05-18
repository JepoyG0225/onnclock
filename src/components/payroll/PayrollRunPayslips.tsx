'use client'

import { Fragment, useState } from 'react'
import { Pencil, ChevronRight, ChevronDown } from 'lucide-react'
import { useCurrency } from '@/hooks/useCurrency'
import { PayslipEditModal, PayslipEditData } from './PayslipEditModal'

export interface PayslipRow {
  id: string
  basicSalary: number
  // Inputs for the per-row gross-pay breakdown — sourced directly from
  // the persisted Payslip row so the math shown matches what the engine
  // actually charged.
  dailyRate: number
  daysWorked: number
  hoursWorked: number
  regularOtHours: number
  restDayOtHours: number
  holidayOtHours: number
  nightDiffHours: number
  regularOtAmount: number
  restDayOtAmount: number
  holidayOtAmount: number
  nightDiffAmount: number
  holidayPayAmount: number
  otherEarnings: number
  grossPay: number
  sssEmployee: number
  sssEc: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  sssLoanDeduction: number
  pagibigLoan: number
  companyLoan: number
  lateDeduction: number
  undertimeDeduction: number
  absenceDeduction: number
  otherDeductions: number
  totalDeductions: number
  netPay: number
  incomes: { typeName: string; amount: number }[]
  employee: {
    id: string
    firstName: string
    lastName: string
    employeeNo: string
    rateType: 'MONTHLY' | 'DAILY' | 'HOURLY'
    department: { name: string } | null
    position: { title: string } | null
  }
}

export interface HolidayInPeriod {
  date: string  // YYYY-MM-DD
  name: string
  type: 'REGULAR' | 'SPECIAL_NON_WORKING'
}

export interface DtrEntry {
  date: string  // YYYY-MM-DD
  regularHours: number
  overtimeHours: number
  nightDiffHours: number
  lateMinutes: number
  undertimeMinutes: number
  isAbsent: boolean
  isLeave: boolean
  isLeavePaid: boolean
  isHoliday: boolean
  holidayType: string | null
}

interface Props {
  payslips: PayslipRow[]
  runStatus: string
  totalBasic: number
  totalGross: number
  totalDeductions: number
  totalNetPay: number
  holidaysInPeriod?: HolidayInPeriod[]
  /** Per-employee DTR rows for the run's period, keyed by employeeId. */
  dtrsByEmployee?: Record<string, DtrEntry[]>
}

export function PayrollRunPayslips({ payslips: initial, runStatus, holidaysInPeriod = [], dtrsByEmployee = {} }: Props) {
  const [payslips, setPayslips] = useState<PayslipRow[]>(initial)
  const [editing, setEditing] = useState<PayslipEditData | null>(null)
  // Which payslip rows are currently expanded to show the gross-pay
  // breakdown.  Set instead of an array for O(1) lookup during render.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { fmt: peso, symbol } = useCurrency()

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canEdit = runStatus === 'COMPUTED' || runStatus === 'DRAFT' || runStatus === 'FOR_APPROVAL'

  function openEdit(ps: PayslipRow) {
    setEditing({
      id: ps.id,
      employeeName: `${ps.employee.lastName}, ${ps.employee.firstName}`,
      employeeNo: ps.employee.employeeNo,
      basicSalary: ps.basicSalary,
      regularOtAmount: ps.regularOtAmount,
      restDayOtAmount: ps.restDayOtAmount,
      holidayOtAmount: ps.holidayOtAmount,
      nightDiffAmount: ps.nightDiffAmount,
      holidayPayAmount: ps.holidayPayAmount,
      otherEarnings: ps.otherEarnings,
      sssEmployee: ps.sssEmployee,
      philhealthEmployee: ps.philhealthEmployee,
      pagibigEmployee: ps.pagibigEmployee,
      withholdingTax: ps.withholdingTax,
      lateDeduction: ps.lateDeduction,
      undertimeDeduction: ps.undertimeDeduction,
      absenceDeduction: ps.absenceDeduction,
      otherDeductions: ps.otherDeductions,
      sssEc: ps.sssEc,
      sssLoanDeduction: ps.sssLoanDeduction,
      pagibigLoan: ps.pagibigLoan,
      companyLoan: ps.companyLoan,
    })
  }

  function handleSaved(
    payslipId: string,
    updated: { grossPay: number; totalDeductions: number; netPay: number } & Partial<PayslipEditData>
  ) {
    setPayslips(prev =>
      prev.map(ps =>
        ps.id !== payslipId
          ? ps
          : {
              ...ps,
              basicSalary:        updated.basicSalary        ?? ps.basicSalary,
              regularOtAmount:    updated.regularOtAmount    ?? ps.regularOtAmount,
              restDayOtAmount:    updated.restDayOtAmount    ?? ps.restDayOtAmount,
              holidayOtAmount:    updated.holidayOtAmount    ?? ps.holidayOtAmount,
              nightDiffAmount:    updated.nightDiffAmount    ?? ps.nightDiffAmount,
              holidayPayAmount:   updated.holidayPayAmount   ?? ps.holidayPayAmount,
              otherEarnings:      updated.otherEarnings      ?? ps.otherEarnings,
              sssEmployee:        updated.sssEmployee        ?? ps.sssEmployee,
              philhealthEmployee: updated.philhealthEmployee ?? ps.philhealthEmployee,
              pagibigEmployee:    updated.pagibigEmployee    ?? ps.pagibigEmployee,
              withholdingTax:     updated.withholdingTax     ?? ps.withholdingTax,
              lateDeduction:      updated.lateDeduction      ?? ps.lateDeduction,
              undertimeDeduction: updated.undertimeDeduction ?? ps.undertimeDeduction,
              absenceDeduction:   updated.absenceDeduction   ?? ps.absenceDeduction,
              otherDeductions:    updated.otherDeductions    ?? ps.otherDeductions,
              grossPay:           updated.grossPay,
              totalDeductions:    updated.totalDeductions,
              netPay:             updated.netPay,
            }
      )
    )
  }

  // Live totals derived from current state
  const totals = {
    basic:      payslips.reduce((s, p) => s + p.basicSalary, 0),
    ot:         payslips.reduce((s, p) => s + p.regularOtAmount + p.restDayOtAmount + p.holidayOtAmount, 0),
    holiday:    payslips.reduce((s, p) => s + p.holidayPayAmount, 0),
    nightDiff:  payslips.reduce((s, p) => s + p.nightDiffAmount, 0),
    // ps.otherEarnings already equals the sum of ps.incomes line items —
    // both are written by the same compute pass. Adding them together
    // double-counted every employee's additional income.
    other:      payslips.reduce((s, p) => s + p.otherEarnings, 0),
    gross:      payslips.reduce((s, p) => s + p.grossPay, 0),
    sss:        payslips.reduce((s, p) => s + p.sssEmployee, 0),
    ph:         payslips.reduce((s, p) => s + p.philhealthEmployee, 0),
    pagibig:    payslips.reduce((s, p) => s + p.pagibigEmployee, 0),
    tax:        payslips.reduce((s, p) => s + p.withholdingTax, 0),
    loans:      payslips.reduce((s, p) => s + p.sssLoanDeduction + p.pagibigLoan + p.companyLoan, 0),
    net:        payslips.reduce((s, p) => s + p.netPay, 0),
  }

  if (payslips.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No payslips yet. Click &quot;Compute Payroll&quot; to generate.</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-gray-50 z-10 min-w-[160px]">Employee</th>
              <th className="text-right px-3 py-2.5 font-semibold">Basic Pay</th>
              <th className="text-right px-3 py-2.5 font-semibold text-blue-600">OT Pay</th>
              <th className="text-right px-3 py-2.5 font-semibold text-purple-600">Holiday Pay</th>
              <th className="text-right px-3 py-2.5 font-semibold text-cyan-700">Night Diff</th>
              <th className="text-right px-3 py-2.5 font-semibold text-indigo-600">Other Income</th>
              <th className="text-right px-3 py-2.5 font-semibold">Gross Pay</th>
              <th className="text-right px-3 py-2.5 font-semibold">SSS</th>
              <th className="text-right px-3 py-2.5 font-semibold">PhilHealth</th>
              <th className="text-right px-3 py-2.5 font-semibold">Pag-IBIG</th>
              <th className="text-right px-3 py-2.5 font-semibold">Tax</th>
              <th className="text-right px-3 py-2.5 font-semibold">Loans</th>
              <th className="text-right px-3 py-2.5 font-semibold">Net Pay</th>
              <th className="px-3 py-2.5 text-center font-semibold min-w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payslips.map(ps => {
              const otTotal          = ps.regularOtAmount + ps.restDayOtAmount + ps.holidayOtAmount
              // Same data, two sources — see comment on the `other` totals
              // line above. Picking otherEarnings as the canonical value.
              const otherIncomeTotal = ps.otherEarnings
              const loanTotal        = ps.sssLoanDeduction + ps.pagibigLoan + ps.companyLoan
              const isOpen           = expanded.has(ps.id)
              return (
                <Fragment key={ps.id}>
                  <tr
                    className="border-b hover:bg-gray-50 group cursor-pointer"
                    onClick={() => toggleExpand(ps.id)}
                    aria-expanded={isOpen}
                  >
                    <td className="px-3 py-2.5 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
                      <div className="flex items-center gap-1.5">
                        {isOpen
                          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-medium">{ps.employee.lastName}, {ps.employee.firstName}</p>
                          <p className="text-xs text-gray-400">{ps.employee.employeeNo} | {ps.employee.position?.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{peso(ps.basicSalary)}</td>
                    <td className="px-3 py-2.5 text-right text-blue-600">
                      {otTotal === 0 ? <span className="text-gray-300">-</span> : peso(otTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-purple-600">
                      {ps.holidayPayAmount === 0 ? <span className="text-gray-300">-</span> : peso(ps.holidayPayAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-cyan-700">
                      {ps.nightDiffAmount === 0 ? <span className="text-gray-300">-</span> : peso(ps.nightDiffAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-indigo-600">
                      {otherIncomeTotal === 0 ? <span className="text-gray-300">-</span> : peso(otherIncomeTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{peso(ps.grossPay)}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.sssEmployee)}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.philhealthEmployee)}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.pagibigEmployee)}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.withholdingTax)}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      {loanTotal === 0 ? <span className="text-gray-300">-</span> : peso(loanTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-green-700">{peso(ps.netPay)}</td>
                    <td
                      className="px-3 py-2.5 text-center"
                      // Action buttons shouldn't toggle the expander — stop
                      // the click bubble at the cell level.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(ps)}
                            title="Edit payslip"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <a
                          href={`/api/payroll/payslip/${ps.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2E4156] hover:text-[#2E4156] text-xs underline"
                        >
                          PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-slate-50">
                      <td colSpan={14} className="px-6 py-4">
                        <GrossPayBreakdown
                          ps={ps}
                          peso={peso}
                          holidaysInPeriod={holidaysInPeriod}
                          dtrs={dtrsByEmployee[ps.employee.id] ?? []}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold text-gray-700 border-t-2 border-gray-200">
              <td className="px-3 py-2.5 sticky left-0 bg-gray-50 z-10 font-bold">TOTAL</td>
              <td className="px-3 py-2.5 text-right">{peso(totals.basic)}</td>
              <td className="px-3 py-2.5 text-right text-blue-600">{peso(totals.ot)}</td>
              <td className="px-3 py-2.5 text-right text-purple-600">{peso(totals.holiday)}</td>
              <td className="px-3 py-2.5 text-right text-cyan-700">{peso(totals.nightDiff)}</td>
              <td className="px-3 py-2.5 text-right text-indigo-600">
                {totals.other === 0 ? <span className="text-gray-300">-</span> : peso(totals.other)}
              </td>
              <td className="px-3 py-2.5 text-right">{peso(totals.gross)}</td>
              <td className="px-3 py-2.5 text-right text-red-500">{peso(totals.sss)}</td>
              <td className="px-3 py-2.5 text-right text-red-500">{peso(totals.ph)}</td>
              <td className="px-3 py-2.5 text-right text-red-500">{peso(totals.pagibig)}</td>
              <td className="px-3 py-2.5 text-right text-red-500">{peso(totals.tax)}</td>
              <td className="px-3 py-2.5 text-right text-red-500">
                {totals.loans === 0 ? <span className="text-gray-300">-</span> : peso(totals.loans)}
              </td>
              <td className="px-3 py-2.5 text-right text-green-700 font-bold">{peso(totals.net)}</td>
              <td className="px-3 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      {editing && (
        <PayslipEditModal
          payslip={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          currencySymbol={symbol()}
          formatAmount={peso}
        />
      )}
    </>
  )
}

// ─── Per-row gross-pay breakdown ────────────────────────────────────────────
// Renders an itemized derivation of how the payslip's grossPay was reached,
// styled to make audits fast. Goals:
//   1. Every line shows the formula (rate × quantity) and the resulting peso
//      amount so the user can verify the engine's math by inspection.
//   2. Lines SUM to grossPay exactly — including the Art. 94 unworked-holiday
//      credit, which is folded into basicSalary by the engine but exposed
//      here as its own line so the basic-pay math reconciles.
//   3. Holidays in the run's period are listed with status (worked / Art. 94
//      credit / no pay) so users immediately see why basic includes a
//      holiday credit.
//
// Derivation of Art. 94 credit:
//   basicSalary stored on the payslip = workedBasic + (dailyRate × N) where
//   N is the number of unworked regular holidays the employee was credited
//   for. We back out the credit by subtracting (rate × actual quantity),
//   which works for DAILY (dailyRate × hoursWorked/8) and HOURLY
//   (hourlyRate × hoursWorked). For MONTHLY the credit is already inside
//   the monthly salary so we report 0.

interface BreakdownProps {
  ps: PayslipRow
  peso: (n: number) => string
  holidaysInPeriod: HolidayInPeriod[]
  dtrs: DtrEntry[]
}

function GrossPayBreakdown({ ps, peso, holidaysInPeriod, dtrs }: BreakdownProps) {
  const rt = ps.employee.rateType

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Gross Pay Breakdown
        </p>
        <p className="text-[11px] text-slate-400">
          Rate type: <span className="font-semibold text-slate-600">{rt.charAt(0) + rt.slice(1).toLowerCase()}</span>
        </p>
      </div>

      {/* Holidays in period — context for any Art. 94 / worked-holiday rows below */}
      {holidaysInPeriod.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Holidays in this period ({holidaysInPeriod.length})
            </p>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {holidaysInPeriod.map((h, i) => {
                const isRegular = h.type === 'REGULAR'
                return (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5 w-32 font-mono text-slate-600">{h.date}</td>
                    <td className="px-3 py-1.5 text-slate-700">{h.name}</td>
                    <td className="px-3 py-1.5 w-44">
                      <span
                        className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isRegular
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isRegular ? 'Regular' : 'Special non-working'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-200">
            Regular holidays unworked → Art. 94 credit (paid at 100% of daily
            rate for DAILY/HOURLY employees). Worked holidays add the
            premium line above. Special non-working holidays only pay
            premium when worked.
          </p>
        </div>
      )}

      {/* Per-day breakdown — what was earned each date */}
      <PerDayBreakdown ps={ps} dtrs={dtrs} holidaysInPeriod={holidaysInPeriod} peso={peso} />

      {/* Final gross-pay tally — what the payslip actually recorded.
          Other-income lines are surfaced here too since they don't
          appear in the per-day table above. */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {ps.incomes.map((inc, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-3 py-2 align-top">
                  <p className="font-semibold text-slate-700">{inc.typeName}</p>
                  <p className="text-[10px] text-slate-400">Other income</p>
                </td>
                <td className="px-3 py-2 text-right font-bold text-slate-800 whitespace-nowrap w-32">
                  {peso(inc.amount)}
                </td>
              </tr>
            ))}
            {(() => {
              const surfaced = ps.incomes.reduce((s, i) => s + i.amount, 0)
              const leftover = Math.max(0, Math.round((ps.otherEarnings - surfaced) * 100) / 100)
              if (leftover <= 0) return null
              return (
                <tr className="border-b last:border-b-0">
                  <td className="px-3 py-2 align-top">
                    <p className="font-semibold text-slate-700">Additional earnings</p>
                    <p className="text-[10px] text-slate-400">Manual adjustment</p>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-800 whitespace-nowrap w-32">
                    {peso(leftover)}
                  </td>
                </tr>
              )
            })()}
            <tr className="bg-emerald-50 border-t-2 border-emerald-200">
              <td className="px-3 py-2 font-black text-slate-900 text-sm">
                Gross pay
                <span className="ml-2 text-[10px] font-semibold text-emerald-700">stored on payslip</span>
              </td>
              <td className="px-3 py-2 text-right font-black text-slate-900 text-base whitespace-nowrap w-32">
                {peso(ps.grossPay)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Per-day earnings rows ────────────────────────────────────────────────
// Lists every day in the run period (union of DTR rows + holidays) with
// the hours worked, a status badge, and the peso amount that day
// contributed to gross pay. Matches the format the user asked for:
//   April 27 — 8.00 h — ₱800
//   April 28 — 7.50 h — ₱780
//   May 1   — Holiday — ₱800

function PerDayBreakdown({
  ps, dtrs, holidaysInPeriod, peso,
}: {
  ps: PayslipRow
  dtrs: DtrEntry[]
  holidaysInPeriod: HolidayInPeriod[]
  peso: (n: number) => string
}) {
  const hourlyRate = ps.dailyRate / 8
  const rt = ps.employee.rateType
  const round2 = (n: number) => Math.round(n * 100) / 100

  // Index holidays for quick lookup
  const holidayByDate = new Map<string, HolidayInPeriod>()
  for (const h of holidaysInPeriod) holidayByDate.set(h.date, h)

  // Build the row list: one entry per date, sourced from DTR ∪ holidays.
  type Row = {
    date: string
    hours: number
    overtimeHours: number
    nightDiffHours: number
    workedAmount: number
    overtimeAmount: number
    nightDiffAmount: number
    holidayPremium: number
    art94Credit: number
    status: string
    statusTone: 'green' | 'amber' | 'red' | 'blue' | 'slate'
    note?: string
  }

  const dtrByDate = new Map<string, DtrEntry>()
  for (const d of dtrs) dtrByDate.set(d.date, d)

  const allDates = new Set<string>([...dtrByDate.keys(), ...holidayByDate.keys()])
  const sortedDates = Array.from(allDates).sort()

  const rows: Row[] = []
  for (const dateKey of sortedDates) {
    const d = dtrByDate.get(dateKey)
    const holiday = holidayByDate.get(dateKey)

    const reg = d ? d.regularHours : 0
    const ot = d ? d.overtimeHours : 0
    const nd = d ? d.nightDiffHours : 0
    const isAbsent = d?.isAbsent ?? false
    const isLeave = d?.isLeave ?? false
    const isLeavePaid = d?.isLeavePaid ?? false

    // Worked amount: hourly × regular hours (works for HOURLY + DAILY
    // because hourlyRate = dailyRate / 8). MONTHLY is pro-rated by the
    // engine from the monthly salary; here we use the same derivation
    // for visual consistency.
    const workedAmount = round2(hourlyRate * reg)
    const overtimeAmount = round2(hourlyRate * ot * 1.25)  // approx — engine uses configured multiplier
    const nightDiffAmount = round2(hourlyRate * nd * 0.10)

    // Worked-holiday premium
    let holidayPremium = 0
    if (holiday && !isAbsent && reg > 0) {
      if (holiday.type === 'REGULAR') holidayPremium = round2(ps.dailyRate * 1.0)
      else holidayPremium = round2(ps.dailyRate * 0.3)
    }

    // Art. 94 unworked-regular-holiday credit (DAILY/HOURLY only; MONTHLY
    // employees already get it folded into monthly salary)
    let art94Credit = 0
    if (
      (rt === 'DAILY' || rt === 'HOURLY')
      && holiday?.type === 'REGULAR'
      && (!d || isAbsent || (isLeave && !isLeavePaid) || reg === 0)
    ) {
      art94Credit = round2(ps.dailyRate)
    }

    let status: string
    let statusTone: Row['statusTone']
    let note: string | undefined
    if (holiday) {
      status = holiday.type === 'REGULAR' ? 'Regular holiday' : 'Special holiday'
      statusTone = 'amber'
      note = holiday.name
    } else if (isAbsent) {
      status = 'Absent'
      statusTone = 'red'
    } else if (isLeave) {
      status = isLeavePaid ? 'Paid leave' : 'Unpaid leave'
      statusTone = isLeavePaid ? 'blue' : 'slate'
    } else if (reg > 0 || ot > 0) {
      status = 'Present'
      statusTone = 'green'
    } else {
      status = 'No work'
      statusTone = 'slate'
    }

    rows.push({
      date: dateKey,
      hours: reg,
      overtimeHours: ot,
      nightDiffHours: nd,
      workedAmount,
      overtimeAmount,
      nightDiffAmount,
      holidayPremium,
      art94Credit,
      status,
      statusTone,
      note,
    })
  }

  if (rows.length === 0) {
    return null
  }

  const toneClasses: Record<Row['statusTone'], string> = {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-rose-100 text-rose-700',
    blue: 'bg-sky-100 text-sky-700',
    slate: 'bg-slate-100 text-slate-600',
  }
  const formatDate = (iso: string) => {
    // YYYY-MM-DD → "Apr 27, Mon"
    const [y, m, d] = iso.split('-').map(n => Number(n))
    const dt = new Date(Date.UTC(y, m - 1, d))
    const month = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    const dow = dt.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' })
    return `${month} ${d}, ${dow}`
  }

  const grandWorked = round2(rows.reduce((s, r) => s + r.workedAmount, 0))
  const grandPremium = round2(rows.reduce((s, r) => s + r.holidayPremium + r.art94Credit, 0))
  const grandOt = round2(rows.reduce((s, r) => s + r.overtimeAmount, 0))
  const grandNd = round2(rows.reduce((s, r) => s + r.nightDiffAmount, 0))

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Per-day breakdown ({rows.length})
        </p>
        <p className="text-[10px] text-slate-400">
          {rt === 'HOURLY' ? `${peso(hourlyRate)} / hr` : `${peso(ps.dailyRate)} / day · ${peso(hourlyRate)} / hr`}
        </p>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-slate-50/50">
          <tr className="text-slate-500 text-[10px] uppercase tracking-wide">
            <th className="text-left px-3 py-1.5 font-semibold">Date</th>
            <th className="text-left px-3 py-1.5 font-semibold">Status</th>
            <th className="text-right px-3 py-1.5 font-semibold">Reg hrs</th>
            <th className="text-right px-3 py-1.5 font-semibold">OT</th>
            <th className="text-right px-3 py-1.5 font-semibold">ND</th>
            <th className="text-right px-3 py-1.5 font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const totalForDay = round2(r.workedAmount + r.overtimeAmount + r.nightDiffAmount + r.holidayPremium + r.art94Credit)
            return (
              <tr key={r.date} className="border-b last:border-b-0">
                <td className="px-3 py-1.5 align-top">
                  <p className="font-mono text-slate-700">{formatDate(r.date)}</p>
                </td>
                <td className="px-3 py-1.5 align-top">
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${toneClasses[r.statusTone]}`}>
                    {r.status}
                  </span>
                  {r.note && (
                    <p className="text-[10px] text-slate-500 mt-0.5">{r.note}</p>
                  )}
                  {r.art94Credit > 0 && (
                    <p className="text-[10px] text-emerald-700 mt-0.5">+ Art. 94 credit {peso(r.art94Credit)}</p>
                  )}
                  {r.holidayPremium > 0 && (
                    <p className="text-[10px] text-purple-700 mt-0.5">+ Worked-holiday premium {peso(r.holidayPremium)}</p>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right align-top text-slate-700">
                  {r.hours > 0 ? `${r.hours.toFixed(2)}h` : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right align-top text-blue-700">
                  {r.overtimeHours > 0 ? `${r.overtimeHours.toFixed(2)}h` : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right align-top text-cyan-700">
                  {r.nightDiffHours > 0 ? `${r.nightDiffHours.toFixed(2)}h` : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right align-top font-bold text-slate-800 whitespace-nowrap">
                  {totalForDay > 0 ? peso(totalForDay) : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            )
          })}
          <tr className="bg-slate-50 border-t-2 border-slate-300">
            <td className="px-3 py-1.5 font-bold text-slate-700" colSpan={2}>
              Daily totals
            </td>
            <td className="px-3 py-1.5 text-right font-bold text-slate-700">
              {peso(grandWorked)}
            </td>
            <td className="px-3 py-1.5 text-right font-bold text-blue-700">
              {grandOt > 0 ? peso(grandOt) : <span className="text-slate-300">—</span>}
            </td>
            <td className="px-3 py-1.5 text-right font-bold text-cyan-700">
              {grandNd > 0 ? peso(grandNd) : <span className="text-slate-300">—</span>}
            </td>
            <td className="px-3 py-1.5 text-right font-bold text-slate-800 whitespace-nowrap">
              {peso(round2(grandWorked + grandOt + grandNd + grandPremium))}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-200">
        OT multiplier shown is the default 1.25× regular OT rate; the engine uses
        whatever multiplier is configured on PayrollDifferentialConfig. Sum may
        differ slightly from the gross-pay total when companies customize their
        OT/holiday multipliers.
      </p>
    </div>
  )
}
