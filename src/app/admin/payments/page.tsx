'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Receipt, Loader2, CheckCircle, XCircle, Clock, ExternalLink, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

type InvoiceStatus = 'DRAFT' | 'UNPAID' | 'PAID' | 'VOID'
type FilterTab = 'ALL' | 'UNPAID' | 'PAID' | 'VOID'

interface SubmittedPayment {
  id: string
  invoiceNo: string
  company: { id: string; name: string; email: string | null }
  status: InvoiceStatus
  total: number
  paymentMethodLabel: string | null
  createdAt: string
  paidAt: string | null
  proofOfPaymentDataUrl: string | null
  proofUploadedAt: string | null
  manualEntry?: boolean
  adminNotes?: string | null
}

interface Company {
  id: string
  name: string
  email: string | null
}

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_BADGE: Record<InvoiceStatus, { label: string; className: string; icon: React.ReactNode }> = {
  DRAFT:  { label: 'Draft',  className: 'bg-slate-700/50 text-slate-400 border-slate-600',       icon: <Clock className="w-3 h-3" /> },
  UNPAID: { label: 'Unpaid', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20',    icon: <Clock className="w-3 h-3" /> },
  PAID:   { label: 'Paid',   className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', icon: <CheckCircle className="w-3 h-3" /> },
  VOID:   { label: 'Void',   className: 'bg-red-500/10 text-red-400 border-red-500/20',          icon: <XCircle className="w-3 h-3" /> },
}

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: 'ALL',    label: 'All' },
  { key: 'UNPAID', label: 'Unpaid' },
  { key: 'PAID',   label: 'Paid' },
  { key: 'VOID',   label: 'Void' },
]

const PAYMENT_METHODS = ['GCash', 'Bank Transfer', 'Maya', 'Cash', 'Check', 'Other']

