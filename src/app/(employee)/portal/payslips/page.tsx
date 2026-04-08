'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CreditCard, Download, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Payslip {
  id: string
  basicSalary: number
  grossPay: number
  totalDeductions: number
  netPay: number
  daysWorked: number
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
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

function peso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

export default function PayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Payslip | null>(null)

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
    <div className="p-5 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Payslips</h1>
        <p className="text-gray-500 text-sm mt-1">View and download your pay statements</p>
      </div>

      {selected ? (
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="text-sm flex items-center gap-1"
            style={{ color: '#227f84' }}
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
              <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'rgba(34,127,132,0.08)' }}>
                <div>
                  <p className="text-xs text-gray-500">Net Pay</p>
                  <p className="text-2xl font-black" style={{ color: '#227f84' }}>{peso(selected.netPay)}</p>
                </div>
                <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Released</Badge>
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

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Earnings</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Basic Pay</span>
                      <span className="font-medium">{peso(selected.basicSalary)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
                      <span>Gross</span>
                      <span className="text-green-600">{peso(selected.grossPay)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deductions</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-600">SSS</span>
                      <span>{peso(selected.sssEmployee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">PhilHealth</span>
                      <span>{peso(selected.philhealthEmployee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pag-IBIG</span>
                      <span>{peso(selected.pagibigEmployee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Withholding Tax</span>
                      <span>{peso(selected.withholdingTax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
                      <span>Total</span>
                      <span className="text-red-600">{peso(selected.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selected.pdfUrl && (
                <div className="mt-4">
                  <a
                    href={selected.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
                  >
                    <Download className="w-4 h-4" /> Download PDF
                  </a>
                </div>
              )}
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
                  <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Released</Badge>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-[10px] text-gray-400">Gross</p>
                    <p className="text-sm font-semibold text-gray-900">{peso(ps.grossPay)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-[10px] text-gray-400">Deduct</p>
                    <p className="text-sm font-semibold text-red-600">{peso(ps.totalDeductions)}</p>
                  </div>
                  <div className="rounded-lg px-2 py-2" style={{ background: 'rgba(34,127,132,0.08)' }}>
                    <p className="text-[10px] text-gray-500">Net Pay</p>
                    <p className="text-sm font-black" style={{ color: '#227f84' }}>{peso(ps.netPay)}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setSelected(ps)}
                    className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View Details
                  </button>
                  {ps.pdfUrl && (
                    <a
                      href={ps.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
