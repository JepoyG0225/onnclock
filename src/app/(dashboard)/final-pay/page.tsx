'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calculator, Printer, Search, ChevronDown, AlertTriangle, FileText, Receipt, X } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { peso } from '@/lib/utils'
import { format, addDays } from 'date-fns'
import { toast } from 'sonner'

type Reason =
  | 'RESIGNATION'
  | 'TERMINATION_JUST_CAUSE'
  | 'TERMINATION_AUTHORIZED'
  | 'REDUNDANCY'
  | 'RETRENCHMENT'
  | 'CLOSURE_NO_LOSSES'
  | 'DISEASE'
  | 'RETIREMENT'
  | 'END_OF_CONTRACT'

/**
 * Separation reasons, grouped by whether they carry separation pay at all —
 * that distinction changes the shape of the whole computation, so it drives
 * the picker rather than hiding in a hint line under it. `article` and `rule`
 * are shown next to the selection so HR can see the basis without looking it
 * up; they mirror separationPayMonthsFor() in lib/payroll/final-pay.ts.
 */
const REASON_OPTIONS: {
  value: Reason
  label: string
  sepPay: boolean
  article: string
  rule: string
}[] = [
  { value: 'RESIGNATION',            label: 'Resignation (voluntary)',              sepPay: false, article: '—',                  rule: 'No separation pay unless a CBA or company policy grants it.' },
  { value: 'TERMINATION_JUST_CAUSE', label: 'Termination — just cause',             sepPay: false, article: 'Art. 297',           rule: 'No separation pay.' },
  { value: 'END_OF_CONTRACT',        label: 'End of contract / project',            sepPay: false, article: '—',                  rule: 'No separation pay.' },
  { value: 'REDUNDANCY',             label: 'Redundancy',                           sepPay: true,  article: 'Art. 298(b)',        rule: '1 month per year of service, minimum 1 month · tax-exempt' },
  { value: 'TERMINATION_AUTHORIZED', label: 'Termination — authorized cause',       sepPay: true,  article: 'Art. 298',           rule: '1 month per year of service, minimum 1 month · tax-exempt' },
  { value: 'CLOSURE_NO_LOSSES',      label: 'Business closure (not due to losses)', sepPay: true,  article: 'Art. 298(d)',        rule: '1 month per year of service, minimum 1 month · tax-exempt' },
  { value: 'RETRENCHMENT',           label: 'Retrenchment (closure due to losses)', sepPay: true,  article: 'Art. 298(c)',        rule: '½ month per year of service, minimum 1 month · tax-exempt' },
  { value: 'DISEASE',                label: 'Disease',                              sepPay: true,  article: 'Art. 299',           rule: '½ month per year of service, minimum 1 month · tax-exempt' },
  { value: 'RETIREMENT',             label: 'Retirement',                           sepPay: true,  article: 'RA 7641 / Art. 302', rule: '½ month per year of service · tax-exempt up to ₱10M' },
]

type OverrideKey =
  | 'unusedLeaveDays'
  | 'unpaidWorkedDays'
  | 'outstandingLoans'
  | 'unreturnedAssetsCost'
  | 'additionalTaxableEarnings'
  | 'additionalNonTaxableEarnings'

type Overrides = Record<OverrideKey, string>

const EMPTY_OVERRIDES: Overrides = {
  unusedLeaveDays: '',
  unpaidWorkedDays: '',
  outstandingLoans: '',
  unreturnedAssetsCost: '',
  additionalTaxableEarnings: '',
  additionalNonTaxableEarnings: '',
}

/**
 * Adjustment inputs, split by whether the API can actually fill them in.
 *
 * This split is the point of the panel. The previous version put all six
 * behind one collapsed disclosure labelled "leave blank to auto-fill", which
 * is only true for the first group — `unpaidWorkedDays` and
 * `unreturnedAssetsCost` have no source anywhere in the endpoint, so leaving
 * them blank silently books zero rather than auto-filling anything. Someone
 * who worked past the last cutoff would lose those wages with nothing on
 * screen to say so.
 */
const SOURCED_FIELDS: { key: OverrideKey; label: string; unit: 'days' | 'peso'; source: string }[] = [
  { key: 'unusedLeaveDays',  label: 'Unused leave',      unit: 'days', source: 'Read from paid-out leave balances' },
  { key: 'outstandingLoans', label: 'Outstanding loans', unit: 'peso', source: 'Read from active loans' },
]

