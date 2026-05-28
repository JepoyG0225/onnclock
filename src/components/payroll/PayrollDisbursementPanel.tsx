'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle, BadgeCheck, CheckCircle2, ChevronDown,
  ChevronUp, Clock, Loader2, RefreshCw, Send, Wallet, X,
} from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DisbursementItem {
  payslipId: string
  employeeId: string
  employeeName: string
  bankName: string | null
  bankAccountNo: string | null
  bankBic: string | null
  amount: number
  channel: 'instapay' | 'pesonet'
  hasBankDetails: boolean
  status: string | null
  referenceNo: string | null
}

interface DisbursementPreview {
  run: { id: string; periodLabel: string; status: string; totalNetPay: number }
  wallet: { balance: number; sufficient: boolean; needed: number; shortfall: number }
  summary: {
    totalEmployees: number
    readyCount: number
    missingBankDetails: number
    totalAmount: number
    instapayCount: number
    pesonetCount: number
  }
  items: DisbursementItem[]
  disbursement: {
    id: string
    status: string
    batchTransferId: string | null
    initiatedAt: string
    completedAt: string | null
    totalAmount: number
  } | null
}

interface StatusItem {
  payslipId: string
  employeeName: string
  amount: number
  channel: string
  status: string
  referenceNo: string | null
  failureReason: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 8_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string | null) {
  if (!status) return null
  const map: Record<string, string> = {
    COMPLETED:  'bg-green-100 text-green-700',
    PROCESSING: 'bg-blue-100 text-blue-700',
    PENDING:    'bg-gray-100 text-gray-600',
    FAILED:     'bg-red-100 text-red-700',
    SKIPPED:    'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function fmtPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Top-up QR modal ─────────────────────────────────────────────────────────

function TopUpModal({ onClose, onConfirmed }: { onClose: () => void; onConfirmed: (amount: number) => void }) {
  const [amount,   setAmount]   = useState(5000)
  const [phase,    setPhase]    = useState<'input' | 'loading' | 'qr' | 'success' | 'expired' | 'failed'>('input')
  const [qrImage,  setQrImage]  = useState('')
  const [timeLeft, setTimeLeft] = useState('')
  const confirmedAmount = useRef(0)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current)  clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  async function generateQR() {
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
      confirmedAmount.current = data.amountPeso
      const exp = new Date(data.expiresAt)
      setPhase('qr')

      timerRef.current = setInterval(() => {
        const secs = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000))
        setTimeLeft(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)
        if (secs === 0) { stopPolling(); setPhase('expired') }
      }, 1000)

      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/disbursement/wallet/status?topUpId=${data.topUpId}`)
        const d = await r.json()
        if      (d.status === 'CONFIRMED') { stopPolling(); setPhase('success') }
        else if (d.status === 'FAILED')    { stopPolling(); setPhase('failed') }
        else if (d.status === 'EXPIRED')   { stopPolling(); setPhase('expired') }
      }, POLL_MS)
    } catch { toast.error('Network error'); setPhase('input') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top Up Disbursement Wallet</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {phase === 'input' && (
          <>
            <p className="text-sm text-gray-500">Scan with GCash or Maya to fund your payroll disbursement wallet.</p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (PHP)</label>
              <Input type="number" min={100} step={100} value={amount} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            {amount > 50_000 && (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Top-ups above ₱50,000 are processed via PesoNet and may take <span className="font-semibold">1–3 banking days</span> to reflect in your wallet.
                </p>
              </div>
            )}
            <Button className="w-full" onClick={generateQR}>Generate QR Code</Button>
          </>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-10 h-10 animate-spin text-[#2E4156]" />
            <p className="text-sm text-gray-500">Generating QR code…</p>
          </div>
        )}

        {phase === 'qr' && (
          <>
            <div className="flex justify-center">
              <Image src={qrImage} alt="QR code" width={220} height={220} className="rounded-lg border" unoptimized />
            </div>
            <div className="text-center space-y-1">
              <p className="text-2xl font-bold">{fmtPHP(amount)}</p>
              <p className="text-xs text-gray-500">GCash · Maya · BPI · BDO · UnionBank</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Expires in {timeLeft || '29:00'}</span>
            </div>
            <p className="text-xs text-center text-gray-400">Waiting for payment confirmation…</p>
          </>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <p className="text-lg font-semibold">Top-up Confirmed!</p>
            <p className="text-sm text-gray-500">{fmtPHP(confirmedAmount.current)} added to your disbursement wallet.</p>
            <Button className="mt-2" onClick={() => { onConfirmed(confirmedAmount.current); onClose() }}>Done</Button>
          </div>
        )}

        {phase === 'expired' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Clock className="w-14 h-14 text-gray-400" />
            <p className="text-lg font-semibold text-gray-700">QR Expired</p>
            <Button variant="outline" onClick={() => setPhase('input')}>Try Again</Button>
          </div>
        )}

        {phase === 'failed' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="w-14 h-14 text-red-400" />
            <p className="text-lg font-semibold text-gray-700">Payment Failed</p>
            <Button variant="outline" onClick={() => setPhase('input')}>Try Again</Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function PayrollDisbursementPanel({
  runId,
  onDisbursed,
}: {
  runId: string
  /** Called after a successful disbursement initiation so parent screens can refresh */
  onDisbursed?: () => void
}) {
  const [preview,     setPreview]     = useState<DisbursementPreview | null>(null)
  const [statusItems, setStatusItems] = useState<StatusItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [disbursing,  setDisbursing]  = useState(false)
  const [polling,     setPolling]     = useState(false)
  const [showTopUp,   setShowTopUp]   = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/disbursement/${runId}`)
      const data = await res.json()
      if (res.ok) setPreview(data)
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    void loadPreview()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadPreview])

  // Auto-poll when disbursement is PROCESSING
  useEffect(() => {
    if (!preview?.disbursement) return
    if (!['PROCESSING', 'PENDING'].includes(preview.disbursement.status)) return

    async function pollStatus() {
      setPolling(true)
      try {
        const res  = await fetch(`/api/disbursement/${runId}/status`)
        const data = await res.json()
        if (res.ok) {
          setStatusItems(data.items ?? [])
          if (!['PROCESSING', 'PENDING'].includes(data.status)) {
            setPreview(p => p ? { ...p, disbursement: p.disbursement ? { ...p.disbursement, status: data.status } : null } : p)
            if (pollRef.current) clearInterval(pollRef.current)
          }
        }
      } finally {
        setPolling(false)
      }
    }

    void pollStatus()
    pollRef.current = setInterval(pollStatus, POLL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [runId, preview?.disbursement?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function initiateDisbursement() {
    if (!preview) return
    if (!preview.wallet.sufficient) { toast.error('Insufficient wallet balance. Please top up first.'); return }

    const confirmed = window.confirm(
      `Disburse ${fmtPHP(preview.summary.totalAmount)} to ${preview.summary.readyCount} employees?\n\n` +
      `• InstaPay (≤₱50k): ${preview.summary.instapayCount} employees — real-time\n` +
      `• PesoNet (>₱50k): ${preview.summary.pesonetCount} employees — up to 3 banking days\n`,
    )
    if (!confirmed) return

    setDisbursing(true)
    try {
      const res  = await fetch(`/api/disbursement/${runId}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to initiate disbursement'); return }
      toast.success('Disbursement initiated!')
      await loadPreview()
      onDisbursed?.()
    } finally {
      setDisbursing(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading disbursement data…</span>
        </CardContent>
      </Card>
    )
  }

  if (!preview) return null

  const { wallet, summary, items, disbursement } = preview
  const missingItems = items.filter(i => !i.hasBankDetails)
  const readyItems   = items.filter(i => i.hasBankDetails)

  return (
    <>
      {showTopUp && (
        <TopUpModal
          onClose={() => setShowTopUp(false)}
          onConfirmed={async () => { await loadPreview(); setShowTopUp(false) }}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-[#2E4156]" />
              <CardTitle className="text-base">Payroll Disbursement</CardTitle>
              {disbursement && (
                <Badge className={`text-[11px] border-0 ${
                  disbursement.status === 'COMPLETED'  ? 'bg-green-100 text-green-700'  :
                  disbursement.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700'   :
                  disbursement.status === 'PARTIAL'    ? 'bg-amber-100 text-amber-700' :
                  disbursement.status === 'FAILED'     ? 'bg-red-100 text-red-700'     :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {disbursement.status}
                </Badge>
              )}
            </div>
            <button onClick={loadPreview} className="text-gray-400 hover:text-gray-600" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Send net pay directly to employee bank accounts.
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Notices */}
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              InstaPay (≤ ₱50,000) is real-time. PesoNet (&gt; ₱50,000) may take up to <span className="font-semibold">3 banking days</span>.
            </p>
          </div>

          {/* Wallet balance */}
          <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#2E4156]" />
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Wallet Balance</p>
                <p className={`text-lg font-bold ${wallet.sufficient ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtPHP(wallet.balance)}
                </p>
                {!wallet.sufficient && (
                  <p className="text-[11px] text-red-500">Shortfall: {fmtPHP(wallet.shortfall)}</p>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowTopUp(true)}>Top Up</Button>
          </div>

          {/* Summary + disburse button */}
          {!disbursement && (
            <div className="rounded-xl border bg-[#f8f9fb] p-4 space-y-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Total: </span>
                  <span className="font-semibold">{fmtPHP(summary.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Employees ready: </span>
                  <span className="font-semibold">{summary.readyCount} / {summary.totalEmployees}</span>
                </div>
                <div>
                  <span className="text-gray-500">InstaPay: </span>
                  <span className="font-semibold">{summary.instapayCount}</span>
                  <span className="text-gray-400 text-xs ml-1">(≤₱50k)</span>
                </div>
                <div>
                  <span className="text-gray-500">PesoNet: </span>
                  <span className="font-semibold">{summary.pesonetCount}</span>
                  <span className="text-gray-400 text-xs ml-1">(&gt;₱50k)</span>
                </div>
              </div>

              {summary.missingBankDetails > 0 && (
                <button type="button" className="w-full text-left" onClick={() => setShowMissing(v => !v)}>
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-700">
                        <span className="font-semibold">{summary.missingBankDetails} employee{summary.missingBankDetails > 1 ? 's' : ''}</span> missing bank details — will be skipped.
                      </p>
                    </div>
                    {showMissing ? <ChevronUp className="w-3.5 h-3.5 text-amber-600" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-600" />}
                  </div>
                </button>
              )}

              {showMissing && missingItems.length > 0 && (
                <div className="space-y-1 ml-2">
                  {missingItems.map(item => (
                    <div key={item.payslipId} className="text-xs text-gray-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span>{item.employeeName}</span>
                      <span className="text-gray-400">—</span>
                      <span className="text-gray-400">{!item.bankAccountNo ? 'no account number' : 'no BIC code'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={initiateDisbursement}
                  disabled={disbursing || summary.readyCount === 0 || !wallet.sufficient}
                >
                  {disbursing
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing…</>
                    : <><Send className="mr-2 h-4 w-4" />Disburse {fmtPHP(summary.totalAmount)}</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* Employee breakdown */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              {disbursement ? 'Disbursement Status' : 'Employee Breakdown'}
            </p>
            {readyItems.map(item => {
              const liveItem = statusItems.find(s => s.payslipId === item.payslipId)
              const displayStatus = liveItem?.status ?? item.status
              const referenceNo   = liveItem?.referenceNo ?? item.referenceNo
              return (
                <div key={item.payslipId} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.employeeName}</p>
                    <p className="text-xs text-gray-500">
                      {item.bankName ?? item.bankBic} · {item.bankAccountNo}
                    </p>
                    {referenceNo && <p className="text-[11px] text-gray-400">Ref: {referenceNo}</p>}
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${item.channel === 'instapay' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {item.channel === 'instapay' ? 'InstaPay' : 'PesoNet'}
                    </span>
                    <span className="font-semibold text-[#2E4156]">{fmtPHP(item.amount)}</span>
                    {disbursement  ? statusBadge(displayStatus)                       : null}
                    {!disbursement ? <BadgeCheck className="w-4 h-4 text-green-500" /> : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Completed / Partial banners */}
          {disbursement?.status === 'COMPLETED' && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Disbursement Completed</p>
                <p className="text-xs text-green-700">
                  {fmtPHP(disbursement.totalAmount)} disbursed to {readyItems.length} employees.
                </p>
              </div>
            </div>
          )}

          {disbursement?.status === 'PARTIAL' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Partially Completed</p>
                <p className="text-xs text-amber-700">Some transfers failed. Check failed items above.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
