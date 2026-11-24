'use client'
import { usePermissions } from '@/components/auth/PermissionsProvider'

import { BasicPayComputationDialog } from './BasicPayComputationDialog'
import { readCalculatedAt, readPreviousPay, matchesPayrollReview } from '@/lib/payroll/review'
import type { PayrollAnomaly } from '@/lib/payroll/anomalies'
import { readDeductionCarryover } from '@/lib/payroll/deduction-carryover'
import { readHourlyCalculationBasis } from '@/lib/payroll/calculation-basis'
import { payslipTotals } from '@/lib/payroll/payslip-totals'
import { Fragment, useEffect, useState } from 'react'
import { Pencil, ChevronDown, Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCurrency } from '@/hooks/useCurrency'
import { PayslipEditModal, PayslipEditData, type CustomAdjustment } from './PayslipEditModal'

export interface PayslipRow {
  id: string
  basicSalary: number
  calculationBasis?: unknown
  riceAllowance?: number
  clothingAllowance?: number
  medicalAllowance?: number
  basicPayManuallyEdited?: boolean
  hasManualEdits?: boolean
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
  customIncomes: CustomAdjustment[]
  customDeductions: CustomAdjustment[]
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
  anomalies?: PayrollAnomaly[]
  payslips: PayslipRow[]
  runStatus: string
  totalBasic: number
  totalGross: number
  totalDeductions: number
  totalNetPay: number
  holidaysInPeriod?: HolidayInPeriod[]
  /** Per-employee DTR rows for the run's period, keyed by employeeId. */
  dtrsByEmployee?: Record<string, DtrEntry[]>
  /** Editing also requires payroll:write; read-only payroll viewers can still inspect the breakdown. */
  allowEdits?: boolean
  /** Payslip PDFs belong to the summary/final review stage, not payroll inputs. */
  showPdf?: boolean
}