const MANUAL_FIELDS: { key: OverrideKey; label: string; unit: 'days' | 'peso'; source: string }[] = [
  { key: 'unpaidWorkedDays',     label: 'Unpaid days worked', unit: 'days', source: 'No record to read — blank counts as zero' },
  { key: 'unreturnedAssetsCost', label: 'Unreturned assets',  unit: 'peso', source: 'No record to read — blank counts as zero' },
]

const OPTIONAL_FIELDS: { key: OverrideKey; label: string; unit: 'days' | 'peso'; source: string }[] = [
  { key: 'additionalTaxableEarnings',    label: 'Additional taxable',     unit: 'peso', source: 'Commission, contractual bonus' },
  { key: 'additionalNonTaxableEarnings', label: 'Additional non-taxable', unit: 'peso', source: 'Refunds, returned deposits' },
]

interface Employee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  department?: { name: string } | null
  position?: { title: string } | null
  basicSalary: number
  hireDate: string
}

interface ResultComponent { key: string; label: string; amount: number; taxable: boolean; note?: string }

interface FinalPayResponse {
  employee: {
    id: string; employeeNo: string; name: string
    department: string | null; position: string | null
    hireDate: string; monthlySalary: number
  }
  snapshot: {
    lastWorkingDay: string; reason: Reason
    basicEarnedYTD: number; taxableIncomeYTD: number; taxWithheldYTD: number; thirteenthPaidYTD: number
    unusedLeaveDays: number; outstandingLoans: number; cashAdvanceBalance: number
  }
  result: {
    reason: Reason; yearsOfService: number; monthsServedThisYear: number; dailyRate: number
    components: ResultComponent[]
    grossPay: number; taxableEarnings: number; nonTaxableEarnings: number
    separationPay: number; separationPayTaxExempt: boolean
    totalDeductions: number; taxWithheld: number; netFinalPay: number
  }
}

// Offboarding stores broader buckets; map them to our finer SeparationReason set.
function mapOffboardingReason(r: string | null): Reason | null {
  if (!r) return null
  switch (r) {
    case 'RESIGNATION':     return 'RESIGNATION'
    case 'TERMINATION':     return 'TERMINATION_JUST_CAUSE'
    case 'RETIREMENT':      return 'RETIREMENT'
    case 'END_OF_CONTRACT': return 'END_OF_CONTRACT'
    case 'REDUNDANCY':      return 'REDUNDANCY'
  }
  if (REASON_OPTIONS.some(o => o.value === r)) return r as Reason
  return null
}

function tenureLabel(hireDate: string, lastDay: string): string {
  const from = new Date(hireDate)
  const to   = new Date(lastDay)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '—'
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) return '—'
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y > 0 ? `${y} yr` : null, m > 0 ? `${m} mo` : null].filter(Boolean).join(' ') || '0 mo'
}

