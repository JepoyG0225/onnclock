'use client'

import { ADJUSTABLE_FIELDS, readCalculatedValues, type AdjustableField } from '@/lib/payroll/review'
import { allocateDeductions, readDeductionCarryover } from '@/lib/payroll/deduction-carryover'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export interface PayslipEditData {
  id: string
  calculationBasis?: unknown
  riceAllowance?: number
  clothingAllowance?: number
  medicalAllowance?: number
  basicPayManuallyEdited?: boolean
  hasManualEdits?: boolean
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
  baseOtherEarnings: number
  customIncomes: CustomAdjustment[]
  // Deductions
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  lateDeduction: number
  undertimeDeduction: number
  absenceDeduction: number
  otherDeductions: number
  baseOtherDeductions: number
  customDeductions: CustomAdjustment[]
  // Fixed (not editable here)
  sssEc: number
  sssLoanDeduction: number
  pagibigLoan: number
  companyLoan: number
}

export interface CustomAdjustment {
  label: string
  amount: number
}

interface Props {
  payslip: PayslipEditData
  onClose: () => void
  onSaved: (payslipId: string, updated: { grossPay: number; totalDeductions: number; netPay: number } & Partial<PayslipEditData>) => void
  /** Currency symbol to show in input prefix and formatted amounts (e.g. "₱", "$") */
  currencySymbol?: string
  /** Full formatter function (returns e.g. "₱15,000.00") */
  formatAmount?: (n: number) => string
}

function NumberField({
  label,
  value,
  onChange,
  highlight,
  disabled = false,
  currencySymbol = '₱',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  highlight?: 'green' | 'red'
  currencySymbol?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <label className="text-sm text-gray-600 min-w-0 flex-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{currencySymbol}</span>
        <input
          aria-label={label}
          disabled={disabled}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className={`w-32 pl-6 pr-2 py-1.5 text-right text-sm border rounded-lg focus:outline-none focus:ring-1 ${
            highlight === 'green'
              ? 'border-[var(--brand-highlight)] focus:ring-[var(--brand-highlight)] text-primary'
              : highlight === 'red'
              ? 'border-red-200 focus:ring-red-400 text-red-600'
              : 'border-gray-200 focus:ring-[var(--brand-primary)]'
          }`}
        />
      </div>
    </div>
  )
}

