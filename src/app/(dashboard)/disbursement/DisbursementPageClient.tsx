'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  Clock, ExternalLink, Loader2, RefreshCw, Send, Wallet, X, Hourglass,
} from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import Link from 'next/link'
import PayrollDisbursementPanel from '@/components/payroll/PayrollDisbursementPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletData {
  balance: number
  topUps: Array<{ id: string; amountPeso: number; status: string; confirmedAt: string | null; createdAt: string }>
}

interface AvailableRun {
  id: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  status: string
  totalNetPay: number
  employeeCount: number
}

interface DisbursementItem {
  id: string
  employeeName: string
  amount: number
  channel: string
  status: string
  referenceNo: string | null
  failureReason: string | null
}

interface RecentDisbursement {
  id: string
  payrollRunId: string
  periodLabel: string
  totalAmount: number
  status: string
  initiatedAt: string
  completedAt: string | null
  itemCount: number
  items: DisbursementItem[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POLL_MS = 8_000

function fmtPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function disbStatusClass(s: string) {
  return s === 'COMPLETED'  ? 'bg-green-100 text-green-700'
       : s === 'PROCESSING' ? 'bg-blue-100 text-blue-700'
       : s === 'PARTIAL'    ? 'bg-amber-100 text-amber-700'
       : s === 'FAILED'     ? 'bg-red-100 text-red-700'
       : s === 'CANCELLED'  ? 'bg-gray-100 text-gray-500'
       :                      'bg-gray-100 text-gray-600'
}

function runStatusClass(s: string) {
  return s === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
}

// ─── QR Top-up Modal ─────────────────────────────────────────────────────────

function TopUpModal({ onClose, onPaid }: { onClose: () => void; onPaid: () => void }) {
  const [amount,   setAmount]   = useState(5000)
  const [phase,    setPhase]    = useState<'input' | 'loading' | 'qr' | 'expired' | 'failed'>('input')
  const [qrImage,  setQrImage]  = useState('')
  const [timeLeft, setTimeLeft] = useState('')
  const paidAmount = useRef(0)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopAll() {
    if (pollRef.current)  clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }
  useEffect(() => () => stopAll(), [])

  async function generate() {
    if (amount < 100) { toast.error('Minimum top-up is ₱100'); return }
    setPhase('loading')
    try {
      const res  = await fetch('/api/disbursement/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPeso: amount }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to generate QR'); setPhase('input'); return }

      setQrImage(data.qrImage)
      paidAmount.current = data.amountPeso
      const exp = new Date(data.expiresAt)
      setPhase('qr')

      timerRef.current = setInterval(() => {
        const secs = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000))
        setTimeLeft(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)
        if (secs === 0) { stopAll(); setPhase('expired') }
      }, 1000)

      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/disbursement/wallet/status?topUpId=${data.topUpId}`)
        const d = await r.json()
        // PAID = payment received, awaiting Super Admin approval
        if (d.status === 'PAID' || d.status === 'CONFIRMED') {
          stopAll()
          onPaid()   // close modal and show processing state in parent
          onClose()
        } else if (d.status === 'FAILED')  { stopAll(); setPhase('failed') }
        else if  (d.status === 'EXPIRED')  { stopAll(); setPhase('expired') }
      }, POLL_MS)
    } catch { toast.error('Network error'); setPhase('input') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top Up Disbursement Wallet</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        {phase === 'input' && (
          <>
            <p className="text-sm text-gray-500">Scan with GCash or Maya to fund your payroll disbursement wallet.</p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (PHP)</label>
              <Input type="number" min={100} step={100} value={amount} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Top-ups typically arrive within <span className="font-semibold">1–3 banking days</span> after payment.
              </p>
            </div>
            <Button className="w-full" onClick={generate}>Generate QR Code</Button>
          </>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-10 h-10 animate-spin text-[#000000]" />
            <p className="text-sm text-gray-500">Generating QR code…</p>
          </div>
        )}

        {phase === 'qr' && (
          <>
            <div className="flex justify-center">
              <Image src={qrImage} alt="QR" width={220} height={220} className="rounded-lg border" unoptimized />
            </div>
            <p className="text-center text-2xl font-bold">{fmtPHP(amount)}</p>
            <p className="text-center text-xs text-gray-500">GCash · Maya · BPI · BDO · UnionBank</p>
            <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Expires in {timeLeft || '29:00'}</span>
            </div>
            <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                After payment, your top-up will be credited within <span className="font-semibold">1–3 banking days</span>.
              </p>
            </div>
            <p className="text-xs text-center text-gray-400">Waiting for payment confirmation…</p>
          </>
        )}

        {phase === 'expired' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Clock className="w-14 h-14 text-gray-400" />
            <p className="text-lg font-semibold text-gray-700">QR Expired</p>
            <Button variant="outline" onClick={() => setPhase('input')}>Try Again</Button>
          </div>
        )}

        {phase === 'failed' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertCircle className="w-14 h-14 text-red-400" />
            <p className="text-lg font-semibold text-gray-700">Payment Failed</p>
            <Button variant="outline" onClick={() => setPhase('input')}>Try Again</Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisbursementPageClient() {
  const [wallet,          setWallet]          = useState<WalletData | null>(null)
  const [available,       setAvailable]       = useState<AvailableRun[]>([])
  const [recent,          setRecent]          = useState<RecentDisbursement[]>([])
  const [loading,         setLoading]         = useState(true)   // initial load only
  const [refreshing,      setRefreshing]      = useState(false)  // background refresh
  const [showTopUp,       setShowTopUp]       = useState(false)
  const [topUpProcessing, setTopUpProcessing] = useState(false)
  const [activeTab,       setActiveTab]       = useState<'disbursements' | 'topups'>('disbursements')
  const [expandedRun,     setExpandedRun]     = useState<string | null>(null)
  const [expandedRecent,  setExpandedRecent]  = useState<string | null>(null)

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [wRes, aRes, dRes] = await Promise.all([
        // cache: 'no-store' prevents stale browser-cached balance
        fetch('/api/disbursement/wallet',    { cache: 'no-store' }),
        fetch('/api/disbursement/available', { cache: 'no-store' }),
        fetch('/api/disbursement/recent',    { cache: 'no-store' }),
      ])
      if (wRes.ok) setWallet(await wRes.json())
      if (aRes.ok) setAvailable((await aRes.json()).runs ?? [])

      if (dRes.ok) {
        const disbursements: RecentDisbursement[] = (await dRes.json()).disbursements ?? []

        // For any PROCESSING disbursements, call the status endpoint so the
        // server resolves pending PayMongo transfers before we render the list.
        const processing = disbursements.filter(d => d.status === 'PROCESSING')
        if (processing.length > 0) {
          await Promise.allSettled(
            processing.map(d =>
              fetch(`/api/disbursement/${d.payrollRunId}/status`, { cache: 'no-store' }),
            ),
          )
          // Re-fetch recent now that statuses have been updated in the DB
          const dRes2 = await fetch('/api/disbursement/recent', { cache: 'no-store' })
          if (dRes2.ok) {
            const updated: RecentDisbursement[] = (await dRes2.json()).disbursements ?? []
            setRecent(updated)
          } else {
            setRecent(disbursements)
          }
        } else {
          setRecent(disbursements)
        }
      }
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  function toggleRun(runId: string) {
    setExpandedRun(prev => prev === runId ? null : runId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /><span>Loading…</span>
      </div>
    )
  }

  return (
    <>
      {showTopUp && (
        <TopUpModal
          onClose={() => setShowTopUp(false)}
          onPaid={() => { setTopUpProcessing(true); void loadData(true) }}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Disbursement</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Send net pay directly to employee bank accounts via InstaPay or PesoNet.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Top-up processing banner */}
        {topUpProcessing && (
          <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <Hourglass className="w-5 h-5 text-blue-500 shrink-0 animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Payment Received — Processing</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Your top-up is being processed and will be credited to your wallet within <span className="font-semibold">1–3 banking days</span>.
                </p>
              </div>
            </div>
            <button onClick={() => setTopUpProcessing(false)} className="text-blue-400 hover:text-blue-600 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Notice */}
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">Transfer times:</span> InstaPay (≤ ₱50,000) is real-time.
            PesoNet (&gt; ₱50,000) may take up to <span className="font-semibold">3 banking days</span>.
            Top-ups above ₱50,000 may also take <span className="font-semibold">1–3 banking days</span> to reflect.
          </p>
        </div>

        {/* Wallet */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#dce5f7] rounded-xl">
                  <Wallet className="w-6 h-6 text-[#000000]" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Disbursement Wallet Balance</p>
                  <p className="text-3xl font-bold text-[#000000] mt-0.5 flex items-center gap-2">
                    {wallet ? fmtPHP(wallet.balance) : '—'}
                    {refreshing && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Top up using GCash or Maya QR</p>
                </div>
              </div>
              <Button size="lg" onClick={() => setShowTopUp(true)}>
                Top Up Wallet
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Available for disbursement */}
        <Card>
          <CardHeader>
            <CardTitle data-tour="db-balance" className="text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-[#000000]" />
              Available for Disbursement
              {available.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#000000] text-white text-[10px] font-bold">
                  {available.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {available.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">
                No approved payroll runs pending disbursement.
              </p>
            ) : (
              <div className="divide-y">
                {available.map(run => (
                  <div key={run.id}>
                    <button
                      type="button"
                      onClick={() => toggleRun(run.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{run.periodLabel}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {run.employeeCount} employee{run.employeeCount !== 1 ? 's' : ''} · Net pay {fmtPHP(run.totalNetPay)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4 shrink-0">
                        <Badge className={`text-[11px] border-0 ${runStatusClass(run.status)}`}>
                          {run.status}
                        </Badge>
                        <Link
                          href={`/payroll/${run.id}`}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#000000] hover:underline"
                        >
                          View run <ExternalLink className="w-3 h-3" />
                        </Link>
                        {expandedRun === run.id
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                        }
                      </div>
                    </button>

                    {expandedRun === run.id && (
                      <div className="px-4 pb-4 bg-gray-50 border-t">
                        <div className="pt-4">
                          <PayrollDisbursementPanel
                            runId={run.id}
                            onDisbursed={() => { void loadData(true); setExpandedRun(null) }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent disbursements + Top-up history (tabbed) */}
        <Card>
          {/* Tab bar */}
          <div className="flex items-center border-b px-4">
            <button
              type="button"
              onClick={() => setActiveTab('disbursements')}
              className={`flex items-center gap-1.5 py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'disbursements'
                  ? 'border-[#000000] text-[#000000]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              Disbursements
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('topups')}
              className={`flex items-center gap-1.5 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'topups'
                  ? 'border-[#000000] text-[#000000]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              Top-up History
              {wallet && wallet.topUps.filter(t => t.status === 'PAID').length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
                  {wallet.topUps.filter(t => t.status === 'PAID').length}
                </span>
              )}
            </button>
          </div>

          <CardContent className="p-0">
            {/* Disbursements tab */}
            {activeTab === 'disbursements' && (
              recent.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">No disbursements yet.</p>
              ) : (
                <div className="divide-y">
                  {recent.map(d => {
                    const isExpanded = expandedRecent === d.id
                    return (
                      <div key={d.id}>
                        {/* Summary row — click to expand */}
                        <button
                          type="button"
                          onClick={() => setExpandedRecent(prev => prev === d.id ? null : d.id)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 truncate">{d.periodLabel}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {d.itemCount} employee{d.itemCount !== 1 ? 's' : ''} · {fmtPHP(d.totalAmount)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-4 shrink-0">
                            <span className="text-xs text-gray-400 hidden sm:block">
                              {new Date(d.initiatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <Badge className={`text-[11px] border-0 ${disbStatusClass(d.status)}`}>{d.status}</Badge>
                            <Link
                              href={`/payroll/${d.payrollRunId}`}
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#000000] hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4 text-gray-400" />
                              : <ChevronDown className="w-4 h-4 text-gray-400" />
                            }
                          </div>
                        </button>

                        {/* Employee breakdown */}
                        {isExpanded && (
                          <div className="border-t bg-gray-50 px-4 pb-3">
                            <table className="w-full text-xs mt-3">
                              <thead>
                                <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-200">
                                  <th className="text-left py-2 font-semibold">Employee</th>
                                  <th className="text-center py-2 font-semibold">Channel</th>
                                  <th className="text-right py-2 font-semibold">Amount</th>
                                  <th className="text-center py-2 font-semibold">Status</th>
                                  <th className="text-left py-2 font-semibold pl-3">Reference</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {d.items.map(item => (
                                  <tr key={item.id} className="hover:bg-white transition-colors">
                                    <td className="py-2 text-gray-800 font-medium">{item.employeeName}</td>
                                    <td className="py-2 text-center">
                                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase text-[10px] font-semibold">
                                        {item.channel}
                                      </span>
                                    </td>
                                    <td className="py-2 text-right font-semibold text-gray-900">{fmtPHP(item.amount)}</td>
                                    <td className="py-2 text-center">
                                      <Badge className={`text-[10px] border-0 ${disbStatusClass(item.status)}`}>
                                        {item.status}
                                      </Badge>
                                    </td>
                                    <td className="py-2 pl-3 text-gray-500 font-mono">
                                      {item.referenceNo
                                        ? item.referenceNo
                                        : item.failureReason
                                        ? <span className="text-red-500 font-sans font-normal">{item.failureReason}</span>
                                        : <span className="text-gray-300">—</span>
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* Top-up history tab */}
            {activeTab === 'topups' && (
              !wallet || wallet.topUps.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">No top-up history yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                      <th className="text-left px-4 py-3">Amount</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-right px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.topUps.map(t => {
                      const isPending = t.status === 'PAID'
                      const isConfirmed = t.status === 'CONFIRMED'
                      return (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold text-gray-900">{fmtPHP(t.amountPeso)}</td>
                          <td className="px-4 py-3">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">
                                <Hourglass className="w-3 h-3" />
                                Processing
                              </span>
                            ) : isConfirmed ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                                <CheckCircle2 className="w-3 h-3" />
                                Credited
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{t.status}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">
                            {new Date(t.confirmedAt ?? t.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
