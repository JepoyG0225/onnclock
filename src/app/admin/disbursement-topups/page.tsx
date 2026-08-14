'use client'

import { useEffect, useState, useCallback } from 'react'
import { Wallet, CheckCircle, Clock, RefreshCw, AlertCircle } from 'lucide-react'

interface TopUp {
  id: string
  amountPeso: number
  status: string
  confirmedAt: string | null
  createdAt: string
  company: { id: string; name: string; email: string }
}

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  PAID:      { label: 'Awaiting Approval', bg: '#f7f7f7', color: '#343434' },
  CONFIRMED: { label: 'Approved',          bg: '#f0fdf4', color: '#15803d' },
  FAILED:    { label: 'Failed',            bg: '#fef2f2', color: '#b91c1c' },
  EXPIRED:   { label: 'Expired',           bg: '#f7f7f7', color: '#666666' },
  PENDING:   { label: 'Pending Payment',   bg: '#f7f7f7', color: '#666666' },
}

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function DisbursementTopUpsPage() {
  const [topUps, setTopUps]       = useState<TopUp[]>([])
  const [loading, setLoading]     = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [toast, setToast]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/admin/disbursement-topups')
    if (!res.ok) { setError('Failed to load top-ups'); setLoading(false); return }
    const data = await res.json()
    setTopUps(data.topUps)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function approve(id: string, companyName: string, amount: number) {
    setApproving(id)
    const res = await fetch(`/api/admin/disbursement-topups/${id}/approve`, { method: 'POST' })
    const data = await res.json()
    setApproving(null)
    if (!res.ok) {
      setToast(`❌ ${data.error ?? 'Approval failed'}`)
    } else {
      setToast(`✅ Approved ${fmt(amount)} for ${companyName}`)
      load()
    }
    setTimeout(() => setToast(null), 4000)
  }

  const pending   = topUps.filter(t => t.status === 'PAID')
  const history   = topUps.filter(t => t.status !== 'PAID')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-white border rounded-xl shadow-lg px-4 py-3 text-sm font-medium text-gray-800">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
            <Wallet className="w-6 h-6" />
            Wallet Top-Up Approvals
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review and approve disbursement wallet top-ups from companies.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Pending Approvals */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-orange-500" />
          <h2 className="font-semibold text-gray-800">Pending Approval</h2>
          {pending.length > 0 && (
            <span className="ml-1 bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-red-600 py-4">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : pending.length === 0 ? (
          <div className="text-sm text-slate-400 border rounded-xl py-10 text-center bg-white">
            No pending approvals
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(t => (
              <div key={t.id}
                className="bg-white border border-orange-100 rounded-xl p-5 flex items-center gap-4"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: '#f7f7f7' }}>
                  <Wallet className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{t.company.name}</p>
                  <p className="text-xs text-slate-500">{t.company.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Payment received {t.confirmedAt ? fmtDate(t.confirmedAt) : fmtDate(t.createdAt)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold" style={{ color: '#000000' }}>{fmt(t.amountPeso)}</p>
                  <p className="text-xs text-slate-400">Top-up amount</p>
                </div>
                <button
                  onClick={() => approve(t.id, t.company.name, t.amountPeso)}
                  disabled={approving === t.id}
                  className="ml-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                  style={{ background: '#000000' }}
                >
                  {approving === t.id ? 'Approving…' : 'Approve'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-gray-800">History</h2>
        </div>

        {!loading && history.length === 0 ? (
          <div className="text-sm text-slate-400 border rounded-xl py-10 text-center bg-white">
            No history yet
          </div>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Company</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map(t => {
                  const s = STATUS_STYLES[t.status] ?? STATUS_STYLES.PENDING
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{t.company.name}</p>
                        <p className="text-xs text-slate-400">{t.company.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {fmt(t.amountPeso)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {fmtDate(t.createdAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