export default function FinalPayPage() {
  const search = useSearchParams()
  const seedEmployeeId = search.get('employeeId') ?? ''
  const seedLastDay    = search.get('lastDay') ?? format(new Date(), 'yyyy-MM-dd')
  const seedReason     = mapOffboardingReason(search.get('reason')) ?? 'RESIGNATION'

  const [employees,  setEmployees]  = useState<Employee[]>([])
  const [empSearch,  setEmpSearch]  = useState('')
  const [employeeId, setEmployeeId] = useState(seedEmployeeId)
  const [lastDay,    setLastDay]    = useState(seedLastDay)
  const [reason,     setReason]     = useState<Reason>(seedReason)
  const [overrides,  setOverrides]  = useState<Overrides>(EMPTY_OVERRIDES)
  const [computing,  setComputing]  = useState(false)
  const [data,       setData]       = useState<FinalPayResponse | null>(null)
  // The statement opens as a popup over the worksheet. Dismissing it keeps the
  // result — the header offers it back rather than making you recompute.
  const [showStatement, setShowStatement] = useState(false)

  // The exact inputs that produced `data`. Kept so the statement can say which
  // figures were overridden and which came from records, and so deduction
  // lines can be rendered from real inputs instead of being reverse-engineered
  // out of the totals.
  const [computedWith, setComputedWith] = useState<{ sig: string; overrides: Overrides } | null>(null)

  useEffect(() => {
    fetch('/api/employees?limit=500').then(r => r.json()).then(d => setEmployees(d.employees ?? []))
  }, [])

  // Escape closes the statement popup.
  useEffect(() => {
    if (!showStatement) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowStatement(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showStatement])

  const matches = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      e.firstName.toLowerCase().includes(q)
      || e.lastName.toLowerCase().includes(q)
      || e.employeeNo.toLowerCase().includes(q))
  }, [employees, empSearch])

  const visible = matches.slice(0, 30)
  const selected = employees.find(e => e.id === employeeId)
  const reasonMeta = REASON_OPTIONS.find(r => r.value === reason)!

  // Signature of everything that feeds the computation. When it drifts away
  // from what produced the current statement, the statement is stale.
  const sig = JSON.stringify({ employeeId, lastDay, reason, overrides })
  const stale = data != null && computedWith != null && computedWith.sig !== sig

  async function compute() {
    if (!employeeId) { toast.error('Pick an employee first'); return }
    setComputing(true)
    try {
      const body: Record<string, unknown> = { employeeId, lastWorkingDay: lastDay, reason }
      for (const [k, v] of Object.entries(overrides)) {
        if (v.trim() !== '') body[k] = Number(v)
      }
      const res = await fetch('/api/final-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error ?? 'Failed to compute')
        return
      }
      setData(await res.json())
      setComputedWith({ sig, overrides: { ...overrides } })
      setShowStatement(true)
    } finally {
      setComputing(false)
    }
  }

  function setOverride(k: OverrideKey, v: string) {
    setOverrides(o => ({ ...o, [k]: v }))
  }

  // ── Deduction lines ───────────────────────────────────────────────────────
  // Built from the snapshot plus the inputs that were actually submitted, so
  // each line is a real figure rather than the remainder left over after
  // subtracting the others from the total. Cash advance is deliberately not a
  // line: the endpoint zeroes it because advances already sit inside the
  // active-loan balance, so naming it here would promise something the number
  // never contains.
  const deductionLines = useMemo(() => {
    if (!data || !computedWith) return []
    const assets = Number(computedWith.overrides.unreturnedAssetsCost || 0)
    const lines: { key: string; label: string; amount: number; note?: string }[] = []
    if (data.result.taxWithheld > 0) {
      lines.push({
        key: 'tax',
        label: 'Withholding tax',
        amount: data.result.taxWithheld,
        note: `Annual tax on ${peso(data.snapshot.taxableIncomeYTD)} year-to-date plus this settlement, less ${peso(data.snapshot.taxWithheldYTD)} already withheld`,
      })
    }
    if (data.snapshot.outstandingLoans > 0) {
      lines.push({ key: 'loans', label: 'Outstanding loans', amount: data.snapshot.outstandingLoans, note: 'Remaining balance on active loans, including cash advances' })
    }
    if (assets > 0) {
      lines.push({ key: 'assets', label: 'Unreturned assets', amount: assets })
    }
    return lines
  }, [data, computedWith])

  const totalDeductions = data ? data.result.totalDeductions + data.result.taxWithheld : 0
  const dueBy = data ? addDays(new Date(data.snapshot.lastWorkingDay), 30) : null

  function overriddenBadge(k: OverrideKey) {
    return computedWith != null && computedWith.overrides[k].trim() !== ''
  }

  return (
    <div className="space-y-5 print:space-y-3">
      <style jsx global>{`
        @media print {
          aside, header, nav, .print\\:hidden { display: none !important; }
          body { background: white !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          /* The statement lives in a fixed overlay on screen. For print, drop
             it back into normal flow at full height so it paginates instead of
             printing one clipped viewport. */
          .fp-backdrop { display: none !important; }
          .fp-overlay {
            position: static !important;
            display: block !important;
            padding: 0 !important;
            z-index: auto !important;
          }
          .fp-sheet {
            max-width: none !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: 0 !important;
          }
        }
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--brand-ink)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white">
              <FileText className="h-5 w-5" />
            </span>
            Final Pay Worksheet
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything owed on separation, per DOLE Labor Advisory 06-20. Leave balances, active loans
            and year-to-date payslip figures are read from records; anything without a source is asked
            for outright.
          </p>
        </div>
        {data && !showStatement && (
          <Button variant="outline" onClick={() => setShowStatement(true)}>
            <Receipt className="mr-2 h-4 w-4" />
            View statement · {peso(data.result.netFinalPay)}
          </Button>
        )}
      </div>

      {/* ── Worksheet: three panels side by side ────────────────────────── */}
      <div className="grid items-start gap-4 print:hidden lg:grid-cols-3">

        {/* Employee */}
        <div>
          <Card className="h-full">
            <CardContent className="space-y-3 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Employee</p>

              {selected ? (
                <div className="rounded-xl border border-[#e5ecf4] bg-[#f6f9fd] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--brand-ink)]">
                        {selected.lastName}, {selected.firstName}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {selected.employeeNo} · {selected.department?.name ?? '—'} · {selected.position?.title ?? '—'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setEmployeeId(''); setData(null); setComputedWith(null) }}
                      className="shrink-0 text-[11px] font-medium text-[var(--brand-primary)] hover:underline"
                    >
                      Change
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#e5ecf4] pt-2.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Hired</p>
                      <p className="text-xs font-semibold tabular-nums text-[var(--brand-ink)]">
                        {format(new Date(selected.hireDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Tenure</p>
                      <p className="text-xs font-semibold tabular-nums text-[var(--brand-ink)]">
                        {tenureLabel(selected.hireDate, lastDay)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Monthly</p>
                      <p className="text-xs font-semibold tabular-nums text-[var(--brand-ink)]">
                        {peso(Number(selected.basicSalary))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Daily ÷26</p>
                      <p className="text-xs font-semibold tabular-nums text-[var(--brand-ink)]">
                        {peso(Number(selected.basicSalary) / 26)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      data-tour="fp-employee"
                      placeholder="Search name or employee number…"
                      className="pl-8"
                    />
                  </div>
                  <div className="h-[100vh] overflow-y-auto rounded-lg border border-[#e5ecf4]">
                    {visible.length === 0 ? (
                      <p className="p-3 text-xs text-slate-400">No matches</p>
                    ) : (
                      visible.map(e => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setEmployeeId(e.id)}
                          className="w-full border-b border-[#eef3f9] px-3 py-2 text-left text-xs last:border-b-0 hover:bg-[#f6f9fd]"
                        >
                          <div className="font-medium text-[var(--brand-ink)]">{e.lastName}, {e.firstName}</div>
                          <div className="text-slate-400">{e.employeeNo} · {e.department?.name ?? '—'}</div>
                        </button>
                      ))
                    )}
                  </div>
                  {matches.length > visible.length && (
                    <p className="text-[11px] text-slate-400">
                      Showing {visible.length} of {matches.length} — keep typing to narrow it down.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Separation */}
        <div>
          <Card className="h-full">
            <CardContent className="space-y-3 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Separation</p>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">Last working day</label>
                <DatePicker value={lastDay} onChange={setLastDay} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">Reason</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value as Reason)}
                  className="w-full rounded-lg border border-[#dfe7f1] bg-white px-3 py-2 text-sm"
                >
                  <optgroup label="No separation pay">
                    {REASON_OPTIONS.filter(o => !o.sepPay).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Carries separation pay">
                    {REASON_OPTIONS.filter(o => o.sepPay).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                </select>
                <div className={`mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                  reasonMeta.sepPay
                    ? 'bg-[#e7f0ff] text-[var(--brand-primary)]'
                    : 'bg-slate-50 text-slate-500'
                }`}>
                  {reasonMeta.article !== '—' && (
                    <span className="mr-1.5 font-bold tabular-nums">{reasonMeta.article}</span>
                  )}
                  {reasonMeta.rule}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Adjustments */}
        <div>
          <Card className="h-full">
            <CardContent className="space-y-1 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Adjustments</p>

              <AdjustGroup title="Read from records" tone="auto">
                {SOURCED_FIELDS.map(f => (
                  <AdjustRow
                    key={f.key} field={f}
                    value={overrides[f.key]}
                    onChange={v => setOverride(f.key, v)}
                    autoValue={
                      data
                        ? f.key === 'unusedLeaveDays'
                          ? `${data.snapshot.unusedLeaveDays} days`
                          : peso(data.snapshot.outstandingLoans)
                        : null
                    }
                    overridden={overriddenBadge(f.key)}
                  />
                ))}
              </AdjustGroup>

              <AdjustGroup title="Needs your input" tone="manual">
                {MANUAL_FIELDS.map(f => (
                  <AdjustRow
                    key={f.key} field={f}
                    value={overrides[f.key]}
                    onChange={v => setOverride(f.key, v)}
                    autoValue={null}
                    overridden={false}
                  />
                ))}
              </AdjustGroup>

              <AdjustGroup title="Optional" tone="plain">
                {OPTIONAL_FIELDS.map(f => (
                  <AdjustRow
                    key={f.key} field={f}
                    value={overrides[f.key]}
                    onChange={v => setOverride(f.key, v)}
                    autoValue={null}
                    overridden={false}
                  />
                ))}
              </AdjustGroup>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Compute ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 print:hidden">
        <Button
          onClick={compute}
          disabled={!employeeId || computing}
          size="lg"
          className="min-w-[260px]"
        >
          <Calculator className="mr-2 h-4 w-4" />
          {computing ? 'Computing…' : data ? 'Recompute final pay' : 'Compute final pay'}
        </Button>
        {!employeeId && (
          <p className="text-[11px] text-slate-400">Pick an employee to enable this.</p>
        )}
        {stale && (
          <p className="flex items-center gap-1.5 rounded-lg bg-[#fff5d6] px-3 py-2 text-[11px] font-medium text-[#8a6100]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Inputs changed since the statement was computed — recompute to bring it up to date.
          </p>
        )}
      </div>

      {/* ── Statement popup ─────────────────────────────────────────────── */}
      {data && showStatement && (
        <div className="fp-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="fp-backdrop fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowStatement(false)}
          />
          <div className="fp-sheet relative my-auto w-full max-w-3xl rounded-2xl border border-[#dfe7f1] bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#eef3f9] px-5 py-3 print:hidden">
              <p className="text-sm font-bold text-[var(--brand-ink)]">Final pay statement</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" />Print
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowStatement(false)} aria-label="Close statement">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-5">
              {/* Net — the answer, first */}
              <Card className="overflow-hidden border-[#cfe0fb] print:break-inside-avoid">
                <div className="bg-gradient-to-b from-[#e7f0ff] to-transparent px-5 py-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">
                        Net final pay
                      </p>
                      <p className="mt-0.5 text-4xl font-bold tabular-nums leading-tight text-[var(--brand-primary)]">
                        {peso(data.result.netFinalPay)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {data.employee.name} · {data.employee.employeeNo} ·{' '}
                        {REASON_OPTIONS.find(r => r.value === data.snapshot.reason)?.label}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <p>Last working day <span className="font-semibold text-[var(--brand-ink)]">
                        {format(new Date(data.snapshot.lastWorkingDay), 'MMM d, yyyy')}
                      </span></p>
                      {dueBy && (
                        <p className="mt-0.5">Release by <span className="font-semibold text-[var(--brand-ink)]">
                          {format(dueBy, 'MMM d, yyyy')}
                        </span></p>
                      )}
                      <p className="mt-0.5 tabular-nums">
                        {data.result.yearsOfService} yr of service · {peso(data.result.dailyRate)}/day
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Earnings */}
              <Card className="mt-4 print:break-inside-avoid">
                <CardContent className="p-5">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Earnings</p>
                  {data.result.components.map(c => (
                    <StatementLine
                      key={c.key}
                      label={c.label}
                      amount={c.amount}
                      note={c.note}
                      chip={!c.taxable ? (c.key === 'separationPay' ? 'tax-exempt' : 'non-taxable') : null}
                    />
                  ))}
                  <div className="flex items-baseline justify-between border-b-2 border-[#dfe7f1] py-2.5">
                    <span className="text-sm font-bold text-[var(--brand-ink)]">Gross final pay</span>
                    <span className="text-sm font-bold tabular-nums text-[var(--brand-ink)]">
                      {peso(data.result.grossPay)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Deductions */}
              <Card className="mt-4 print:break-inside-avoid">
                <CardContent className="p-5">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Deductions</p>
                  {deductionLines.length === 0 ? (
                    <p className="py-3 text-xs text-slate-400">Nothing to deduct.</p>
                  ) : (
                    deductionLines.map(d => (
                      <StatementLine key={d.key} label={d.label} amount={d.amount} note={d.note} negative />
                    ))
                  )}
                  <div className="flex items-baseline justify-between border-b-2 border-[#dfe7f1] py-2.5">
                    <span className="text-sm font-bold text-[var(--brand-ink)]">Total deductions</span>
                    <span className="text-sm font-bold tabular-nums text-[var(--brand-danger)]">
                      −{peso(totalDeductions)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>Taxable <span className="font-semibold tabular-nums text-[var(--brand-ink)]">{peso(data.result.taxableEarnings)}</span></span>
                    <span>Non-taxable <span className="font-semibold tabular-nums text-[var(--brand-ink)]">{peso(data.result.nonTaxableEarnings)}</span></span>
                    {data.result.separationPay > 0 && (
                      <span>
                        Separation pay{' '}
                        <span className="font-semibold tabular-nums text-[var(--brand-ink)]">{peso(data.result.separationPay)}</span>
                        {data.result.separationPayTaxExempt && (
                          <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                            tax-exempt
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Basis */}
              <div className="mt-4 rounded-xl border border-[#e5ecf4] bg-[#f6f9fd] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-600">Basis</span> — DOLE Labor Advisory 06-20
                (release within 30 days of separation unless a CBA or company policy provides longer) ·
                RA 6686 (13th month) · Labor Code Art. 95 (leave conversion)
                {reasonMeta.article !== '—' && <> · {reasonMeta.article} ({reasonMeta.label.toLowerCase()})</>}
                {data.result.separationPayTaxExempt && <> · NIRC Sec 32(B)(6) (separation-pay exemption)</>}.
                <br />
                This statement is a planning aid — the actual disbursement should still flow through a
                regular payroll cycle so BIR 1601C and the Alphalist reconcile.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Left-rail pieces ──────────────────────────────────────────────────── */

function AdjustGroup({ title, tone, children }: {
  title: string
  tone: 'auto' | 'manual' | 'plain'
  children: React.ReactNode
}) {
  const toneCls =
    tone === 'auto'   ? 'text-emerald-700'
    : tone === 'manual' ? 'text-[#8a6100]'
    : 'text-slate-400'
  return (
    <div className="pt-2">
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${toneCls}`}>{title}</span>
        <span className="h-px flex-1 bg-[#eef3f9]" />
      </div>
      {children}
    </div>
  )
}

