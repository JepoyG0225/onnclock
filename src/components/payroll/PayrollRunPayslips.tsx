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

interface Props {
  payslips: PayslipRow[]
  runStatus: string
  totalBasic: number
  totalGross: number
  totalDeductions: number
  totalNetPay: number
}

export function PayrollRunPayslips({ payslips: initial, runStatus }: Props) {
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
                        <GrossPayBreakdown ps={ps} peso={peso} />
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
// styled to make audits fast: each line shows the formula (rate × quantity)
// and the resulting peso amount. Sections only render when they're > 0.

interface BreakdownProps {
  ps: PayslipRow
  peso: (n: number) => string
}

function GrossPayBreakdown({ ps, peso }: BreakdownProps) {
  // hourlyRate isn't persisted on Payslip — derive it from the snapshot
  // dailyRate using the standard 8-hour day. The OT amounts already
  // include the multiplier so we display them as-is.
  const hourlyRate = ps.dailyRate / 8
  const rt = ps.employee.rateType

  // Headline basic-pay line varies by rate type so the math reads right.
  const basicLabel = (() => {
    if (rt === 'HOURLY') {
      return `${ps.hoursWorked.toFixed(2)} h × ${peso(hourlyRate)} / hr`
    }
    if (rt === 'DAILY') {
      // hoursWorked / 8 gives the fractional days used by the engine
      // post the pro-rate fix. Surface both so the user can verify.
      const fractionalDays = ps.hoursWorked > 0 ? ps.hoursWorked / 8 : ps.daysWorked
      return `${fractionalDays.toFixed(2)} day${fractionalDays === 1 ? '' : 's'} (${ps.hoursWorked.toFixed(2)} h) × ${peso(ps.dailyRate)} / day`
    }
    // MONTHLY — show day-count vs working days
    return `Monthly basic pro-rated by attendance (${ps.daysWorked.toFixed(2)} days, ${ps.hoursWorked.toFixed(2)} h)`
  })()

  type Row = { label: string; formula?: string; amount: number; highlight?: boolean }
  const rows: Row[] = []

  rows.push({ label: 'Basic pay', formula: basicLabel, amount: ps.basicSalary })

  if (ps.regularOtHours > 0 || ps.regularOtAmount > 0) {
    rows.push({
      label: 'Regular OT',
      formula: `${ps.regularOtHours.toFixed(2)} h × ${peso(hourlyRate)} × 1.25 multiplier`,
      amount: ps.regularOtAmount,
    })
  }
  if (ps.restDayOtHours > 0 || ps.restDayOtAmount > 0) {
    rows.push({
      label: 'Rest-day OT',
      formula: `${ps.restDayOtHours.toFixed(2)} h × ${peso(hourlyRate)} × 1.69 multiplier`,
      amount: ps.restDayOtAmount,
    })
  }
  if (ps.holidayOtHours > 0 || ps.holidayOtAmount > 0) {
    rows.push({
      label: 'Holiday OT',
      formula: `${ps.holidayOtHours.toFixed(2)} h × ${peso(hourlyRate)} × holiday multiplier`,
      amount: ps.holidayOtAmount,
    })
  }
  if (ps.nightDiffHours > 0 || ps.nightDiffAmount > 0) {
    rows.push({
      label: 'Night differential',
      formula: `${ps.nightDiffHours.toFixed(2)} h × ${peso(hourlyRate)} × 10%`,
      amount: ps.nightDiffAmount,
    })
  }
  if (ps.holidayPayAmount > 0) {
    rows.push({
      label: 'Holiday premium',
      formula: 'Worked-holiday premium (+100% regular / +30% special)',
      amount: ps.holidayPayAmount,
    })
  }

  // Variable / fixed income items already itemized on the payslip
  for (const inc of ps.incomes) {
    rows.push({ label: inc.typeName, formula: 'Other income', amount: inc.amount })
  }
  // Catch-all when otherEarnings carries an amount not surfaced through
  // ps.incomes (legacy free-form additions, etc.).
  const otherIncomeSurfaced = ps.incomes.reduce((s, i) => s + i.amount, 0)
  const otherLeftover = Math.max(0, Math.round((ps.otherEarnings - otherIncomeSurfaced) * 100) / 100)
  if (otherLeftover > 0) {
    rows.push({ label: 'Additional earnings', formula: 'Manual adjustment', amount: otherLeftover })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Gross Pay Breakdown
        </p>
        <p className="text-[11px] text-slate-400">
          Rate type: <span className="font-semibold text-slate-600">{rt.charAt(0) + rt.slice(1).toLowerCase()}</span>
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-3 py-2 align-top w-44">
                  <p className="font-semibold text-slate-700">{r.label}</p>
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {r.formula ?? '—'}
                </td>
                <td className="px-3 py-2 text-right font-bold text-slate-800 whitespace-nowrap w-32">
                  {peso(r.amount)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="px-3 py-2 font-bold text-slate-700" colSpan={2}>
                Gross pay total
              </td>
              <td className="px-3 py-2 text-right font-black text-slate-900">
                {peso(ps.grossPay)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
