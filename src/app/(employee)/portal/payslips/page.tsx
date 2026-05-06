'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CreditCard, Download, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useCurrency } from '@/hooks/useCurrency'

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
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Payslip | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function downloadPayslip(payslipId: string, label: string) {
    setDownloadingId(payslipId)
    try {
      const res = await fetch(`/api/payroll/payslip/${payslipId}/pdf`)
      if (!res.ok) return
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
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Payslips</h1>
        <p className="text-gray-500 text-sm mt-1">View and download your pay statements</p>
      </div>

      {selected ? (
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="text-sm flex items-center gap-1"
            style={{ color: '#2E4156' }}
          >
            Back to list
          </button>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-400">Payslip</p>
              <h2 className="text-lg font-bold text-gray-900">{selected.payrollRun.periodLabel}</h2>
              <p className="text-xs text-gray-400 mt-1">
                {format(new Date(selected.payrollRun.periodStart), 'MMM d')} - {format(new Date(selected.payrollRun.periodEnd), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-gray-400">Pay Date: {format(new Date(selected.payrollRun.payDate), 'MMMM d, yyyy')}</p>
            </div>

            <div className="px-5 py-4">
              <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'rgba(46,65,86,0.12)' }}>
                <div>
                  <p className="text-xs text-gray-500">Net Pay</p>
                  <p className="text-2xl font-black" style={{ color: '#2E4156' }}>{peso(selected.netPay)}</p>
                </div>
                <Badge
                  className="border text-xs"
                  style={{ background: 'rgba(46,65,86,0.12)', color: '#2E4156', borderColor: 'rgba(170,183,183,0.45)' }}
                >
                  Released
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-[11px] text-gray-400">Gross Pay</p>
                  <p className="text-sm font-semibold text-gray-900">{peso(selected.grossPay)}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-[11px] text-gray-400">Deductions</p>
                  <p className="text-sm font-semibold text-red-600">{peso(selected.totalDeductions)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Earnings</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Basic Pay</span>
                      <span className="font-medium">{peso(selected.basicSalary)}</span>
                    </div>
                    {(selected.regularOtAmount + selected.restDayOtAmount + selected.holidayOtAmount) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Overtime Pay</span>
                        <span>{peso(selected.regularOtAmount + selected.restDayOtAmount + selected.holidayOtAmount)}</span>
                      </div>
                    )}
                    {selected.holidayPayAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Holiday Pay</span>
                        <span>{peso(selected.holidayPayAmount)}</span>
                      </div>
                    )}
                    {selected.nightDiffAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Night Differential</span>
                        <span>{peso(selected.nightDiffAmount)}</span>
                      </div>
                    )}
                    {(selected.riceAllowance + selected.clothingAllowance + selected.medicalAllowance + selected.otherAllowances + selected.otherEarnings) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Allowances &amp; Others</span>
                        <span>{peso(selected.riceAllowance + selected.clothingAllowance + selected.medicalAllowance + selected.otherAllowances + selected.otherEarnings)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
                      <span>Gross</span>
                      <span style={{ color: '#2E4156' }}>{peso(selected.grossPay)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deductions</p>
                  <div className="space-y-1.5">
                    {selected.sssEmployee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">SSS</span>
                        <span>{peso(selected.sssEmployee)}</span>
                      </div>
                    )}
                    {selected.philhealthEmployee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">PhilHealth</span>
                        <span>{peso(selected.philhealthEmployee)}</span>
                      </div>
                    )}
                    {selected.pagibigEmployee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pag-IBIG</span>
                        <span>{peso(selected.pagibigEmployee)}</span>
                      </div>
                    )}
                    {selected.withholdingTax > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Withholding Tax</span>
                        <span>{peso(selected.withholdingTax)}</span>
                      </div>
                    )}
                    {(selected.lateDeduction + selected.undertimeDeduction) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Late / Undertime</span>
                        <span>{peso(selected.lateDeduction + selected.undertimeDeduction)}</span>
                      </div>
                    )}
                    {selected.absenceDeduction > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Absences</span>
                        <span>{peso(selected.absenceDeduction)}</span>
                      </div>
                    )}
                    {(selected.sssLoanDeduction + selected.pagibigLoan + selected.companyLoan) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Loan Amortizations</span>
                        <span>{peso(selected.sssLoanDeduction + selected.pagibigLoan + selected.companyLoan)}</span>
                      </div>
                    )}
                    {selected.otherDeductions > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Other Deductions</span>
                        <span>{peso(selected.otherDeductions)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
                      <span>Total</span>
                      <span className="text-red-600">{peso(selected.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={() => downloadPayslip(selected.id, selected.payrollRun.periodLabel)}
                  disabled={downloadingId === selected.id}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #1A2D42, #2E4156)' }}
                >
                  {downloadingId === selected.id ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Preparing PDF...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Download PDF</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
            </div>
          ) : payslips.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 py-10 text-center text-gray-400">
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No payslips yet
            </div>
          ) : (
            payslips.map(ps => (
              <div key={ps.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{ps.payrollRun.periodLabel}</p>
                    <p className="text-xs text-gray-400">
                      Pay date: {format(new Date(ps.payrollRun.payDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <Badge
                    className="border text-xs"
                    style={{ background: 'rgba(46,65,86,0.12)', color: '#2E4156', borderColor: 'rgba(170,183,183,0.45)' }}
                  >
                    Released
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-[10px] text-gray-400">Gross</p>
                    <p className="text-sm font-semibold text-gray-900">{peso(ps.grossPay)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-[10px] text-gray-400">Deduct</p>
                    <p className="text-sm font-semibold text-red-600">{peso(ps.totalDeductions)}</p>
                  </div>
                  <div className="rounded-lg px-2 py-2" style={{ background: 'rgba(46,65,86,0.12)' }}>
                    <p className="text-[10px] text-gray-500">Net Pay</p>
                    <p className="text-sm font-black" style={{ color: '#2E4156' }}>{peso(ps.netPay)}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setSelected(ps)}
                    className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => downloadPayslip(ps.id, ps.payrollRun.periodLabel)}
                    disabled={downloadingId === ps.id}
                    className="py-2 px-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    title="Download PDF"
                  >
                    {downloadingId === ps.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
