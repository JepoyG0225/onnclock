'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Banknote, Plus, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

interface CARequest {
  id: string
  amountRequested: number
  reason: string
  repaymentMonths: number
  status: Status
  rejectionReason: string | null
  approvedAt: string | null
  createdAt: string
  loan?: { id: string; balance: number; monthlyAmortization: number; status: string } | null
}

function peso(n: number) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { cls: string; icon: React.ReactNode }> = {
    PENDING:   { cls: 'bg-amber-50 text-amber-700 border-amber-200',   icon: <Clock className="w-3 h-3" /> },
    APPROVED:  { cls: 'bg-green-50 text-green-700 border-green-200',   icon: <CheckCircle2 className="w-3 h-3" /> },
    REJECTED:  { cls: 'bg-red-50 text-red-700 border-red-200',         icon: <XCircle className="w-3 h-3" /> },
    CANCELLED: { cls: 'bg-gray-50 text-gray-500 border-gray-200',      icon: <Ban className="w-3 h-3" /> },
  }
  const { cls, icon } = map[status]
  return <Badge className={`${cls} inline-flex items-center gap-1`}>{icon}{status}</Badge>
}

export default function PortalCashAdvancePage() {
  const [requests,     setRequests]     = useState<CARequest[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [monthlyBasic, setMonthlyBasic] = useState<number | null>(null)
  const [form, setForm] = useState({
    amount: '',
    reason: '',
    repaymentMonths: 1,
  })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [okMsg,    setOkMsg]    = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [reqRes, meRes] = await Promise.all([
        fetch('/api/cash-advance?own=true&limit=50'),
        fetch('/api/employees/me'),
      ])
      const reqData = await reqRes.json().catch(() => ({}))
      const meData  = await meRes.json().catch(() => ({}))
      setRequests(reqData.requests ?? [])
      const basic = meData?.basicSalary ?? meData?.employee?.basicSalary ?? null
      if (basic != null) setMonthlyBasic(Number(basic))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function submit() {
    setErrorMsg(null)
    setOkMsg(null)
    const amt = Number(form.amount)
    if (!amt || amt <= 0) { setErrorMsg('Please enter a valid amount'); return }
    if (!form.reason.trim() || form.reason.trim().length < 3) { setErrorMsg('Please tell us why you need this'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/cash-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountRequested: amt,
          reason: form.reason.trim(),
          repaymentMonths: form.repaymentMonths,
        }),
      })
      if (res.ok) {
        setOkMsg('Request submitted — HR will review shortly.')
        setForm({ amount: '', reason: '', repaymentMonths: 1 })
        setShowForm(false)
        load()
      } else {
        const err = await res.json().catch(() => ({}))
        setErrorMsg(err?.error ?? 'Failed to submit request')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const maxAllowed = monthlyBasic != null ? Math.floor(monthlyBasic * 0.3) : null
  const hasPending = requests.some(r => r.status === 'PENDING')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Advance</h1>
          <p className="text-gray-500 text-sm mt-1">Request an advance against your salary — repaid via payroll</p>
        </div>
        {!showForm && !hasPending && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: '#fa5e01' }}
          >
            <Plus className="w-4 h-4" /> Request
          </button>
        )}
      </div>

      {okMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2">{okMsg}</div>
      )}
      {hasPending && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          You have a pending request. Please wait for HR review before filing another.
        </div>
      )}

      {/* New request form */}
      {showForm && (
        <div className="border rounded-xl p-5 space-y-4 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-[#fa5e01]" />
            <h2 className="font-semibold text-gray-900">New Cash Advance Request</h2>
          </div>

          {maxAllowed != null && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              You may request up to <span className="font-semibold text-gray-800">{peso(maxAllowed)}</span> (30% of your monthly basic salary).
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Amount Requested</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#fa5e01' } as React.CSSProperties}
              placeholder="e.g. 5000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Reason</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#fa5e01' } as React.CSSProperties}
              placeholder="Short explanation"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Repay Over</label>
            <div className="inline-flex rounded-lg border overflow-hidden">
              {[1, 2, 3].map(m => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setForm(f => ({ ...f, repaymentMonths: m }))}
                  className={`px-4 py-1.5 text-sm transition-colors ${
                    form.repaymentMonths === m ? 'bg-[#2E4156] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {m} {m === 1 ? 'month' : 'months'}
                </button>
              ))}
            </div>
            {form.amount && (
              <p className="text-xs text-gray-400 mt-2">
                ≈ {peso(Number(form.amount) / form.repaymentMonths)} deducted per month
              </p>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#fa5e01' }}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setErrorMsg(null) }}
              className="px-4 py-2 rounded-lg text-sm font-medium border bg-white text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Requests</h2>
        {loading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center border rounded-lg bg-white">
            <FileTextIcon /> You haven&apos;t filed any cash advance requests yet.
          </div>
        ) : (
          requests.map(r => (
            <div key={r.id} className="border rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{peso(Number(r.amountRequested))}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {format(new Date(r.createdAt), 'MMM d, yyyy')} · Repay over {r.repaymentMonths} {r.repaymentMonths === 1 ? 'month' : 'months'}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500 shrink-0">
                  {r.status === 'APPROVED' && r.loan && (
                    <div>
                      <div>Balance</div>
                      <div className="font-semibold text-red-600">{peso(Number(r.loan.balance))}</div>
                    </div>
                  )}
                </div>
              </div>
              {r.reason && (
                <p className="text-sm text-gray-700 mt-2 italic">&ldquo;{r.reason}&rdquo;</p>
              )}
              {r.status === 'REJECTED' && r.rejectionReason && (
                <p className="text-xs text-red-600 mt-2">Reason: {r.rejectionReason}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function FileTextIcon() {
  return <Banknote className="w-6 h-6 mx-auto mb-2 text-gray-300" />
}
