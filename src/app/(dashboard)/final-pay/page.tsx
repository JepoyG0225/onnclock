'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Receipt, Calculator, Printer, ChevronRight } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { peso } from '@/lib/utils'
import { format } from 'date-fns'
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

const REASON_OPTIONS: { value: Reason; label: string; hint: string; sepPay: boolean }[] = [
  { value: 'RESIGNATION',            label: 'Resignation (voluntary)',           hint: 'No separation pay (unless CBA/policy)',                  sepPay: false },
  { value: 'TERMINATION_JUST_CAUSE', label: 'Termination — Just cause',          hint: 'Art. 297. No separation pay.',                            sepPay: false },
  { value: 'END_OF_CONTRACT',        label: 'End of contract / project',         hint: 'No separation pay.',                                      sepPay: false },
  { value: 'REDUNDANCY',             label: 'Redundancy',                        hint: 'Art. 298(b). 1 mo/yr (min 1 mo). Tax-exempt.',           sepPay: true  },
  { value: 'TERMINATION_AUTHORIZED', label: 'Termination — Authorized cause',    hint: 'Art. 298. 1 mo/yr (min 1 mo). Tax-exempt.',              sepPay: true  },
  { value: 'CLOSURE_NO_LOSSES',      label: 'Business closure (not due to losses)', hint: 'Art. 298(d). 1 mo/yr (min 1 mo). Tax-exempt.',        sepPay: true  },
  { value: 'RETRENCHMENT',           label: 'Retrenchment (closure due to losses)', hint: 'Art. 298(c). ½ mo/yr (min 1 mo). Tax-exempt.',         sepPay: true  },
  { value: 'DISEASE',                label: 'Disease',                           hint: 'Art. 299. ½ mo/yr (min 1 mo). Tax-exempt.',              sepPay: true  },
  { value: 'RETIREMENT',             label: 'Retirement',                        hint: 'RA 7641 / Art. 302. ½ mo/yr. Tax-exempt up to ₱10M.',    sepPay: true  },
]

interface Employee { id: string; firstName: string; lastName: string; employeeNo: string; department?: { name: string } | null; position?: { title: string } | null; basicSalary: number; hireDate: string }
interface ResultComponent { key: string; label: string; amount: number; taxable: boolean; note?: string }
interface FinalPayResponse {
  employee: { id: string; employeeNo: string; name: string; department: string | null; position: string | null; hireDate: string; monthlySalary: number }
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
  // Already a finer enum value?
  if (REASON_OPTIONS.some(o => o.value === r)) return r as Reason
  return null
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
  const [overrides,  setOverrides]  = useState({
    unusedLeaveDays: '',
    unpaidWorkedDays: '',
    outstandingLoans: '',
    unreturnedAssetsCost: '',
    additionalTaxableEarnings: '',
    additionalNonTaxableEarnings: '',
  })
  const [computing, setComputing] = useState(false)
  const [data, setData] = useState<FinalPayResponse | null>(null)

