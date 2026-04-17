'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, CreditCard, ChevronDown, ChevronUp, History } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'
import { peso } from '@/lib/utils'

interface Employee { id: string; firstName: string; lastName: string; employeeNo: string }
interface LoanDeduction {
  id: string
  amount: number
  createdAt: string
  payslip?: { payrollRun?: { periodLabel: string } }
}
interface Loan {
  id: string
  loanType: string
  principalAmount: number
  balance: number
  monthlyAmortization: number
  startDate: string
  endDate: string | null
  status: string
  notes: string | null
  employee: { firstName: string; lastName: string; employeeNo: string }
  deductions?: LoanDeduction[]
}

const LOAN_TYPE_OPTIONS = [
  { value: 'SSS_SALARY_LOAN',       label: 'SSS Salary Loan' },
  { value: 'SSS_CALAMITY_LOAN',     label: 'SSS Calamity Loan' },
  { value: 'PAGIBIG_MULTI_PURPOSE', label: 'Pag-IBIG Multi-Purpose' },
  { value: 'PAGIBIG_CALAMITY',      label: 'Pag-IBIG Calamity' },
  { value: 'COMPANY_LOAN',          label: 'Company Loan' },
  { value: 'OTHER',                 label: 'Other' },
]

const TYPE_COLORS: Record<string, string> = {
  SSS_SALARY_LOAN:       'bg-[#C0C8CA] text-[#1A2D42]',
  SSS_CALAMITY_LOAN:     'bg-[#C0C8CA] text-[#1A2D42]',
  PAGIBIG_MULTI_PURPOSE: 'bg-yellow-100 text-yellow-800',
  PAGIBIG_CALAMITY:      'bg-yellow-100 text-yellow-800',
  COMPANY_LOAN:          'bg-purple-100 text-purple-800',
  OTHER:                 'bg-gray-100 text-gray-800',
}

const TYPE_SHORT: Record<string, string> = {
  SSS_SALARY_LOAN:       'SSS Salary',
  SSS_CALAMITY_LOAN:     'SSS Calamity',
  PAGIBIG_MULTI_PURPOSE: 'Pag-IBIG MPL',
  PAGIBIG_CALAMITY:      'Pag-IBIG Cal.',
  COMPANY_LOAN:          'Company',
  OTHER:                 'Other',
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:     'bg-green-100 text-green-800',
  FULLY_PAID: 'bg-gray-100 text-gray-600',
  CANCELLED:  'bg-red-100 text-red-700',
}

