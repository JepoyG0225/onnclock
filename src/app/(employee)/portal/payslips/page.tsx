'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CreditCard, Download, Loader2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/hooks/useCurrency'

const NAVY = '#032b63'
const ORANGE = '#ff5900'

interface Payslip {
  id: string
  basicSalary: number
  regularOtAmount: number
  restDayOtAmount: number
  holidayOtAmount: number
  nightDiffAmount: number
  holidayPayAmount: number
  riceAllowance: number
  clothingAllowance: number
  medicalAllowance: number
  otherAllowances: number
  otherEarnings: number
  incomes: { typeName: string; amount: number }[]
  grossPay: number
  totalDeductions: number
  netPay: number
  daysWorked: number
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  lateDeduction: number
  undertimeDeduction: number
  absenceDeduction: number
  sssLoanDeduction: number
  pagibigLoan: number
  companyLoan: number
  otherDeductions: number
  pdfUrl: string | null
  createdAt: string
  payrollRun: {
    periodLabel: string
    periodStart: string
    periodEnd: string
    payDate: string
    status: string
  }
}

export default function PayslipsPage() {
  const { fmt: peso } = useCurrency()
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [otherDeductionItems, setOtherDeductionItems] = useState<{ label: string; amount: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Payslip | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function downloadPayslip(payslipId: string, label: string) {
    setDownloadingId(payslipId)
    try {
      const res = await fetch(`/api/payroll/payslip/${payslipId}/pdf`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || `Could not prepare the PDF (${res.status})`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Payslip-${label}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingId(null)
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/payroll/my-payslips')
        const data = await res.json()
        setPayslips(data.payslips ?? [])
        setOtherDeductionItems(data.otherDeductionItems ?? [])
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])


  // ── Detail view ───────────────────────────────────────────────────────────
  if (selected) {
    const otAmount = selected.regularOtAmount + selected.restDayOtAmount + selected.holidayOtAmount
    const allowances = selected.riceAllowance + selected.clothingAllowance + selected.medicalAllowance
    const incomesSum = (selected.incomes ?? []).reduce(
      (s, i) => s + (typeof i.amount === 'number' ? i.amount : Number(i.amount)), 0,
    )
    const residualEarnings = selected.otherEarnings - incomesSum
    const lateUndertime = selected.lateDeduction + selected.undertimeDeduction
    const loans = selected.sssLoanDeduction + selected.pagibigLoan + selected.companyLoan

    // Itemise only when the employee's deduction items reconcile with this
    // payslip's stored Other Deductions total; otherwise show the total.
    const dedItems = otherDeductionItems.filter(d => Number(d?.amount) > 0)
    const dedItemsSum = dedItems.reduce((s, d) => s + Number(d.amount), 0)
    const useDedItems = dedItems.length > 0 && Math.abs(dedItemsSum - selected.otherDeductions) < 0.01

    const earningRows: Array<[string, number]> = [
      ['Basic pay', selected.basicSalary],
      ...(otAmount > 0 ? [['Overtime pay', otAmount] as [string, number]] : []),
      ...(selected.holidayPayAmount > 0 ? [['Holiday pay', selected.holidayPayAmount] as [string, number]] : []),
      ...(selected.nightDiffAmount > 0 ? [['Night differential', selected.nightDiffAmount] as [string, number]] : []),
      ...(allowances > 0 ? [['Allowances', allowances] as [string, number]] : []),
      ...(selected.incomes ?? []).filter(i => i.amount > 0).map(
        i => [i.typeName, typeof i.amount === 'number' ? i.amount : Number(i.amount)] as [string, number],
      ),
      ...(residualEarnings > 0.01 ? [['Other earnings', residualEarnings] as [string, number]] : []),
    ]

    const deductionRows: Array<[string, number]> = [
      ...(selected.sssEmployee > 0 ? [['SSS', selected.sssEmployee] as [string, number]] : []),
      ...(selected.philhealthEmployee > 0 ? [['PhilHealth', selected.philhealthEmployee] as [string, number]] : []),
      ...(selected.pagibigEmployee > 0 ? [['Pag-IBIG', selected.pagibigEmployee] as [string, number]] : []),
      ...(selected.withholdingTax > 0 ? [['Withholding tax', selected.withholdingTax] as [string, number]] : []),
      ...(lateUndertime > 0 ? [['Late / undertime', lateUndertime] as [string, number]] : []),
      ...(selected.absenceDeduction > 0 ? [['Absences', selected.absenceDeduction] as [string, number]] : []),
      ...(loans > 0 ? [['Loan amortisations', loans] as [string, number]] : []),
      ...(useDedItems
        ? dedItems.map(d => [d.label || 'Other deduction', Number(d.amount)] as [string, number])
        : selected.otherDeductions > 0
          ? [['Other deductions', selected.otherDeductions] as [string, number]]
          : []),
    ]

    return (
      <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-2xl mx-auto space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1 text-[13px] font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          All payslips
        </button>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Payslip</p>
            <h1 className="text-[19px] font-black mt-0.5" style={{ color: NAVY }}>
              {selected.payrollRun.periodLabel}
            </h1>
            <p className="text-[12px] font-semibold text-slate-400 mt-1">
              {format(new Date(selected.payrollRun.periodStart), 'MMM d')} – {format(new Date(selected.payrollRun.periodEnd), 'MMM d, yyyy')}
              <span className="text-slate-300"> · </span>
              Paid {format(new Date(selected.payrollRun.payDate), 'MMM d, yyyy')}
            </p>
          </div>

          <div
            className="mx-5 rounded-2xl px-4 py-4 flex items-end justify-between"
            style={{ background: 'linear-gradient(135deg, #021e47, #032b63)' }}
          >
            <div>
              <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Net pay</p>
              <p className="text-[30px] font-black text-white leading-none mt-1 tabular-nums">
                {peso(selected.netPay)}
              </p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-white/15 text-white/90">
              Released
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 px-5 mt-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold text-slate-400">Gross pay</p>
              <p className="text-[15px] font-black text-slate-900 tabular-nums">{peso(selected.grossPay)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold text-slate-400">Deductions</p>
              <p className="text-[15px] font-black text-red-600 tabular-nums">{peso(selected.totalDeductions)}</p>
            </div>
          </div>

          <div className="px-5 py-5 space-y-5">
            <section>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Earnings</p>
              <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                {earningRows.map(([label, amount], i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-[13px] text-slate-600">{label}</span>
                    <span className="text-[13px] font-bold text-slate-900 tabular-nums">{peso(amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50">
                  <span className="text-[13px] font-black text-slate-700">Gross</span>
                  <span className="text-[14px] font-black tabular-nums" style={{ color: NAVY }}>
                    {peso(selected.grossPay)}
                  </span>
                </div>
              </div>
            </section>

            <section>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Deductions</p>
              <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                {deductionRows.length === 0 && (
                  <div className="px-3 py-2.5 text-[13px] text-slate-400">No deductions this period</div>
                )}
                {deductionRows.map(([label, amount], i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-[13px] text-slate-600">{label}</span>
                    <span className="text-[13px] font-bold text-slate-900 tabular-nums">{peso(amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50">
                  <span className="text-[13px] font-black text-slate-700">Total</span>
                  <span className="text-[14px] font-black text-red-600 tabular-nums">
                    {peso(selected.totalDeductions)}
                  </span>
                </div>
              </div>
            </section>

            <button
              onClick={() => downloadPayslip(selected.id, selected.payrollRun.periodLabel)}
              disabled={downloadingId === selected.id}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-[14px] font-black text-white disabled:opacity-60 active:scale-[0.98] transition-transform"
              style={{ background: ORANGE, boxShadow: '0 8px 20px rgba(255,89,0,0.28)' }}
            >
              {downloadingId === selected.id ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Preparing PDF…</>
              ) : (
                <><Download className="w-4 h-4" /> Download PDF</>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  const latest = payslips[0]

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-2xl mx-auto space-y-4">
      <header>
        <h1 className="text-[22px] lg:text-2xl font-black tracking-tight" style={{ color: NAVY }}>
          My Payslips
        </h1>
        <p className="text-[13px] text-slate-400 font-semibold mt-0.5">
          {loading
            ? 'Loading…'
            : payslips.length === 0
              ? 'No pay statements yet'
              : `${payslips.length} statement${payslips.length === 1 ? '' : 's'}`}
        </p>
      </header>

      {!loading && latest && (
        <div
          className="rounded-2xl px-4 py-4"
          style={{ background: 'linear-gradient(135deg, #021e47, #032b63)' }}
        >
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Latest net pay</p>
          <p className="text-[28px] font-black text-white leading-none mt-1 tabular-nums">
            {peso(latest.netPay)}
          </p>
          <p className="text-[11px] font-semibold text-white/45 mt-1.5">
            {latest.payrollRun.periodLabel} · paid {format(new Date(latest.payrollRun.payDate), 'MMM d, yyyy')}
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/70 rounded-2xl animate-pulse" />)}
        </div>
      ) : payslips.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-base font-black text-slate-900">No payslips yet</p>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
            Your payslips appear here once a payroll run covering you is approved.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {payslips.map(ps => (
            <div
              key={ps.id}
              className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setSelected(ps)}
                className="w-full text-left px-4 py-3.5 active:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-slate-900 truncate">
                      {ps.payrollRun.periodLabel}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                      Paid {format(new Date(ps.payrollRun.payDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold text-slate-400">Net pay</p>
                    <p className="text-[18px] font-black leading-none tabular-nums" style={{ color: NAVY }}>
                      {peso(ps.netPay)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2 text-[11px] font-semibold text-slate-400">
                  <span>Gross {peso(ps.grossPay)}</span>
                  <span className="text-red-500">−{peso(ps.totalDeductions)}</span>
                </div>
              </button>

              <div className="flex items-center border-t border-slate-100">
                <button
                  onClick={() => setSelected(ps)}
                  className="flex-1 py-2.5 text-[12px] font-black text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  View details
                </button>
                <span className="w-px self-stretch bg-slate-100" />
                <button
                  onClick={() => downloadPayslip(ps.id, ps.payrollRun.periodLabel)}
                  disabled={downloadingId === ps.id}
                  className="flex items-center justify-center gap-1.5 flex-1 py-2.5 text-[12px] font-black hover:bg-slate-50 disabled:opacity-60 transition-colors"
                  style={{ color: ORANGE }}
                >
                  {downloadingId === ps.id
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing…</>
                    : <><Download className="w-3.5 h-3.5" /> PDF</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