  useEffect(() => {
    fetch('/api/employees?limit=500').then(r => r.json()).then(d => setEmployees(d.employees ?? []))
  }, [])

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    if (!q) return employees.slice(0, 30)
    return employees
      .filter(e =>
        e.firstName.toLowerCase().includes(q)
        || e.lastName.toLowerCase().includes(q)
        || e.employeeNo.toLowerCase().includes(q))
      .slice(0, 30)
  }, [employees, empSearch])

  async function compute() {
    if (!employeeId) { toast.error('Pick an employee'); return }
    setComputing(true)
    try {
      const body: Record<string, unknown> = { employeeId, lastWorkingDay: lastDay, reason }
      // Only forward overrides the user actually typed
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
    } finally {
      setComputing(false)
    }
  }

  function printSheet() {
    if (typeof window !== 'undefined') window.print()
  }

  const selected = employees.find(e => e.id === employeeId)

  return (
    <div className="space-y-6 print:space-y-3">
      <style jsx global>{`
        @media print {
          aside, header, nav, .print\\:hidden { display: none !important; }
          body { background: white !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Final Pay Calculator</h1>
          <p className="text-slate-500 text-sm mt-1">
            Compute every component owed to an employee on separation (DOLE Labor Advisory 06-20). Auto-loads YTD payslips, leave balance, and active loans.
          </p>
        </div>
        {data && (
          <Button onClick={printSheet} variant="outline">
            <Printer className="w-4 h-4 mr-2" />Print Statement
          </Button>
        )}
      </div>

      {/* Form */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-sm">Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Search Employee</label>
              <Input
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                placeholder="Type a name or ID…"
              />
              <div className="mt-2 border rounded max-h-48 overflow-y-auto">
                {filteredEmployees.length === 0 ? (
                  <p className="p-3 text-xs text-gray-400">No matches</p>
                ) : (
                  filteredEmployees.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEmployeeId(e.id)}
                      className={`w-full text-left px-3 py-2 text-xs border-b hover:bg-gray-50 ${employeeId === e.id ? 'bg-orange-50' : ''}`}
                    >
                      <div className="font-medium">{e.lastName}, {e.firstName}</div>
                      <div className="text-gray-400">{e.employeeNo} · {e.department?.name ?? '—'}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Last Working Day</label>
                  <DatePicker value={lastDay} onChange={setLastDay} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Reason for Separation</label>
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value as Reason)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {REASON_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">{REASON_OPTIONS.find(r => r.value === reason)?.hint}</p>
                </div>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-orange-600 font-medium">Optional overrides — leave blank to auto-fill</summary>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  {([
                    ['unusedLeaveDays', 'Unused leave (days)'],
                    ['unpaidWorkedDays', 'Unpaid days worked (post-cutoff)'],
                    ['outstandingLoans', 'Outstanding loans (₱)'],
                    ['unreturnedAssetsCost', 'Unreturned assets (₱)'],
                    ['additionalTaxableEarnings', 'Additional taxable (₱)'],
                    ['additionalNonTaxableEarnings', 'Additional non-taxable (₱)'],
                  ] as [keyof typeof overrides, string][]).map(([k, label]) => (
                    <div key={k}>
                      <label className="text-[11px] text-gray-500 block">{label}</label>
                      <Input
                        type="number" min={0} step={0.01}
                        value={overrides[k]}
                        onChange={e => setOverrides(o => ({ ...o, [k]: e.target.value }))}
                        placeholder="auto"
                      />
                    </div>
                  ))}
                </div>
              </details>

              <Button onClick={compute} disabled={!employeeId || computing} style={{ background: '#fa5e01' }}>
                <Calculator className="w-4 h-4 mr-2" />
                {computing ? 'Computing…' : 'Compute Final Pay'}
              </Button>
            </div>
          </div>

          {selected && (
            <div className="rounded-lg bg-gray-50 text-xs px-3 py-2 flex items-center gap-3 text-gray-600">
              <Receipt className="w-3.5 h-3.5" />
              <span><span className="font-semibold text-gray-800">{selected.lastName}, {selected.firstName}</span> · {selected.employeeNo} · {selected.position?.title ?? '—'}</span>
              <span className="ml-auto">Monthly: {peso(Number(selected.basicSalary))}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {computing && (
        <div className="flex items-center justify-center py-10"><AppSpinner size="md" /></div>
      )}

      {/* Result */}
      {data && !computing && (
        <div className="space-y-4 print:space-y-2">
          {/* Header for printable statement */}
          <Card className="print:break-inside-avoid">
            <CardContent className="p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Final Pay Statement</p>
                  <h2 className="text-xl font-bold mt-1" style={{ color: '#2E4156' }}>{data.employee.name}</h2>
                  <p className="text-sm text-gray-500">
                    {data.employee.employeeNo} · {data.employee.department ?? '—'} · {data.employee.position ?? '—'}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-xs text-gray-400">Last working day</p>
                  <p className="font-semibold">{format(new Date(data.snapshot.lastWorkingDay), 'MMM d, yyyy')}</p>
                  <p className="text-xs text-gray-400 mt-2">Reason</p>
                  <Badge variant="outline" className="mt-0.5">
                    {REASON_OPTIONS.find(r => r.value === data.snapshot.reason)?.label}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-gray-400">Years of Service</p>
                  <p className="font-semibold text-base">{data.result.yearsOfService}</p>
                </div>
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-gray-400">Hire Date</p>
                  <p className="font-semibold text-base">{format(new Date(data.employee.hireDate), 'MMM d, yyyy')}</p>
                </div>
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-gray-400">Monthly Salary</p>
                  <p className="font-semibold text-base">{peso(data.employee.monthlySalary)}</p>
                </div>
                <div className="bg-gray-50 rounded px-3 py-2">
                  <p className="text-gray-400">Daily Rate (÷26)</p>
                  <p className="font-semibold text-base">{peso(data.result.dailyRate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Components */}
          <Card className="print:break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />Earnings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  {data.result.components.map(c => (
                    <tr key={c.key} className="border-b">
                      <td className="p-3">
                        <div className="font-medium text-gray-800">{c.label}</div>
                        {c.note && <div className="text-[11px] text-gray-400 mt-0.5">{c.note}</div>}
                      </td>
                      <td className="p-3 text-right">
                        {!c.taxable && (
                          <span className="text-[10px] text-green-700 bg-green-50 rounded px-1.5 py-0.5 mr-2">non-tax</span>
                        )}
                        <span className="font-semibold">{peso(c.amount)}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td className="p-3 font-semibold text-gray-700">Gross Final Pay</td>
                    <td className="p-3 text-right font-bold text-lg" style={{ color: '#2E4156' }}>{peso(data.result.grossPay)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Deductions */}
          <Card className="print:break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />Deductions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="p-3 text-gray-700">Withholding tax (final settlement)</td>
                    <td className="p-3 text-right text-red-600">-{peso(data.result.taxWithheld)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-gray-700">Outstanding loans & cash advance</td>
                    <td className="p-3 text-right text-red-600">-{peso(data.snapshot.outstandingLoans + data.snapshot.cashAdvanceBalance)}</td>
                  </tr>
                  {data.result.totalDeductions - data.snapshot.outstandingLoans - data.snapshot.cashAdvanceBalance > 0 && (
                    <tr className="border-b">
                      <td className="p-3 text-gray-700">Unreturned assets</td>
                      <td className="p-3 text-right text-red-600">-{peso(data.result.totalDeductions - data.snapshot.outstandingLoans - data.snapshot.cashAdvanceBalance)}</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50">
                    <td className="p-3 font-semibold text-gray-700">Total Deductions</td>
                    <td className="p-3 text-right font-bold text-red-700">-{peso(data.result.totalDeductions + data.result.taxWithheld)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Net */}
          <Card className="print:break-inside-avoid" style={{ background: 'rgba(250,94,1,0.06)', borderColor: 'rgba(250,94,1,0.2)' }}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Net Final Pay</p>
                <p className="text-3xl font-bold" style={{ color: '#fa5e01' }}>{peso(data.result.netFinalPay)}</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Taxable: {peso(data.result.taxableEarnings)}</p>
                <p>Non-taxable: {peso(data.result.nonTaxableEarnings)}</p>
                {data.result.separationPay > 0 && (
                  <p className={data.result.separationPayTaxExempt ? 'text-green-700 mt-1' : 'mt-1'}>
                    Separation pay {data.result.separationPayTaxExempt && '(tax-exempt) '}: {peso(data.result.separationPay)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Compliance note */}
          <p className="text-[11px] text-gray-400 italic print:text-gray-600">
            Final pay must be released within 30 days from the date of separation unless a longer period is provided in a CBA or company policy (DOLE Labor Advisory 06-20).
            This statement is generated by OnClock and serves as a planning aid; the actual disbursement should flow through a regular payroll cycle so BIR 1601C and Alphalist reporting reconcile.
          </p>
        </div>
      )}
    </div>
  )
}
