'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Banknote, Check, X, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { peso } from '@/lib/utils'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

interface Request {
  id: string
  amountRequested: number
  reason: string
  repaymentMonths: number
  status: Status
  approvedAt: string | null
  rejectionReason: string | null
  linkedLoanId: string | null
  createdAt: string
  employee: {
    id: string
    firstName: string
    lastName: string
    employeeNo: string
    basicSalary: number
    department?: { name: string } | null
  }
  loan?: { id: string; balance: number; status: string; monthlyAmortization: number } | null
}

const STATUS_BADGE: Record<Status, string> = {
  PENDING:   'bg-amber-100 text-amber-800',
  APPROVED:  'bg-green-100 text-green-800',
  REJECTED:  'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

const STATUS_ICON: Record<Status, React.ReactNode> = {
  PENDING:   <Clock className="w-3.5 h-3.5" />,
  APPROVED:  <CheckCircle2 className="w-3.5 h-3.5" />,
  REJECTED:  <XCircle className="w-3.5 h-3.5" />,
  CANCELLED: <Ban className="w-3.5 h-3.5" />,
}

export default function CashAdvancePage() {
  const [requests,     setRequests]     = useState<Request[]>([])
  const [loading,      setLoading]      = useState(false)
  const [statusFilter, setStatusFilter] = useState<Status | ''>('PENDING')
  const [rejectingId,  setRejectingId]  = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function load() {
    setLoading(true)
    try {
      const qs  = statusFilter ? `?status=${statusFilter}&limit=200` : '?limit=200'
      const res = await fetch(`/api/cash-advance${qs}`)
      const data = await res.json().catch(() => ({}))
      setRequests(data.requests ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter])

  async function approve(id: string) {
    if (!confirm('Approve this cash advance? An EmployeeLoan will be created so payroll automatically deducts it.')) return
    const res = await fetch(`/api/cash-advance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'APPROVE' }),
    })
    if (res.ok) {
      toast.success('Cash advance approved — deduction scheduled for next payroll')
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err?.error ?? 'Failed to approve')
    }
  }

  async function reject(id: string) {
    const res = await fetch(`/api/cash-advance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REJECT', rejectionReason: rejectReason || null }),
    })
    if (res.ok) {
      toast.success('Request rejected')
      setRejectingId(null)
      setRejectReason('')
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err?.error ?? 'Failed to reject')
    }
  }

  const pendingCount  = requests.filter(r => r.status === 'PENDING').length
  const pendingTotal  = requests.filter(r => r.status === 'PENDING')
                                .reduce((s, r) => s + Number(r.amountRequested), 0)
  const approvedTotal = requests.filter(r => r.status === 'APPROVED')
                                .reduce((s, r) => s + Number(r.amountRequested), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Cash Advance Requests</h1>
          <p className="text-slate-500 text-sm mt-1">
            Review employee cash advance requests. Approving creates a loan that gets deducted automatically from payroll.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Pending Amount</p>
            <p className="text-xl font-bold text-amber-700">{peso(pendingTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Approved (in view)</p>
            <p className="text-xl font-bold text-green-700">{peso(approvedTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {([
          { val: 'PENDING',   label: 'Pending' },
          { val: 'APPROVED',  label: 'Approved' },
          { val: 'REJECTED',  label: 'Rejected' },
          { val: 'CANCELLED', label: 'Cancelled' },
          { val: '',          label: 'All' },
        ] as { val: Status | ''; label: string }[]).map(({ val, label }) => (
          <Button
            key={val || 'all'}
            variant={statusFilter === val ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(val)}
            style={statusFilter === val ? { background: '#2E4156' } : {}}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            Cash Advance Requests
            <Badge variant="outline">{requests.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><AppSpinner size="md" /></div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No requests found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Employee</th>
                    <th className="text-right p-3 font-medium text-gray-600">Monthly Basic</th>
                    <th className="text-right p-3 font-medium text-gray-600">Amount</th>
                    <th className="text-center p-3 font-medium text-gray-600">Repay (mos)</th>
                    <th className="text-left p-3 font-medium text-gray-600">Reason</th>
                    <th className="text-left p-3 font-medium text-gray-600">Filed</th>
                    <th className="text-center p-3 font-medium text-gray-600">Status</th>
                    <th className="text-center p-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => {
                    const monthlyBasic = Number(r.employee.basicSalary)
                    const amt          = Number(r.amountRequested)
                    const pctOfSalary  = monthlyBasic > 0 ? (amt / monthlyBasic) * 100 : 0
                    const monthlyAmort = amt / Math.max(1, r.repaymentMonths)

                    return (
                      <>
                        <tr key={r.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            <div className="font-medium">{r.employee.lastName}, {r.employee.firstName}</div>
                            <div className="text-xs text-gray-400">
                              {r.employee.employeeNo}
                              {r.employee.department?.name && ` · ${r.employee.department.name}`}
                            </div>
                          </td>
                          <td className="p-3 text-right text-gray-600">{peso(monthlyBasic)}</td>
                          <td className="p-3 text-right">
                            <div className="font-semibold text-[#1A2D42]">{peso(amt)}</div>
                            <div className="text-xs text-gray-400">{pctOfSalary.toFixed(1)}% of basic</div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="font-medium">{r.repaymentMonths}</div>
                            <div className="text-xs text-gray-400">{peso(monthlyAmort)}/mo</div>
                          </td>
                          <td className="p-3 text-gray-700 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                          <td className="p-3 text-xs text-gray-600">{format(new Date(r.createdAt), 'MMM d, yyyy')}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                              {STATUS_ICON[r.status]}
                              {r.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {r.status === 'PENDING' ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  style={{ background: '#16a34a' }}
                                  onClick={() => approve(r.id)}
                                >
                                  <Check className="w-3.5 h-3.5 mr-1" />Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-red-600 hover:bg-red-50"
                                  onClick={() => setRejectingId(rejectingId === r.id ? null : r.id)}
                                >
                                  <X className="w-3.5 h-3.5 mr-1" />Reject
                                </Button>
                              </div>
                            ) : r.status === 'APPROVED' && r.loan ? (
                              <div className="text-xs text-gray-600">
                                <div>Balance: <span className="font-medium text-red-600">{peso(Number(r.loan.balance))}</span></div>
                                <div>Loan: {r.loan.status}</div>
                              </div>
                            ) : r.status === 'REJECTED' && r.rejectionReason ? (
                              <div className="text-xs text-gray-500 max-w-xs italic">{r.rejectionReason}</div>
                            ) : null}
                          </td>
                        </tr>

                        {rejectingId === r.id && (
                          <tr key={`${r.id}-reject`} className="bg-red-50 border-b">
                            <td colSpan={8} className="p-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Reason for rejection (optional)"
                                  className="flex-1 border rounded px-3 py-1.5 text-sm"
                                />
                                <Button size="sm" variant="destructive" onClick={() => reject(r.id)}>
                                  Confirm Reject
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setRejectingId(null); setRejectReason('') }}
                                >
                                  Cancel
                                </Button>
                              </div>
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
