'use client'

import { useState } from 'react'
import { Wallet, Calendar, FileText, User, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RequestDetailDialog, DetailRow } from '@/components/ui/request-detail-dialog'

export interface CashAdvanceDetailDialogProps {
  open: boolean
  onClose: () => void
  request: {
    id: string
    amountRequested: number
    reason: string
    repaymentMonths: number
    status: string
    rejectionReason: string | null
    approvedAt: string | null
    createdAt: string
    employee: {
      firstName: string
      lastName: string
      employeeNo: string
      basicSalary: number
      department?: { name: string } | null
    }
    loan?: { balance: number; status: string; monthlyAmortization: number } | null
  }
  isHR: boolean
  /** Triggered when an approval/rejection succeeds — caller refetches. */
  onActionDone?: () => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function peso(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

export function CashAdvanceDetailDialog({ open, onClose, request, isHR, onActionDone }: CashAdvanceDetailDialogProps) {
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const employeeName = `${request.employee.firstName} ${request.employee.lastName}`
  const department = request.employee.department?.name || 'Employee'
  const amount = Number(request.amountRequested)
  const basicSalary = Number(request.employee.basicSalary)
  const monthlyAmort = amount / Math.max(1, request.repaymentMonths)
  const monthlyBasic = basicSalary / 2 // semi-monthly basic
  const amortPct = monthlyBasic > 0 ? (monthlyAmort / monthlyBasic) * 100 : 0

  async function doApprove() {
    setActing('approve')
    try {
      const res = await fetch(`/api/cash-advance/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to approve')
      }
      toast.success('Cash advance approved — loan created')
      onActionDone?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setActing(null)
    }
  }

  async function doReject() {
    setActing('reject')
    try {
      const res = await fetch(`/api/cash-advance/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT', rejectionReason: rejectReason || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to reject')
      }
      toast.success('Cash advance rejected')
      onActionDone?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setActing(null)
    }
  }

  return (
    <RequestDetailDialog
      open={open}
      onClose={onClose}
      type="CASH_ADVANCE"
      id={request.id}
      title={`${employeeName} — ${peso(amount)}`}
      subtitle={`${department} · #${request.employee.employeeNo}`}
      status={request.status}
      detailsSlot={
        <>
          <DetailRow
            icon={<Wallet className="h-4 w-4" />}
            label="Amount Requested"
            value={<span className="text-base font-bold">{peso(amount)}</span>}
            hint={`Repayable over ${request.repaymentMonths} month${request.repaymentMonths === 1 ? '' : 's'}`}
          />
          <DetailRow
            icon={<TrendingDown className="h-4 w-4" />}
            label="Monthly Deduction"
            value={peso(monthlyAmort)}
            hint={`${amortPct.toFixed(1)}% of semi-monthly basic`}
          />
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Filed By"
            value={employeeName}
            hint={`${department} · Submitted ${formatDate(request.createdAt)}`}
            className="sm:col-span-2"
          />
          <DetailRow
            icon={<FileText className="h-4 w-4" />}
            label="Reason"
            value={
              <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                {request.reason}
              </p>
            }
            className="sm:col-span-2"
          />
          {request.status === 'APPROVED' && request.loan && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Linked Loan
              </p>
              <div className="mt-1 grid grid-cols-1 gap-1 text-sm text-emerald-900 sm:grid-cols-3">
                <p>Balance: <strong>{peso(Number(request.loan.balance))}</strong></p>
                <p>Monthly: <strong>{peso(Number(request.loan.monthlyAmortization))}</strong></p>
                <p>Status: <strong>{request.loan.status}</strong></p>
              </div>
            </div>
          )}
          {request.status === 'REJECTED' && request.rejectionReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Rejection Reason
              </p>
              <p className="mt-1 text-sm italic text-rose-900">{request.rejectionReason}</p>
            </div>
          )}
          {rejectMode && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-rose-700">
                Rejection reason (optional)
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why this is being rejected…"
                className="mt-2 w-full rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          )}
        </>
      }
      actionsSlot={
        isHR && request.status === 'PENDING'
          ? (
              <>
                {!rejectMode ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRejectMode(true)}
                      disabled={!!acting}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={doApprove}
                      disabled={!!acting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {acting === 'approve' ? 'Approving…' : 'Approve'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setRejectMode(false); setRejectReason('') }} disabled={!!acting}>
                      Cancel reject
                    </Button>
                    <Button size="sm" variant="destructive" onClick={doReject} disabled={!!acting}>
                      {acting === 'reject' ? 'Rejecting…' : 'Confirm reject'}
                    </Button>
                  </>
                )}
              </>
            )
          : undefined
      }
    />
  )
}