function AdjustRow({ field, value, onChange, autoValue, overridden }: {
  field: { key: OverrideKey; label: string; unit: 'days' | 'peso'; source: string }
  value: string
  onChange: (v: string) => void
  autoValue: string | null
  overridden: boolean
}) {
  const isManual = MANUAL_FIELDS.some(f => f.key === field.key)
  return (
    <div className="border-b border-[#f2f6fb] py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-[var(--brand-ink)]">{field.label}</label>
        <Input
          data-tour="fp-amount"
          type="number" min={0} step={field.unit === 'days' ? 0.5 : 0.01}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={autoValue ?? (isManual ? '0' : 'auto')}
          className={`h-7 w-28 px-2 text-right text-xs tabular-nums ${
            isManual && value.trim() === ''
              ? 'border-[#e4c56a] bg-[#fffaf0] placeholder:text-[#a98a3c]'
              : ''
          }`}
        />
      </div>
      <p className={`mt-0.5 text-[10px] ${
        overridden ? 'font-medium text-[var(--brand-primary)]'
        : isManual ? 'text-[#8a6100]'
        : 'text-slate-400'
      }`}>
        {overridden ? 'Overridden — this figure was typed, not read' : field.source}
      </p>
    </div>
  )
}

/* ── Statement line with a disclosable formula ─────────────────────────── */

function StatementLine({ label, amount, note, chip, negative }: {
  label: string
  amount: number
  note?: string
  chip?: string | null
  negative?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[#f2f6fb] py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm text-[var(--brand-ink)]">{label}</span>
          {chip && (
            <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              {chip}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`text-sm font-semibold tabular-nums ${negative ? 'text-[var(--brand-danger)]' : 'text-[var(--brand-ink)]'}`}>
            {negative ? '−' : ''}{peso(amount)}
          </span>
          {note && (
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              aria-label={open ? `Hide how ${label} was computed` : `Show how ${label} was computed`}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 print:hidden"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {note && (
        <p className={`mt-1.5 rounded-r border-l-2 border-[#dfe7f1] bg-[#f6f9fd] px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500 ${open ? '' : 'hidden print:block'}`}>
          {note}
        </p>
      )}
    </div>
  )
}