function AdjustmentEditor({
  title, items, onAdd, onChange, onRemove, currencySymbol, deduction = false,
}: {
  title: string
  items: CustomAdjustment[]
  onAdd: () => void
  onChange: (index: number, value: Partial<CustomAdjustment>) => void
  onRemove: (index: number) => void
  currencySymbol: string
  deduction?: boolean
}) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-600">{title}</p>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--brand-primary)] hover:bg-blue-50"><Plus className="h-3.5 w-3.5" /> Add item</button>
      </div>
      {items.length === 0 ? <p className="py-2 text-xs text-gray-400">No custom items added.</p> : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2">
              <input aria-label={`${title} item ${index + 1} description`} value={item.label} maxLength={80} placeholder={deduction ? 'e.g. Uniform charge' : 'e.g. Performance bonus'} onChange={event => onChange(index, { label: event.target.value })} className="min-w-0 rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-[var(--brand-primary)]" />
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currencySymbol}</span>
                <input aria-label={`${title} item ${index + 1} amount`} type="number" min="0" step="0.01" value={item.amount} onChange={event => onChange(index, { amount: Math.max(0, Number(event.target.value) || 0) })} className={`w-full rounded-lg border py-2 pl-6 pr-2 text-right text-sm outline-none ${deduction ? 'border-red-200 text-red-600 focus:border-red-400' : 'border-gray-200 focus:border-[var(--brand-primary)]'}`} />
              </div>
              <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${title.toLowerCase()} item`} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function PayslipEditModal({ payslip, onClose, onSaved, currencySymbol = '₱', formatAmount }: Props) {
  function peso(n: number) {
    return formatAmount ? formatAmount(n) : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP' }).format(n)
  }
  const [form, setForm] = useState({ ...payslip })
  const [saving, setSaving] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [reason, setReason] = useState('')
  const [resetFields, setResetFields] = useState<AdjustableField[]>([])
  const baseline = readCalculatedValues(payslip.calculationBasis)
  const dialogRef = useRef<HTMLDivElement>(null)
  const savingRef = useRef(saving)
  const closeRef = useRef(onClose)
  savingRef.current = saving
  closeRef.current = onClose

  const portalTarget = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    portalTarget.current = document.body
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [mounted])

  function resetCalculated() {
    const keys = ADJUSTABLE_FIELDS.filter(key => baseline[key] !== undefined)
    setForm(prev => ({ ...prev, ...baseline }))
    setResetFields(keys)
  }
  function set(field: keyof PayslipEditData, v: number) {
    setResetFields(prev => prev.filter(key => key !== field))
    setForm(prev => ({ ...prev, [field]: v }))
  }

  function updateAdjustment(kind: 'customIncomes' | 'customDeductions', index: number, patch: Partial<CustomAdjustment>) {
    setForm(prev => ({
      ...prev,
      [kind]: prev[kind].map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }))
  }

  function addAdjustment(kind: 'customIncomes' | 'customDeductions') {
    setForm(prev => ({ ...prev, [kind]: [...prev[kind], { label: '', amount: 0 }] }))
  }

  function removeAdjustment(kind: 'customIncomes' | 'customDeductions', index: number) {
    setForm(prev => ({ ...prev, [kind]: prev[kind].filter((_, itemIndex) => itemIndex !== index) }))
  }

  const customIncomeTotal = form.customIncomes.reduce((sum, item) => sum + item.amount, 0)
  const customDeductionTotal = form.customDeductions.reduce((sum, item) => sum + item.amount, 0)

  const grossPay = parseFloat((
    form.basicSalary
    + form.regularOtAmount + form.restDayOtAmount + form.holidayOtAmount
    + form.nightDiffAmount + form.holidayPayAmount
    + form.baseOtherEarnings + customIncomeTotal
    + (form.riceAllowance ?? 0) + (form.clothingAllowance ?? 0) + (form.medicalAllowance ?? 0)
  ).toFixed(2))

  const carry = readDeductionCarryover(form.calculationBasis)
  const preview = allocateDeductions({
    basicSalary: grossPay, sssEmployee: form.sssEmployee, philhealthEmployee: form.philhealthEmployee,
    pagibigEmployee: form.pagibigEmployee, withholdingTax: form.withholdingTax,
    lateDeduction: form.lateDeduction, undertimeDeduction: form.undertimeDeduction, absenceDeduction: form.absenceDeduction,
  }, carry?.loans ?? [
    { id: 'sss', type: 'SSS', amount: form.sssLoanDeduction },
    { id: 'pagibig', type: 'PAGIBIG', amount: form.pagibigLoan },
    { id: 'company', type: 'COMPANY_LOAN', amount: form.companyLoan },
  ], form.baseOtherDeductions + customDeductionTotal)
  const { totalDeductions, netPay } = preview.totals


  async function handleSave() {
    if (!reason.trim()) { toast.error('Enter a reason for this adjustment'); return }
    const invalidAdjustment = [...form.customIncomes, ...form.customDeductions].some(
      item => !item.label.trim() || !Number.isFinite(item.amount) || item.amount <= 0
    )
    if (invalidAdjustment) {
      toast.error('Every custom income or deduction needs a label and an amount greater than zero')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/payroll/payslip/${payslip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...Object.fromEntries(ADJUSTABLE_FIELDS.filter(field => form[field] !== payslip[field]).map(field => [field, form[field]])),
          customIncomes: form.customIncomes.map(item => ({ ...item, label: item.label.trim() })),
          customDeductions: form.customDeductions.map(item => ({ ...item, label: item.label.trim() })),
          resetFields, adjustmentReason: reason,

        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to save')
        return
      }
      const saved = await res.json()
      toast.success('Payslip updated')
      onSaved(payslip.id, {
        ...form,
        otherEarnings: form.baseOtherEarnings + customIncomeTotal,
        otherDeductions: form.baseOtherDeductions + customDeductionTotal,
        grossPay,
        totalDeductions,
        netPay,
        ...saved,
      })
      onClose()
    } catch {
      toast.error('Could not save the adjustment. Your changes are still here; try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted || !portalTarget.current) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="payroll-adjust-title" tabIndex={-1} className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div>
            <h2 id="payroll-adjust-title" className="font-bold text-gray-900">Adjust employee pay</h2>
            {preview.carryover.deferredTotal > 0 && <p className="text-xs font-semibold text-amber-800">Deferred to next payroll: {preview.carryover.deferredTotal.toFixed(2)}</p>}
            <p className="text-xs text-amber-800">On save, loan and other deductions are limited to available pay. Any unpaid amount carries to the next payroll. The saved totals reflect the amount collected.</p>
            <p className="text-sm text-gray-500 mt-0.5">{payslip.employeeName} · {payslip.employeeNo}</p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close pay adjustment" className="text-gray-500 hover:text-gray-700 min-h-11 min-w-11 inline-flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b space-y-3">
          <label className="block text-sm font-semibold">Reason for adjustment <span className="text-red-600">*</span><textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="Explain the correction for the approval and audit history" className="mt-1 w-full rounded-lg border p-3 font-normal" rows={2} required /></label>
          {Object.keys(baseline).length ? <details className="text-sm"><summary className="cursor-pointer min-h-11 flex items-center font-semibold">Compare calculated and adjusted amounts</summary><div className="overflow-x-auto"><table className="w-full text-xs tabular-nums"><thead><tr><th className="p-2 text-left">Pay item</th><th className="p-2 text-right">Calculated</th><th className="p-2 text-right">Adjusted</th><th className="p-2 text-right">Difference</th></tr></thead><tbody>{ADJUSTABLE_FIELDS.filter(key => baseline[key] !== undefined).map(key => <tr key={key} className="border-t"><td className="p-2 capitalize">{key.replace(/([A-Z])/g, ' $1').replace('basic Salary', 'Basic pay')}</td><td className="p-2 text-right">{peso(baseline[key]!)}</td><td className="p-2 text-right">{peso(form[key])}</td><td className="p-2 text-right">{peso(form[key] - baseline[key]!)}</td></tr>)}</tbody></table></div><button type="button" onClick={resetCalculated} className="min-h-11 underline font-semibold">Reset calculated pay items</button><p className="text-xs text-slate-500">Resets overrides to this run&apos;s saved calculation. Labeled additional income and deductions remain editable below.</p></details> : <p className="text-xs text-slate-500">This older payslip has no saved calculation baseline. Recompute an eligible editable run to enable calculated-value comparison and reset.</p>}
        </div>
        {/* 2-column body */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {/* Left — Earnings */}
          <div className="px-6 py-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Earnings</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <NumberField label="Basic Pay" value={form.basicSalary} onChange={v => set('basicSalary', v)} currencySymbol={currencySymbol} />
              <NumberField label="Regular OT" value={form.regularOtAmount} onChange={v => set('regularOtAmount', v)} currencySymbol={currencySymbol} />
              <NumberField label="Rest Day OT" value={form.restDayOtAmount} onChange={v => set('restDayOtAmount', v)} currencySymbol={currencySymbol} />
              <NumberField label="Holiday OT" value={form.holidayOtAmount} onChange={v => set('holidayOtAmount', v)} currencySymbol={currencySymbol} />
              <NumberField label="Night Differential" value={form.nightDiffAmount} onChange={v => set('nightDiffAmount', v)} currencySymbol={currencySymbol} />
              <NumberField label="Holiday Pay" value={form.holidayPayAmount} onChange={v => set('holidayPayAmount', v)} currencySymbol={currencySymbol} />
            </div>
            <AdjustmentEditor
              title="Additional income"
              items={form.customIncomes}
              onAdd={() => addAdjustment('customIncomes')}
              onChange={(index, value) => updateAdjustment('customIncomes', index, value)}
              onRemove={index => removeAdjustment('customIncomes', index)}
              currencySymbol={currencySymbol}
            />
            {/* Gross subtotal */}
            <div className="mt-3 flex items-center justify-between px-1 text-sm font-semibold text-gray-700">
              <span className="text-xs uppercase tracking-wide text-gray-400">Gross Pay</span>
              <span className="text-primary">{peso(grossPay)}</span>
            </div>
          </div>

          {/* Right — Deductions */}
          <div className="px-6 py-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Deductions</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <label className="mb-2 flex min-h-11 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} />Enable advanced government and tax overrides</label>
              <NumberField disabled={!advanced} label="SSS" value={form.sssEmployee} onChange={v => set('sssEmployee', v)} highlight="red" currencySymbol={currencySymbol} />
              <NumberField disabled={!advanced} label="PhilHealth" value={form.philhealthEmployee} onChange={v => set('philhealthEmployee', v)} highlight="red" currencySymbol={currencySymbol} />
              <NumberField disabled={!advanced} label="Pag-IBIG" value={form.pagibigEmployee} onChange={v => set('pagibigEmployee', v)} highlight="red" currencySymbol={currencySymbol} />
              <NumberField disabled={!advanced} label="Withholding Tax" value={form.withholdingTax} onChange={v => set('withholdingTax', v)} highlight="red" currencySymbol={currencySymbol} />
              <NumberField label="Late Deduction" value={form.lateDeduction} onChange={v => set('lateDeduction', v)} highlight="red" currencySymbol={currencySymbol} />
              <NumberField label="Undertime Deduction" value={form.undertimeDeduction} onChange={v => set('undertimeDeduction', v)} highlight="red" currencySymbol={currencySymbol} />
              <NumberField label="Absence Deduction" value={form.absenceDeduction} onChange={v => set('absenceDeduction', v)} highlight="red" currencySymbol={currencySymbol} />
            </div>
            <AdjustmentEditor
              title="Additional deductions"
              items={form.customDeductions}
              onAdd={() => addAdjustment('customDeductions')}
              onChange={(index, value) => updateAdjustment('customDeductions', index, value)}
              onRemove={index => removeAdjustment('customDeductions', index)}
              currencySymbol={currencySymbol}
              deduction
            />
            {(form.sssLoanDeduction > 0 || form.pagibigLoan > 0 || form.companyLoan > 0) && (
              <p className="text-xs text-gray-400 mt-2 px-1">
                Loan collections after this adjustment (SSS {peso(preview.deductions.sssLoanDeduction)}, Pag-IBIG {peso(preview.deductions.pagibigLoan)}, Company {peso(preview.deductions.companyLoan)}) are managed via the Loans module.
              </p>
            )}
            {/* Deductions subtotal */}
            <div className="mt-3 flex items-center justify-between px-1 text-sm font-semibold text-gray-700">
              <span className="text-xs uppercase tracking-wide text-gray-400">Total Deductions</span>
              <span className="text-red-600">{peso(totalDeductions)}</span>
            </div>
          </div>
        </div>

        {/* Live Summary bar */}
        <div className="border-t border-gray-100 mx-6 mb-0" />
        <div className="rounded-xl border border-gray-200 overflow-hidden mx-6 my-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
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
              <p className="text-base font-bold mt-0.5" style={{ color: 'var(--brand-primary)' }}>{peso(netPay)}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 bg-white flex flex-wrap items-center gap-2 px-4 sm:px-6 py-4 border-t shadow-sm"><div className="w-full flex justify-between text-sm"><span>Net pay after adjustment</span><strong>{peso(netPay)}</strong></div>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: '#0054d7' }}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>,
    portalTarget.current
  )
}