export default function AdminPaymentsPage() {
  const [payments, setPayments]         = useState<SubmittedPayment[]>([])
  const [companies, setCompanies]       = useState<Company[]>([])
  const [loading, setLoading]           = useState(true)
  const [updatingId, setUpdatingId]     = useState<string | null>(null)
  const [filter, setFilter]             = useState<FilterTab>('UNPAID')
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null)
  const [showRecord, setShowRecord]     = useState(false)
  const [recording, setRecording]       = useState(false)

  // Record payment form state
  const [rCompanyId, setRCompanyId]     = useState('')
  const [rAmount, setRAmount]           = useState('')
  const [rMethod, setRMethod]           = useState('GCash')
  const [rNotes, setRNotes]             = useState('')
  const [rStatus, setRStatus]           = useState<'PAID' | 'UNPAID'>('PAID')
  const [rProofDataUrl, setRProofDataUrl] = useState<string | null>(null)
  const [rProofName, setRProofName]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [payRes, coRes] = await Promise.all([
        fetch('/api/admin/payments'),
        fetch('/api/admin/companies'),
      ])
      if (!payRes.ok) throw new Error('Access denied')
      const payData = await payRes.json()
      setPayments(payData.payments ?? [])
      if (coRes.ok) {
        const coData = await coRes.json()
        setCompanies((coData.companies ?? []).map((c: Company) => ({ id: c.id, name: c.name, email: c.email })))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  async function handleRecord() {
    if (!rCompanyId || !rAmount) { toast.error('Select a company and enter an amount'); return }
    setRecording(true)
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: rCompanyId,
          amount: Number(rAmount),
          paymentMethodLabel: rMethod,
          notes: rNotes || null,
          status: rStatus,
          proofOfPaymentDataUrl: rProofDataUrl ?? null,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Failed') }
      toast.success('Payment recorded')
      setShowRecord(false)
      setRCompanyId(''); setRAmount(''); setRMethod('GCash'); setRNotes('')
      setRStatus('PAID'); setRProofDataUrl(null); setRProofName(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment')
    } finally {
      setRecording(false)
    }
  }

  async function updateStatus(id: string, status: 'PAID' | 'UNPAID' | 'VOID') {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setPayments(prev => prev.map(p =>
        p.id === id ? { ...p, status, paidAt: status === 'PAID' ? new Date().toISOString() : null } : p
      ))
      toast.success(`Marked as ${status.toLowerCase()}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setUpdatingId(null)
    }
  }

  const summary = useMemo(() => ({
    total:   payments.length,
    unpaid:  payments.filter(p => p.status === 'UNPAID').length,
    paid:    payments.filter(p => p.status === 'PAID').length,
    revenue: payments.filter(p => p.status === 'PAID').reduce((s, p) => s + p.total, 0),
  }), [payments])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return payments
    return payments.filter(p => p.status === filter)
  }, [payments, filter])

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#C0C8CA]/70 font-semibold">System Admin</p>
          <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-[#C0C8CA]" /> Payments
          </h1>
          <p className="text-sm text-slate-400 mt-1">Review payment submissions and invoice tracking</p>
        </div>
        <button
          onClick={() => setShowRecord(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> Record Payment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices',    value: summary.total,       color: 'text-slate-100' },
          { label: 'Pending Review',    value: summary.unpaid,      color: 'text-amber-300' },
          { label: 'Confirmed Paid',    value: summary.paid,        color: 'text-emerald-300' },
          { label: 'Revenue Collected', value: fmt(summary.revenue), color: 'text-[#C0C8CA]' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1 p-1 rounded-xl border border-slate-800 bg-slate-900 w-fit">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key ? 'bg-[#2E4156] text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {f.label}
            {f.key === 'UNPAID' && summary.unpaid > 0 && (
              <span className="ml-1.5 bg-amber-500/20 text-amber-300 text-[10px] px-1.5 rounded-full">{summary.unpaid}</span>
            )}
          </button>
        ))}
      </div>

      {/* Payment list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#C0C8CA]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-slate-500 text-sm">
          No {filter !== 'ALL' ? filter.toLowerCase() : ''} payments found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(payment => {
            const badge = STATUS_BADGE[payment.status]
            return (
              <div key={payment.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Proof thumbnail */}
                  {payment.proofOfPaymentDataUrl ? (
                    <button
                      onClick={() => setPreviewUrl(payment.proofOfPaymentDataUrl)}
                      className="flex-shrink-0 w-20 h-20 rounded-xl border border-slate-700 overflow-hidden bg-slate-950 hover:border-[#2E4156]/50 transition-colors relative group"
                    >
                      <img src={payment.proofOfPaymentDataUrl} alt="Proof" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ExternalLink className="w-4 h-4 text-white" />
                      </div>
                    </button>
                  ) : (
                    <div className="flex-shrink-0 w-20 h-20 rounded-xl border border-slate-700 bg-slate-950 flex flex-col items-center justify-center gap-1 text-slate-500">
                      <Receipt className="w-5 h-5" />
                      <span className="text-[10px] font-semibold">{payment.manualEntry ? 'Manual' : 'No proof'}</span>
                    </div>
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-bold text-slate-100">{payment.invoiceNo}</p>
                        <p className="text-sm text-slate-400">{payment.company.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{payment.company.email ?? '—'}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badge.className}`}>
                        {badge.icon} {badge.label}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                      <span>Amount: <span className="text-slate-200 font-semibold">{fmt(payment.total)}</span></span>
                      {payment.paymentMethodLabel && (
                        <span>Method: <span className="text-slate-300">{payment.paymentMethodLabel}</span></span>
                      )}
                      <span>Submitted: <span className="text-slate-300">{format(new Date(payment.createdAt), 'MMM dd, yyyy h:mm a')}</span></span>
                      {payment.proofUploadedAt && (
                        <span>Proof: <span className="text-slate-300">{format(new Date(payment.proofUploadedAt), 'MMM dd, yyyy h:mm a')}</span></span>
                      )}
                      {payment.paidAt && (
                        <span>Paid at: <span className="text-emerald-300">{format(new Date(payment.paidAt), 'MMM dd, yyyy h:mm a')}</span></span>
                      )}
                      {payment.manualEntry && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 text-[10px] font-semibold border border-sky-500/20">
                          Manual entry
                        </span>
                      )}
                    </div>
                    {payment.adminNotes && (
                      <p className="mt-2 text-xs text-slate-400 italic">Notes: {payment.adminNotes}</p>
                    )}

                    {/* Actions */}
                    {payment.status !== 'VOID' && (
                      <div className="mt-4 flex gap-2">
                        {payment.status !== 'PAID' && (
                          <button
                            onClick={() => updateStatus(payment.id, 'PAID')}
                            disabled={updatingId === payment.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
                          >
                            {updatingId === payment.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            Mark Paid
                          </button>
                        )}
                        {payment.status === 'PAID' && (
                          <button
                            onClick={() => updateStatus(payment.id, 'UNPAID')}
                            disabled={updatingId === payment.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold disabled:opacity-60 transition-colors"
                          >
                            Revert to Unpaid
                          </button>
                        )}
                        <button
                          onClick={() => updateStatus(payment.id, 'VOID')}
                          disabled={updatingId === payment.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-semibold disabled:opacity-60 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Void
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Proof lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img src={previewUrl} alt="Proof of payment" className="w-full rounded-2xl border border-slate-700 shadow-2xl" />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Record Payment modal */}
      {showRecord && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Record Payment</h2>
              <button onClick={() => setShowRecord(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Company */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Company *</label>
                <select
                  value={rCompanyId}
                  onChange={e => setRCompanyId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select company…</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Amount (₱) *</label>
                <input
                  type="number"
                  min={0}
                  value={rAmount}
                  onChange={e => setRAmount(e.target.value)}
                  placeholder="e.g. 850.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-600"
                />
              </div>

              {/* Payment method */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Payment Method</label>
                <select
                  value={rMethod}
                  onChange={e => setRMethod(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Status</label>
                <div className="flex gap-2">
                  {(['PAID', 'UNPAID'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setRStatus(s)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                        rStatus === s
                          ? s === 'PAID'
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-amber-600 border-amber-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Proof upload */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Proof of Payment (optional)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const dataUrl = await fileToDataUrl(file)
                    setRProofDataUrl(dataUrl)
                    setRProofName(file.name)
                  }}
                  className="block w-full text-xs text-slate-400 file:mr-2 file:rounded-lg file:border file:border-slate-600 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-300 cursor-pointer"
                />
                {rProofName && <p className="text-xs text-slate-500 mt-1">Selected: {rProofName}</p>}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Admin Notes (optional)</label>
                <textarea
                  value={rNotes}
                  onChange={e => setRNotes(e.target.value)}
                  placeholder="e.g. GCash ref #1234567890"
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-600 resize-none"
                />
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowRecord(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRecord}
                disabled={recording || !rCompanyId || !rAmount}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {recording ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {recording ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