export function PayrollRunPayslips({ anomalies = [], payslips: initial, runStatus, holidaysInPeriod = [], dtrsByEmployee = {}, allowEdits = true, showPdf = true }: Props) {
  const [basicPayId, setBasicPayId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [detailed, setDetailed] = useState(false)
  const [reviewEmployee, setReviewEmployee] = useState<string | null>(null)
  const [payslips, setPayslips] = useState<PayslipRow[]>(initial)
  const [editing, setEditing] = useState<PayslipEditData | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PayslipRow | null>(null)
  // Which payslip rows are currently expanded to show the gross-pay
  // breakdown.  Set instead of an array for O(1) lookup during render.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { fmt: peso, symbol } = useCurrency()
  const router = useRouter()

  // router.refresh() reuses this client component after computation. Keep its
  // editable local rows aligned with the fresh server payload; useState's
  // initializer alone only runs on the first mount and left the table empty.
  useEffect(() => {
    setPayslips(initial)
  }, [initial])

  useEffect(() => {
    const review = (event: Event) => {
      const id = (event as CustomEvent<{ employeeId: string }>).detail.employeeId
      const row = payslips.find(p => p.employee.id === id)
      if (!row) return
      setFilter('all'); setSearch(row.employee.employeeNo); setExpanded(new Set([row.id])); setReviewEmployee(id)
    }
    window.addEventListener('payroll-review-employee', review)
    return () => window.removeEventListener('payroll-review-employee', review)
  }, [payslips])
  useEffect(() => {
    if (!reviewEmployee) return
    const button = [...document.querySelectorAll<HTMLButtonElement>('[data-review-employee]')].find(el => el.dataset.reviewEmployee === reviewEmployee && el.getClientRects().length)
    button?.scrollIntoView({ behavior: 'smooth', block: 'center' }); button?.focus({ preventScroll: true })
    setReviewEmployee(null)
  }, [reviewEmployee])
  const issuesFor = (ps: PayslipRow) => anomalies.filter(a => a.employeeId === ps.employee.id)
  const changed = (ps: PayslipRow) => {
    const prior = readPreviousPay(ps.calculationBasis)
    return !!prior && (prior.netPay !== ps.netPay || prior.grossPay !== ps.grossPay || prior.totalDeductions !== ps.totalDeductions)
  }
  const adjusted = (ps: PayslipRow) => !['THIRTEENTH_MONTH','LEAVE_ENCASHMENT','FINAL_PAY'].includes((ps.calculationBasis as { kind?: string } | null)?.kind??'') && (!!ps.hasManualEdits || !!ps.basicPayManuallyEdited || ps.customIncomes.length > 0 || ps.customDeductions.length > 0)
  const visible = payslips.filter(ps => matchesPayrollReview(ps, search, filter, issuesFor(ps).length > 0))


  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const permissions = usePermissions()
  const canEdit = permissions.includes('payroll:write') && allowEdits && (runStatus === 'COMPUTED' || runStatus === 'DRAFT' || runStatus === 'FOR_APPROVAL')

  function openEdit(ps: PayslipRow) {
    const customIncomeTotal = ps.customIncomes.reduce((sum, item) => sum + item.amount, 0)
    const customDeductionTotal = ps.customDeductions.reduce((sum, item) => sum + item.amount, 0)
    setEditing({
      id: ps.id,
      calculationBasis: ps.calculationBasis,
      riceAllowance: ps.riceAllowance ?? 0, clothingAllowance: ps.clothingAllowance ?? 0, medicalAllowance: ps.medicalAllowance ?? 0,
      employeeName: `${ps.employee.lastName}, ${ps.employee.firstName}`,
      employeeNo: ps.employee.employeeNo,
      basicSalary: ps.basicSalary,
      regularOtAmount: ps.regularOtAmount,
      restDayOtAmount: ps.restDayOtAmount,
      holidayOtAmount: ps.holidayOtAmount,
      nightDiffAmount: ps.nightDiffAmount,
      holidayPayAmount: ps.holidayPayAmount,
      otherEarnings: ps.otherEarnings,
      baseOtherEarnings: Math.max(0, ps.otherEarnings - customIncomeTotal),
      customIncomes: ps.customIncomes,
      sssEmployee: ps.sssEmployee,
      philhealthEmployee: ps.philhealthEmployee,
      pagibigEmployee: ps.pagibigEmployee,
      withholdingTax: ps.withholdingTax,
      lateDeduction: ps.lateDeduction,
      undertimeDeduction: ps.undertimeDeduction,
      absenceDeduction: ps.absenceDeduction,
      otherDeductions: ps.otherDeductions,
      baseOtherDeductions: Math.max(0, (readDeductionCarryover(ps.calculationBasis)?.otherDue ?? ps.otherDeductions) - customDeductionTotal),
      customDeductions: ps.customDeductions,
      sssEc: ps.sssEc,
      sssLoanDeduction: ps.sssLoanDeduction,
      pagibigLoan: ps.pagibigLoan,
      companyLoan: ps.companyLoan,
    })
  }

  async function deletePayslip(ps: PayslipRow) {
    setPendingDelete(null)
    setDeletingId(ps.id)
    try {
      const response = await fetch(`/api/payroll/payslip/${ps.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(result.error ?? 'Failed to remove employee from payroll inputs')
        return
      }
      setPayslips(current => current.filter(item => item.id !== ps.id))
      toast.success(`${ps.employee.firstName} ${ps.employee.lastName} removed from this payroll run`)
      router.refresh()
    } catch {
      toast.error('Failed to remove employee from payroll inputs')
    } finally {
      setDeletingId(null)
    }
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
              basicPayManuallyEdited: updated.basicPayManuallyEdited ?? ps.basicPayManuallyEdited,
              hasManualEdits: updated.hasManualEdits ?? ps.hasManualEdits,
              regularOtAmount:    updated.regularOtAmount    ?? ps.regularOtAmount,
              restDayOtAmount:    updated.restDayOtAmount    ?? ps.restDayOtAmount,
              holidayOtAmount:    updated.holidayOtAmount    ?? ps.holidayOtAmount,
              nightDiffAmount:    updated.nightDiffAmount    ?? ps.nightDiffAmount,
              holidayPayAmount:   updated.holidayPayAmount   ?? ps.holidayPayAmount,
              otherEarnings:      updated.otherEarnings      ?? ps.otherEarnings,
              customIncomes:      updated.customIncomes      ?? ps.customIncomes,
              sssEmployee:        updated.sssEmployee        ?? ps.sssEmployee,
              philhealthEmployee: updated.philhealthEmployee ?? ps.philhealthEmployee,
              pagibigEmployee:    updated.pagibigEmployee    ?? ps.pagibigEmployee,
              withholdingTax:     updated.withholdingTax     ?? ps.withholdingTax,
              lateDeduction:      updated.lateDeduction      ?? ps.lateDeduction,
              undertimeDeduction: updated.undertimeDeduction ?? ps.undertimeDeduction,
              absenceDeduction:   updated.absenceDeduction   ?? ps.absenceDeduction,
              otherDeductions:    updated.otherDeductions    ?? ps.otherDeductions,
              customDeductions:   updated.customDeductions   ?? ps.customDeductions,
              sssLoanDeduction: updated.sssLoanDeduction ?? ps.sssLoanDeduction,
              pagibigLoan: updated.pagibigLoan ?? ps.pagibigLoan,
              companyLoan: updated.companyLoan ?? ps.companyLoan,
              calculationBasis: updated.calculationBasis ?? ps.calculationBasis,
              grossPay:           updated.grossPay,
              totalDeductions:    updated.totalDeductions,
              netPay:             updated.netPay,
            }
      )
    )
    router.refresh()
  }

  const columns: { label: string; value: (ps: PayslipRow) => number }[] = detailed ? [
    { label: 'Basic pay', value: p => p.basicSalary },
    { label: 'Overtime', value: p => p.regularOtAmount + p.restDayOtAmount + p.holidayOtAmount },
    { label: 'Holiday pay', value: p => p.holidayPayAmount },
    { label: 'Night differential', value: p => p.nightDiffAmount },
    { label: 'Other earnings', value: p => p.otherEarnings + (p.riceAllowance ?? 0) + (p.clothingAllowance ?? 0) + (p.medicalAllowance ?? 0) },
    { label: 'Gross pay', value: p => p.grossPay },
    { label: 'SSS', value: p => p.sssEmployee }, { label: 'PhilHealth', value: p => p.philhealthEmployee },
    { label: 'Pag-IBIG', value: p => p.pagibigEmployee }, { label: 'Tax', value: p => p.withholdingTax },
    { label: 'Attendance', value: p => p.lateDeduction + p.undertimeDeduction + p.absenceDeduction },
    { label: 'Loans', value: p => p.sssLoanDeduction + p.pagibigLoan + p.companyLoan },
    { label: 'Other deductions', value: p => p.otherDeductions },
    { label: 'Total deductions', value: p => p.totalDeductions }, { label: 'Net pay', value: p => p.netPay },
  ] : [
    { label: 'Basic pay', value: p => p.basicSalary },
    { label: 'Additional earnings', value: p => p.grossPay - p.basicSalary },
    { label: 'Gross pay', value: p => p.grossPay },
    { label: 'Deductions', value: p => p.totalDeductions }, { label: 'Net pay', value: p => p.netPay },
  ]
  const earningItems = (ps: PayslipRow) => <ul className="mt-1 space-y-1 text-xs font-normal text-slate-600 whitespace-normal">{ps.incomes.filter(item => item.amount !== 0).map((item, index) => <li key={`income-${index}`}><span>{item.typeName}</span>: <span className="whitespace-nowrap">{peso(item.amount)}</span></li>)}{ps.customIncomes.filter(item => item.amount !== 0).map((item, index) => <li key={`custom-${index}`}>{item.label}: <span className="whitespace-nowrap">{peso(item.amount)}</span></li>)}</ul>
  const basicPay = (ps: PayslipRow) => <button type="button" aria-haspopup="dialog" aria-label={`View basic pay computation for ${ps.employee.firstName} ${ps.employee.lastName}`} onClick={() => setBasicPayId(ps.id)} className="min-h-11 text-blue-700 underline decoration-dotted underline-offset-4 hover:text-blue-900">{peso(ps.basicSalary)}<span className="block text-[10px] font-normal">View computation</span></button>
  const basicPayEmployee = payslips.find(ps => ps.id === basicPayId)
  const actions = (ps: PayslipRow) => <div className="flex flex-wrap items-center gap-2">
    {canEdit && <><button type="button" onClick={() => openEdit(ps)} className="min-h-11 inline-flex items-center gap-1 rounded-lg border px-3 text-sm hover:bg-blue-50" aria-label={`Adjust pay for ${ps.employee.firstName} ${ps.employee.lastName}`}><Pencil className="h-4 w-4" />Adjust</button>
    <button type="button" onClick={() => setPendingDelete(ps)} disabled={deletingId === ps.id} className="min-h-11 min-w-11 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 inline-flex items-center justify-center" aria-label={`Remove ${ps.employee.firstName} ${ps.employee.lastName} from payroll`}>{deletingId === ps.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></>}
    {showPdf && <a href={`/api/payroll/payslip/${ps.id}/pdf`} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center px-2 underline text-sm" aria-label={`Download payslip for ${ps.employee.firstName} ${ps.employee.lastName}`}>PDF</a>}
  </div>
  const flags = (ps: PayslipRow) => <div className="flex flex-wrap gap-1 text-xs">
    {issuesFor(ps).length > 0 && <span className="rounded bg-amber-100 px-2 py-1 text-amber-900">{issuesFor(ps).length} check(s)</span>}
    {changed(ps) && <span className="rounded bg-violet-50 px-2 py-1 text-violet-800">Changed since prior computation</span>}
    {adjusted(ps) && <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">Adjusted</span>}
    {(readDeductionCarryover(ps.calculationBasis)?.deferredTotal ?? 0) > 0 && <span className="rounded bg-amber-50 px-2 py-1 text-amber-900">{peso(readDeductionCarryover(ps.calculationBasis)!.deferredTotal)} carried forward</span>}
    {ps.netPay <= 0 && <span className="rounded bg-red-50 px-2 py-1 text-red-800">{ps.netPay < 0 ? 'Negative pay' : 'Zero pay'}</span>}
  </div>
  const details = (ps: PayslipRow) => <>
    {issuesFor(ps).map(a => <p key={a.key} className="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{a.title}: {a.detail}</p>)}
    <GrossPayBreakdown ps={ps} peso={peso} holidaysInPeriod={holidaysInPeriod} dtrs={dtrsByEmployee[ps.employee.id] ?? []} />
  </>
  const calculatedAt = payslips.map(p => readCalculatedAt(p.calculationBasis)).filter((value): value is string => value !== null).sort().at(-1)
  const runNet = payslips.reduce((sum, p) => sum + p.netPay, 0)
  return (
    <>
      <p className="px-4 pt-4 text-xs text-slate-500">{calculatedAt ? `Last calculated ${new Date(calculatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })} (Philippine time).` : 'Calculation timestamp was not saved for this older run.'} Recompute after changing attendance or payroll inputs. Saved manual overrides are preserved.</p>
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex-1 min-w-0 text-xs font-semibold text-slate-600">Find an employee<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, employee number or department" className="mt-1 block min-h-11 w-full rounded-lg border px-3 text-sm font-normal" /></label>
        <label className="text-xs font-semibold text-slate-600">Show<select value={filter} onChange={e => setFilter(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal"><option value="all">All employees</option><option value="issues">Needs review</option><option value="changed">Changed since prior computation</option><option value="adjusted">With adjustments</option><option value="carryover">With carryovers</option><option value="zero">Zero or negative pay</option></select></label>
        <button type="button" aria-pressed={detailed} onClick={() => setDetailed(!detailed)} className="hidden md:block min-h-11 rounded-lg border px-3 text-sm">{detailed ? 'Show simplified columns' : 'Show detailed columns'}</button>
        {(search || filter !== 'all') && <button type="button" onClick={() => { setSearch(''); setFilter('all') }} className="min-h-11 px-3 text-sm underline">Clear filters</button>}
      </div>
      <div className="flex flex-wrap justify-between gap-2 bg-slate-50 px-4 py-3 text-xs text-slate-600" aria-live="polite"><span>Showing {visible.length} of {payslips.length} employees</span><span>Entire run net pay: <strong>{peso(runNet)}</strong></span></div>
      {visible.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{payslips.length ? 'No employees match these filters. Try another name or clear the filters.' : 'Calculate payroll to see employee pay here.'}</p>}
      <div className="space-y-3 p-3 md:hidden">
        {visible.map(ps => <article key={ps.id} className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex justify-between gap-3"><div><p className="font-semibold">{ps.employee.lastName}, {ps.employee.firstName}</p><p className="text-xs text-slate-500">{ps.employee.employeeNo} | {ps.employee.department?.name ?? 'No department'}</p></div><div className="text-right"><p className="text-xs text-slate-500">Net pay</p><p className="font-bold">{peso(ps.netPay)}</p></div></div>
          {flags(ps)}
          <dl className="grid grid-cols-2 gap-2 text-sm"><div className="col-span-2"><dt className="text-xs text-slate-500">Basic pay</dt><dd>{basicPay(ps)}</dd></div><div><dt className="text-xs text-slate-500">Additional earnings</dt><dd>{peso(ps.grossPay - ps.basicSalary)}{earningItems(ps)}</dd></div><div><dt className="text-xs text-slate-500">Gross pay</dt><dd>{peso(ps.grossPay)}</dd></div><div><dt className="text-xs text-slate-500">Deductions</dt><dd>{peso(ps.totalDeductions)}</dd></div></dl>
          <div className="flex flex-wrap justify-between gap-2"><button type="button" data-review-employee={ps.employee.id} aria-expanded={expanded.has(ps.id)} aria-controls={`mobile-detail-${ps.id}`} onClick={() => toggleExpand(ps.id)} className="min-h-11 underline text-sm">{expanded.has(ps.id) ? 'Hide breakdown' : 'View breakdown'}</button>{actions(ps)}</div>
          {expanded.has(ps.id) && <div id={`mobile-detail-${ps.id}`} className="border-t pt-3">{details(ps)}</div>}
        </article>)}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap tabular-nums"><thead><tr className="border-b bg-slate-50"><th scope="col" className="sticky left-0 z-10 bg-slate-50 p-3 text-left">Employee</th>{columns.map(c => <th scope="col" key={c.label} className="p-3 text-right">{c.label}</th>)}<th scope="col" className="p-3 text-left">Review</th><th scope="col" className="p-3 text-left">Actions</th></tr></thead>
          <tbody>{visible.map(ps => <Fragment key={ps.id}>
            <tr className="border-b hover:bg-slate-50"><th scope="row" className="sticky left-0 z-10 bg-white p-3 text-left font-normal"><button type="button" data-review-employee={ps.employee.id} aria-expanded={expanded.has(ps.id)} aria-controls={`detail-${ps.id}`} onClick={() => toggleExpand(ps.id)} className="min-h-11 flex items-center gap-2 text-left"><ChevronDown className={`h-4 w-4 ${expanded.has(ps.id) ? '' : '-rotate-90'}`} /><span><span className="block font-semibold">{ps.employee.lastName}, {ps.employee.firstName}</span><span className="block text-xs text-slate-500">{ps.employee.employeeNo}</span></span></button></th>
            {columns.map(c => <td key={c.label} className={`p-3 text-right ${c.label === 'Net pay' ? 'font-bold' : ''}`}>{c.label === 'Basic pay' ? basicPay(ps) : <>{peso(c.value(ps))}{(c.label === 'Additional earnings' || c.label === 'Other earnings') && earningItems(ps)}</>}</td>)}<td className="p-3 max-w-48 whitespace-normal">{flags(ps)}</td><td className="p-3">{actions(ps)}</td></tr>
            {expanded.has(ps.id) && <tr><td colSpan={columns.length + 3} className="bg-slate-50 p-5 whitespace-normal"><div id={`detail-${ps.id}`}>{details(ps)}</div></td></tr>}
          </Fragment>)}</tbody>
          <tfoot><tr className="border-t-2 bg-slate-100 font-semibold"><th scope="row" className="sticky left-0 bg-slate-100 p-3 text-left">{visible.length === payslips.length ? 'Run total' : 'Filtered subtotal'}</th>{columns.map(c => <td key={c.label} className="p-3 text-right">{peso(visible.reduce((sum, p) => sum + c.value(p), 0))}</td>)}<td colSpan={2} /></tr></tfoot>
        </table>
      </div>

      {basicPayEmployee && <BasicPayComputationDialog payslip={basicPayEmployee} dtrs={dtrsByEmployee[basicPayEmployee.employee.id] ?? []} formatAmount={peso} onClose={() => setBasicPayId(null)} />}
      {editing && (
        <PayslipEditModal
          payslip={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          currencySymbol={symbol()}
          formatAmount={peso}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove employee from payroll?"
        description={pendingDelete ? `${pendingDelete.employee.firstName} ${pendingDelete.employee.lastName} will be removed from this payroll run. Their calculated payroll input will be deleted and the run totals will be updated.` : undefined}
        confirmLabel="Remove employee"
        variant="danger"
        onConfirm={() => { if (pendingDelete) void deletePayslip(pendingDelete) }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}

interface BreakdownProps {
  ps: PayslipRow
  peso: (n: number) => string
  holidaysInPeriod: HolidayInPeriod[]
  dtrs: DtrEntry[]
}

function GrossPayBreakdown({ ps, peso, holidaysInPeriod, dtrs }: BreakdownProps) {
  const previous = readPreviousPay(ps.calculationBasis)
  const carry = readDeductionCarryover(ps.calculationBasis)
  const basis = readHourlyCalculationBasis(ps.calculationBasis)
  const totals = payslipTotals(ps)
  const round = (n: number) => Number(n.toFixed(2))
  const earnings: Array<[string, number]> = [
    [ps.basicPayManuallyEdited ? 'Basic pay (manual override)' : 'Basic pay', ps.basicSalary],
    ['Regular overtime', ps.regularOtAmount],
    ['Rest-day overtime', ps.restDayOtAmount],
    ['Holiday overtime', ps.holidayOtAmount],
    ['Night differential', ps.nightDiffAmount],
    ['Worked-holiday premium', ps.holidayPayAmount],
    ['Rice allowance', ps.riceAllowance ?? 0],
    ['Clothing allowance', ps.clothingAllowance ?? 0],
    ['Medical allowance', ps.medicalAllowance ?? 0],
    ...ps.incomes.map(i => [i.typeName, i.amount] as [string, number]),
    ...ps.customIncomes.map(i => [i.label, i.amount] as [string, number]),
  ]
  const listedOther = ps.incomes.reduce((s, i) => s + i.amount, 0) + ps.customIncomes.reduce((s, i) => s + i.amount, 0)
  earnings.push(['Other earnings / adjustment', round(ps.otherEarnings - listedOther)])
  const grossDifference = round(ps.grossPay - totals.grossPay)
  const deductionDifference = round(ps.totalDeductions - totals.totalDeductions)
  const netDifference = round(ps.netPay - (ps.grossPay - ps.totalDeductions))
  const dtrHours = round(dtrs.reduce((s, d) => s + d.regularHours, 0))
  const holidayByDate = new Map(holidaysInPeriod.map(h => [h.date, h]))
  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Saved payroll breakdown</p>

      {carry && (carry.loans.length > 0 || carry.otherDue > 0) && <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
        <div className="p-3"><p className="text-sm font-semibold">Deduction collection: {peso(carry.deferredTotal)} carried to next payroll</p><p className="text-xs mt-1">Only collected amounts reduce net pay and loan balances. Unpaid amounts remain due.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-xs tabular-nums"><thead><tr><th className="p-3 text-left">Deduction</th><th className="p-3 text-right">Previous carryover</th><th className="p-3 text-right">Current amount due</th><th className="p-3 text-right">Collected now</th><th className="p-3 text-right">Carried forward</th></tr></thead><tbody>
          {carry.loans.map(l => <tr key={l.id} className="border-t border-amber-200"><td className="p-3">{l.label ?? `${l.type.replaceAll('_', ' ')} (${l.id.slice(-6)})`}</td><td className="p-3 text-right">{l.incoming === undefined ? 'Not saved' : peso(l.incoming)}</td><td className="p-3 text-right">{l.incoming === undefined ? 'Not saved' : peso(Math.max(0, l.amount - l.incoming))}</td><td className="p-3 text-right">{peso(l.paid)}</td><td className="p-3 text-right">{peso(l.deferred)}</td></tr>)}
          {carry.otherDue > 0 && <tr className="border-t border-amber-200"><td className="p-3">Other deductions</td><td className="p-3 text-right">{peso(carry.incomingOther)}</td><td className="p-3 text-right">{peso(Math.max(0, carry.otherDue - carry.incomingOther))}</td><td className="p-3 text-right">{peso(carry.otherPaid)}</td><td className="p-3 text-right">{peso(carry.otherDeferred)}</td></tr>}
        </tbody></table></div>
      </div>}
      {previous && <div className="rounded-lg border bg-white p-3 text-xs"><p className="font-semibold">Change from the previously saved payroll</p><p className="mt-1">Gross: {peso(previous.grossPay)} to {peso(ps.grossPay)}. Deductions: {peso(previous.totalDeductions)} to {peso(ps.totalDeductions)}. Net pay: {peso(previous.netPay)} to {peso(ps.netPay)}.</p></div>}
      {ps.netPay < 0 && <p className="text-xs text-red-700">Statutory and attendance deductions exceed earnings. Review these amounts before processing payroll; loans and other deductions cannot cover this shortfall.</p>}
      {basis && <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <p className="px-3 py-2 text-xs font-semibold">Scheduled basic pay: {basis.scheduledHours.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} hours x {peso(basis.hourlyRate)} = {peso(basis.computedBasicPay)}</p>
        <table className="w-full text-xs"><thead><tr className="bg-slate-50 text-left"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Scheduled paid hours</th><th className="px-3 py-2 text-right">Basic amount</th></tr></thead><tbody>
          {basis.days.map(d => <tr key={d.date} className="border-t"><td className="px-3 py-2">{d.date}</td><td className="px-3 py-2">{d.hours.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}</td><td className="px-3 py-2 text-right">{peso(d.amount)}</td></tr>)}
          <tr className="border-t font-bold"><td colSpan={2} className="px-3 py-2">Computed scheduled basic pay</td><td className="px-3 py-2 text-right">{peso(basis.computedBasicPay)}</td></tr>
          {round(ps.basicSalary - basis.computedBasicPay) !== 0 && <tr className="border-t"><td colSpan={2} className="px-3 py-2">{ps.basicPayManuallyEdited ? 'Manual basic-pay adjustment' : 'Difference from saved calculation - review required'}</td><td className="px-3 py-2 text-right">{peso(round(ps.basicSalary - basis.computedBasicPay))}</td></tr>}
        </tbody></table>
        <p className="px-3 py-2 text-[11px] text-slate-500">Hours and rate saved at computation. Unpaid gaps and configured breaks are excluded. Late/undertime are deducted separately. Daily rounding is reconciled to the period total.</p>
      </div>}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs"><tbody>
          {earnings.filter(([, amount], i) => i === 0 || amount !== 0).map(([label, amount], i) => (
            <tr key={i} className="border-b"><td className="px-3 py-2">{label}</td><td className="px-3 py-2 text-right font-semibold">{peso(amount)}</td></tr>
          ))}
          {grossDifference !== 0 && <tr className="bg-amber-50 text-amber-900"><td className="px-3 py-2">Unreconciled saved gross difference - review required</td><td className="px-3 py-2 text-right">{peso(grossDifference)}</td></tr>}
          <tr className="bg-slate-50 font-bold"><td className="px-3 py-2">Saved gross pay</td><td className="px-3 py-2 text-right">{peso(ps.grossPay)}</td></tr>
          {[
            ['Government contributions', [['SSS (employee share)', ps.sssEmployee], ['PhilHealth (employee share)', ps.philhealthEmployee], ['Pag-IBIG (employee share)', ps.pagibigEmployee]]],
            ['Income tax', [['Withholding tax', ps.withholdingTax]]],
            ['Attendance deductions', [['Late', ps.lateDeduction], ['Undertime', ps.undertimeDeduction], ['Absence', ps.absenceDeduction]]],
            ['Loan repayments collected', [['SSS loans', ps.sssLoanDeduction], ['Pag-IBIG loans', ps.pagibigLoan], ['Company loans and cash advances', ps.companyLoan]]],
            ['Other deductions collected', [['Other deductions (including benefits and adjustments)', ps.otherDeductions]]],
          ].map(([group, items]) => <Fragment key={group as string}><tr className="bg-slate-50"><th colSpan={2} className="px-3 py-2 text-left font-semibold">{group as string}</th></tr>{(items as [string, number][]).map(([label, amount]) => <tr key={label}><td className="px-3 py-2">{label}</td><td className="px-3 py-2 text-right">{peso(amount)}</td></tr>)}</Fragment>)}
          {deductionDifference !== 0 && <tr className="bg-amber-50 text-amber-900"><td className="px-3 py-2">Unreconciled saved deduction difference - review required</td><td className="px-3 py-2 text-right">{peso(deductionDifference)}</td></tr>}
          <tr><td className="px-3 py-2">Saved total deductions</td><td className="px-3 py-2 text-right">{peso(ps.totalDeductions)}</td></tr>
          {netDifference !== 0 && <tr className="bg-amber-50 text-amber-900"><td className="px-3 py-2">Unreconciled saved net difference - review required</td><td className="px-3 py-2 text-right">{peso(netDifference)}</td></tr>}
          <tr className="bg-slate-50 font-bold"><td className="px-3 py-2">Saved net pay</td><td className="px-3 py-2 text-right">{peso(ps.netPay)}</td></tr>
        </tbody></table>
      </div>
      {dtrs.length > 0 && <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <p className="px-3 py-2 text-xs text-slate-600">Current attendance reference. Historical calculation inputs were not saved; these rows can differ from the attendance used when payroll was computed. Money amounts above come from the saved payslip.</p>
        {Math.abs(dtrHours - ps.hoursWorked) > 0.01 && <p className="px-3 py-2 text-xs text-amber-800 bg-amber-50">Current DTR hours: {dtrHours.toFixed(2)}; saved payroll hours: {ps.hoursWorked.toFixed(2)}. Review changes or credited leave before recomputing.</p>}
        <table className="w-full text-xs"><thead><tr className="bg-slate-50 text-left">
          {['Date', 'Status', 'Regular hours', 'Recorded OT hours', 'ND hours', 'Late min', 'UT min'].map(h => <th key={h} className="px-3 py-2">{h}</th>)}
        </tr></thead><tbody>
          {dtrs.map((d, index) => <tr key={`${d.date}-${index}`} className="border-t">
            <td className="px-3 py-2">{d.date}</td>
            <td className="px-3 py-2">{d.isAbsent ? 'Absent' : d.isLeave ? (d.isLeavePaid ? 'Paid leave' : 'Unpaid leave') : 'Present'}{holidayByDate.has(d.date) ? ` | ${holidayByDate.get(d.date)!.name}` : ''}</td>
            {[d.regularHours, d.overtimeHours, d.nightDiffHours, d.lateMinutes, d.undertimeMinutes].map((v, i) => <td key={i} className="px-3 py-2">{v.toFixed(2)}</td>)}
          </tr>)}
        </tbody></table>
        <p className="px-3 py-2 text-[11px] text-slate-500">Recorded overtime is attendance information; only approved, eligible overtime is payable. Late and undertime reduce net pay separately from gross.</p>
      </div>}
    </div>
  )
}