export default function LoansPage() {
  const [loans,        setLoans]        = useState<Loan[]>([])
  const [employees,    setEmployees]    = useState<Employee[]>([])
  const [loading,      setLoading]      = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [statusFilter, setStatusFilter] = useState('ACTIVE')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [loanDetail,   setLoanDetail]   = useState<Loan | null>(null)

  const [form, setForm] = useState({
    employeeId:          '',
    loanType:            'COMPANY_LOAN',
    amount:              '',
    monthlyAmortization: '',
    startDate:           format(new Date(), 'yyyy-MM-dd'),
    notes:               '',
  })

  async function load() {
    setLoading(true)
    const res  = await fetch(`/api/loans?status=${statusFilter}&limit=200`)
    const data = await res.json().catch(() => ({}))
    setLoans(data.loans ?? [])
    setLoading(false)
  }

  async function loadEmployees() {
    const res  = await fetch('/api/employees?limit=500')
    const data = await res.json().catch(() => ({}))
    setEmployees(data.employees ?? [])
  }

  useEffect(() => { load() }, [statusFilter])
  useEffect(() => { loadEmployees() }, [])

  async function expandLoan(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    const res = await fetch(`/api/loans/${id}`)
    if (res.ok) setLoanDetail(await res.json())
  }

  async function createLoan() {
    if (!form.employeeId || !form.amount || !form.monthlyAmortization) {
      toast.error('Please fill in required fields')
      return
    }
    const res = await fetch('/api/loans', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        employeeId:          form.employeeId,
        loanType:            form.loanType,
        amount:              Number(form.amount),
        monthlyAmortization: Number(form.monthlyAmortization),
        startDate:           form.startDate,
        notes:               form.notes || null,
      }),
    })
    if (res.ok) {
      toast.success('Loan created — will be deducted on next payroll run')
      setShowForm(false)
      setForm({ employeeId: '', loanType: 'COMPANY_LOAN', amount: '', monthlyAmortization: '', startDate: format(new Date(), 'yyyy-MM-dd'), notes: '' })
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err?.error ?? 'Failed to create loan')
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/loans/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    if (res.ok) {
      toast.success(`Loan marked as ${status.toLowerCase()}`)
      load()
    } else {
      toast.error('Failed to update loan')
    }
  }

  const activeLoans  = loans.filter(l => l.status === 'ACTIVE')
  const totalBalance = activeLoans.reduce((s, l) => s + Number(l.balance), 0)
  const totalMonthly = activeLoans.reduce((s, l) => s + Number(l.monthlyAmortization), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Loans</h1>
          <p className="text-slate-500 text-sm mt-1">
            SSS, Pag-IBIG, and company loans — deductions applied automatically each payroll run
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} style={{ background: '#fa5e01' }}>
          <Plus className="w-4 h-4 mr-2" />New Loan
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Active Loans</p>
            <p className="text-2xl font-bold" style={{ color: '#2E4156' }}>{activeLoans.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Outstanding</p>
            <p className="text-xl font-bold text-red-700">{peso(totalBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Monthly Deductions</p>
            <p className="text-xl font-bold text-orange-700">{peso(totalMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Semi-Monthly / Payslip</p>
            <p className="text-xl font-bold text-[#1A2D42]">{peso(totalMonthly / 2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* New Loan Form */}
      {showForm && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="text-base" style={{ color: '#2E4156' }}>New Loan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Employee *</label>
                <select
                  value={form.employeeId}
                  onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#fa5e01' } as React.CSSProperties}
                >
                  <option value="">Select employee...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Loan Type *</label>
                <select
                  value={form.loanType}
                  onChange={e => setForm(f => ({ ...f, loanType: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {LOAN_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date *</label>
                <DatePicker
                  value={form.startDate}
                  onChange={(v) => setForm(f => ({ ...f, startDate: v }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Loan Amount *</label>
                <Input
                  type="number" min={0} step={0.01}
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="e.g. 20000"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Monthly Amortization *</label>
                <Input
                  type="number" min={0} step={0.01}
                  value={form.monthlyAmortization}
                  onChange={e => setForm(f => ({ ...f, monthlyAmortization: e.target.value }))}
                  placeholder="e.g. 2000"
                />
                {form.amount && form.monthlyAmortization && (
                  <p className="text-xs text-gray-400 mt-1">
                    ≈ {Math.ceil(Number(form.amount) / Number(form.monthlyAmortization))} monthly payments
                    &nbsp;·&nbsp;
                    {peso(Number(form.monthlyAmortization) / 2)}/semi-monthly deduction
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Notes / Reference No.</label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. SSS loan reference #12345"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={createLoan} style={{ background: '#fa5e01' }}>Create Loan</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { val: 'ACTIVE',     label: 'Active' },
          { val: 'FULLY_PAID', label: 'Fully Paid' },
          { val: 'CANCELLED',  label: 'Cancelled' },
          { val: '',           label: 'All' },
        ].map(({ val, label }) => (
          <Button
            key={val}
            variant={statusFilter === val ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(val)}
            style={statusFilter === val ? { background: '#2E4156' } : {}}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Loans Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Loans
            <Badge variant="outline">{loans.length}</Badge>
            {statusFilter === 'ACTIVE' && (
              <span className="ml-2 text-xs text-gray-400 font-normal">
                Deductions applied automatically each payroll run
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : loans.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No loans found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Employee</th>
                    <th className="text-center p-3 font-medium text-gray-600">Type</th>
                    <th className="text-right p-3 font-medium text-gray-600">Principal</th>
                    <th className="text-right p-3 font-medium text-gray-600">Balance</th>
                    <th className="text-right p-3 font-medium text-gray-600">Monthly</th>
                    <th className="text-right p-3 font-medium text-gray-600">Per Payslip</th>
                    <th className="text-left p-3 font-medium text-gray-600">Start Date</th>
                    <th className="text-center p-3 font-medium text-gray-600">Status</th>
                    <th className="text-center p-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map(l => {
                    const principal = Number(l.principalAmount)
                    const balance   = Number(l.balance)
                    const progress  = principal > 0 ? ((principal - balance) / principal) * 100 : 100
                    const isExpanded = expandedId === l.id

                    return (
                      <>
                        <tr key={l.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            <div className="font-medium">{l.employee.lastName}, {l.employee.firstName}</div>
                            <div className="text-xs text-gray-400">{l.employee.employeeNo}</div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[l.loanType] ?? 'bg-gray-100 text-gray-800'}`}>
                              {TYPE_SHORT[l.loanType] ?? l.loanType}
                            </span>
                          </td>
                          <td className="p-3 text-right text-gray-600">{peso(principal)}</td>
                          <td className="p-3 text-right">
                            <span className={balance > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                              {peso(balance)}
                            </span>
                            {/* progress bar */}
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{ width: `${progress}%`, background: progress >= 100 ? '#16a34a' : '#fa5e01' }}
                              />
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{progress.toFixed(0)}% paid</div>
                          </td>
                          <td className="p-3 text-right font-medium" style={{ color: '#fa5e01' }}>
                            {peso(Number(l.monthlyAmortization))}
                          </td>
                          <td className="p-3 text-right text-[#1A2D42]">
                            {peso(Number(l.monthlyAmortization) / 2)}
                          </td>
                          <td className="p-3 text-xs text-gray-600">
                            {format(new Date(l.startDate), 'MMM d, yyyy')}
                            {l.endDate && (
                              <div className="text-gray-400">→ {format(new Date(l.endDate), 'MMM d, yyyy')}</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[l.status] ?? ''}`}>
                              {l.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                title="Deduction history"
                                onClick={() => expandLoan(l.id)}
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
                              </Button>
                              {l.status === 'ACTIVE' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => updateStatus(l.id, 'FULLY_PAID')}
                                  >
                                    Mark Paid
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-red-500 hover:text-red-700"
                                    onClick={() => updateStatus(l.id, 'CANCELLED')}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Deduction history row */}
                        {isExpanded && (
                          <tr key={`${l.id}-history`} className="bg-[#D4D8DD] border-b">
                            <td colSpan={9} className="px-6 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <History className="w-3.5 h-3.5 text-[#2E4156]" />
                                <span className="text-xs font-semibold text-[#1A2D42]">Deduction History</span>
                              </div>
                              {!loanDetail || loanDetail.id !== l.id ? (
                                <p className="text-xs text-gray-400">Loading...</p>
                              ) : !loanDetail.deductions?.length ? (
                                <p className="text-xs text-gray-400">No deductions recorded yet — will appear after payroll is computed.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="text-xs w-full max-w-xl">
                                    <thead>
                                      <tr className="text-gray-500">
                                        <th className="text-left pb-1 pr-4">Date</th>
                                        <th className="text-right pb-1 pr-4">Amount Deducted</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {loanDetail.deductions.map(d => (
                                        <tr key={d.id}>
                                          <td className="pr-4 py-0.5 text-gray-600">
                                            {format(new Date(d.createdAt), 'MMM d, yyyy')}
                                          </td>
                                          <td className="text-right pr-4 py-0.5 font-medium text-red-600">
                                            -{peso(Number(d.amount))}
                                          </td>
                                        </tr>
                                      ))}
                                      <tr className="border-t font-semibold">
                                        <td className="pt-1 text-gray-700">Total Deducted</td>
                                        <td className="text-right pt-1 text-red-700">
                                          -{peso(loanDetail.deductions.reduce((s, d) => s + Number(d.amount), 0))}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

