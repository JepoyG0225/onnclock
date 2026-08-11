'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Banknote, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { peso } from '@/lib/utils'
import { CashAdvanceDetailDialog } from '@/components/cash-advance/CashAdvanceDetailDialog'
import { RequestRowOpener } from '@/components/ui/request-row-opener'
import { ChevronRight } from 'lucide-react'

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

export function CashAdvanceTab() {
  const [requests,     setRequests]     = useState<Request[]>([])
  const [loading,      setLoading]      = useState(false)
  const [statusFilter, setStatusFilter] = useState<Status | ''>('PENDING')

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

  // Approve/Reject now live inside CashAdvanceDetailDialog. The dialog
  // calls `onActionDone={load}` so the list refreshes after either
  // action without us holding onto per-row state up here.

  const pendingCount  = requests.filter(r => r.status === 'PENDING').length
  const pendingTotal  = requests.filter(r => r.status === 'PENDING')
                                .reduce((s, r) => s + Number(r.amountRequested), 0)
  const approvedTotal = requests.filter(r => r.status === 'APPROVED')
                                .reduce((s, r) => s + Number(r.amountRequested), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#032b63' }}>Cash Advance Requests</h1>
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
      <div className="flex gap-2 flex-wrap" data-tour="ca-status-tabs">
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
                    <th className="w-10 p-3" aria-label="Open details" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => {
                    const monthlyBasic = Number(r.employee.basicSalary)
                    const amt          = Number(r.amountRequested)
                    const pctOfSalary  = monthlyBasic > 0 ? (amt / monthlyBasic) * 100 : 0
                    const monthlyAmort = amt / Math.max(1, r.repaymentMonths)

                    return (
                      <RequestRowOpener
                        key={r.id}
                        renderDialog={(open, onClose) => (
                          <CashAdvanceDetailDialog
                            open={open}
                            onClose={onClose}
                            request={r}
                            isHR
                            onActionDone={load}
                          />
                        )}
                      >
                        <td className="p-3 border-b">
                          <div className="font-medium">{r.employee.lastName}, {r.employee.firstName}</div>
                          <div className="text-xs text-gray-400">
                            {r.employee.employeeNo}
                            {r.employee.department?.name && ` · ${r.employee.department.name}`}
                          </div>
                        </td>
                        <td className="p-3 text-right text-gray-600 border-b">{peso(monthlyBasic)}</td>
                        <td className="p-3 text-right border-b">
                          <div className="font-semibold text-primary">{peso(amt)}</div>
                          <div className="text-xs text-gray-400">{pctOfSalary.toFixed(1)}% of basic</div>
                        </td>
                        <td className="p-3 text-center border-b">
                          <div className="font-medium">{r.repaymentMonths}</div>
                          <div className="text-xs text-gray-400">{peso(monthlyAmort)}/mo</div>
                        </td>
                        <td className="p-3 text-gray-700 max-w-xs truncate border-b" title={r.reason}>{r.reason}</td>
                        <td className="p-3 text-xs text-gray-600 border-b">{format(new Date(r.createdAt), 'MMM d, yyyy')}</td>
                        <td className="p-3 text-center border-b">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                            {STATUS_ICON[r.status]}
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400 border-b">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </RequestRowOpener>
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
