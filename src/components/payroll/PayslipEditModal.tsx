'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export interface PayslipEditData {
  id: string
  employeeName: string
  employeeNo: string
  // Earnings
  basicSalary: number
  regularOtAmount: number
  restDayOtAmount: number
  holidayOtAmount: number
  nightDiffAmount: number
  holidayPayAmount: number
  otherEarnings: number
  // Deductions
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  lateDeduction: number
  undertimeDeduction: number
  absenceDeduction: number
  otherDeductions: number
  // Fixed (not editable here)
  sssEc: number
  sssLoanDeduction: number
  pagibigLoan: number
  companyLoan: number
}

interface Props {
  payslip: PayslipEditData
  onClose: () => void
  onSaved: (payslipId: string, updated: { grossPay: number; totalDeductions: number; netPay: number } & Partial<PayslipEditData>) => void
}

function NumberField({
  label,
  value,
  onChange,
  highlight,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  highlight?: 'green' | 'red'
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <label className="text-sm text-gray-600 min-w-0 flex-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₱</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className={`w-32 pl-6 pr-2 py-1.5 text-right text-sm border rounded-lg focus:outline-none focus:ring-1 ${
            highlight === 'green'
              ? 'border-green-200 focus:ring-green-400 text-green-700'
              : highlight === 'red'
              ? 'border-red-200 focus:ring-red-400 text-red-600'
              : 'border-gray-200 focus:ring-[#2E4156]'
          }`}
        />
      </div>
    </div>
  )
}

function peso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

export function PayslipEditModal({ payslip, onClose, onSaved }: Props) {
  const [form, setForm] = useState({ ...payslip })
  const [saving, setSaving] = useState(false)
  const portalTarget = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    portalTarget.current = document.body
    setMounted(true)
  }, [])

  function set(field: keyof PayslipEditData, v: number) {
    setForm(prev => ({ ...prev, [field]: v }))
  }

  const grossPay = parseFloat((
    form.basicSalary
    + form.regularOtAmount + form.restDayOtAmount + form.holidayOtAmount
    + form.nightDiffAmount + form.holidayPayAmount
    + form.otherEarnings
  ).toFixed(2))

  const totalDeductions = parseFloat((
    form.sssEmployee + form.sssEc
    + form.philhealthEmployee
    + form.pagibigEmployee
    + form.withholdingTax
    + form.sssLoanDeduction + form.pagibigLoan + form.companyLoan
    + form.lateDeduction + form.undertimeDeduction + form.absenceDeduction
    + form.otherDeductions
  ).toFixed(2))

  const netPay = parseFloat((grossPay - totalDeductions).toFixed(2))

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/payroll/payslip/${payslip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basicSalary:        form.basicSalary,
          regularOtAmount:    form.regularOtAmount,
          restDayOtAmount:    form.restDayOtAmount,
          holidayOtAmount:    form.holidayOtAmount,
          nightDiffAmount:    form.nightDiffAmount,
          holidayPayAmount:   form.holidayPayAmount,
          otherEarnings:      form.otherEarnings,
          sssEmployee:        form.sssEmployee,
          philhealthEmployee: form.philhealthEmployee,
          pagibigEmployee:    form.pagibigEmployee,
          withholdingTax:     form.withholdingTax,
          lateDeduction:      form.lateDeduction,
          undertimeDeduction: form.undertimeDeduction,
          absenceDeduction:   form.absenceDeduction,
          otherDeductions:    form.otherDeductions,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to save')
        return
      }
      toast.success('Payslip updated')
      onSaved(payslip.id, { ...form, grossPay, totalDeductions, netPay })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!mounted || !portalTarget.current) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Edit Payslip</h2>
            <p className="text-sm text-gray-500 mt-0.5">{payslip.employeeName} · {payslip.employeeNo}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Earnings */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Earnings</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <NumberField label="Basic Pay" value={form.basicSalary} onChange={v => set('basicSalary', v)} />
              <NumberField label="Regular OT" value={form.regularOtAmount} onChange={v => set('regularOtAmount', v)} />
              <NumberField label="Rest Day OT" value={form.restDayOtAmount} onChange={v => set('restDayOtAmount', v)} />
              <NumberField label="Holiday OT" value={form.holidayOtAmount} onChange={v => set('holidayOtAmount', v)} />
              <NumberField label="Night Differential" value={form.nightDiffAmount} onChange={v => set('nightDiffAmount', v)} />
              <NumberField label="Holiday Pay" value={form.holidayPayAmount} onChange={v => set('holidayPayAmount', v)} />
              <NumberField label="Other Earnings" value={form.otherEarnings} onChange={v => set('otherEarnings', v)} />
            </div>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Deductions</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <NumberField label="SSS" value={form.sssEmployee} onChange={v => set('sssEmployee', v)} highlight="red" />
              <NumberField label="PhilHealth" value={form.philhealthEmployee} onChange={v => set('philhealthEmployee', v)} highlight="red" />
              <NumberField label="Pag-IBIG" value={form.pagibigEmployee} onChange={v => set('pagibigEmployee', v)} highlight="red" />
              <NumberField label="Withholding Tax" value={form.withholdingTax} onChange={v => set('withholdingTax', v)} highlight="red" />
              <NumberField label="Late Deduction" value={form.lateDeduction} onChange={v => set('lateDeduction', v)} highlight="red" />
              <NumberField label="Undertime Deduction" value={form.undertimeDeduction} onChange={v => set('undertimeDeduction', v)} highlight="red" />
              <NumberField label="Absence Deduction" value={form.absenceDeduction} onChange={v => set('absenceDeduction', v)} highlight="red" />
              <NumberField label="Other Deductions" value={form.otherDeductions} onChange={v => set('otherDeductions', v)} highlight="red" />
            </div>
            {(form.sssLoanDeduction > 0 || form.pagibigLoan > 0 || form.companyLoan > 0) && (
              <p className="text-xs text-gray-400 mt-2 px-1">
                Loan deductions (SSS {peso(form.sssLoanDeduction)}, Pag-IBIG {peso(form.pagibigLoan)}, Company {peso(form.companyLoan)}) are managed via the Loans module.
              </p>
            )}
          </div>

          {/* Live Summary */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-200">
              <div className="px-4 py-3 text-center">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide">Gross Pay</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">{peso(grossPay)}</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide">Deductions</p>
                <p className="text-base font-bold text-red-600 mt-0.5">{peso(totalDeductions)}</p>
              </div>
              <div className="px-4 py-3 text-center" style={{ background: 'rgba(46,65,86,0.06)' }}>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide">Net Pay</p>
                <p className="text-base font-bold mt-0.5" style={{ color: '#2E4156' }}>{peso(netPay)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: '#2E4156' }}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>,
    portalTarget.current
  )
}
