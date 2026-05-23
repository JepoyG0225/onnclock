'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle, CheckCircle2, Clock, ExternalLink,
  Loader2, RefreshCw, Send, Wallet, X,
} from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletData {
  balance: number
  topUps: Array<{ id: string; amountPeso: number; status: string; confirmedAt: string | null; createdAt: string }>
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

function topUpStatusClass(s: string) {
  return s === 'CONFIRMED' ? 'bg-green-100 text-green-700'
       : s === 'FAILED'    ? 'bg-red-100 text-red-700'
       : s === 'EXPIRED'   ? 'bg-gray-100 text-gray-500'
       :                     'bg-yellow-100 text-yellow-700'
}

// ─── QR Top-up Modal ─────────────────────────────────────────────────────────

function TopUpModal({ onClose, onConfirmed }: { onClose: () => void; onConfirmed: (amount: number) => void }) {
  const [amount,   setAmount]   = useState(5000)
  const [phase,    setPhase]    = useState<'input' | 'loading' | 'qr' | 'success' | 'expired' | 'failed'>('input')
  const [qrImage,  setQrImage]  = useState('')
  const [timeLeft, setTimeLeft] = useState('')
  const confirmedAmount = useRef(0)
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
      confirmedAmount.current = data.amountPeso
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
        if      (d.status === 'CONFIRMED') { stopAll(); setPhase('success') }
        else if (d.status === 'FAILED')    { stopAll(); setPhase('failed') }
        else if (d.status === 'EXPIRED')   { stopAll(); setPhase('expired') }
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
            {amount > 50_000 && (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Top-ups above ₱50,000 are processed via PesoNet and may take <span className="font-semibold">1–3 banking days</span> to reflect in your wallet.
                </p>
              </div>
            )}
            <Button className="w-full" onClick={generate}>Generate QR Code</Button>
          </>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-10 h-10 animate-spin text-[#2E4156]" />
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
            <p className="text-xs text-center text-gray-400">Waiting for payment confirmation…</p>
          </>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <p className="text-lg font-semibold">Top-up Confirmed!</p>
            <p className="text-sm text-gray-500">{fmtPHP(confirmedAmount.current)} added to your wallet.</p>
            <Button onClick={() => { onConfirmed(confirmedAmount.current); onClose() }}>Done</Button>
          </div>
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

export default function DisbursementPage() {
  const [wallet,    setWallet]    = useState<WalletData | null>(null)
  const [recent,    setRecent]    = useState<RecentDisbursement[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showTopUp, setShowTopUp] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [wRes, dRes] = await Promise.all([
        fetch('/api/disbursement/wallet'),
        fetch('/api/disbursement/recent'),
      ])
      if (wRes.ok) setWallet(await wRes.json())
      if (dRes.ok) setRecent((await dRes.json()).disbursements ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

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
          onConfirmed={() => { void loadData(); setShowTopUp(false) }}
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
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
          </Button>
        </div>

        {/* Notices */}
        <div className="space-y-2">
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700">
              <span className="font-semibold">Disbursement time:</span> InstaPay (≤ ₱50,000) is real-time.
              PesoNet (&gt; ₱50,000) may take up to <span className="font-semibold">3 banking days</span>.
              Top-ups above ₱50,000 may also take <span className="font-semibold">1–3 banking days</span> to reflect in your wallet.
            </p>
          </div>
        </div>

        {/* Wallet */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#D4D8DD] rounded-xl">
                  <Wallet className="w-6 h-6 text-[#2E4156]" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Disbursement Wallet Balance</p>
                  <p className="text-3xl font-bold text-[#2E4156] mt-0.5">
                    {wallet ? fmtPHP(wallet.balance) : '—'}
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

        {/* Recent disbursements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-[#2E4156]" />
              Recent Disbursements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">
                No disbursements yet. Go to an approved payroll run to disburse.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Payroll Period</th>
                    <th className="text-right px-4 py-3">Amount</th>
                    <th className="text-center px-4 py-3">Employees</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {recent.map(d => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{d.periodLabel}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtPHP(d.totalAmount)}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{d.itemCount}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-[11px] border-0 ${disbStatusClass(d.status)}`}>
                          {d.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {new Date(d.initiatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/payroll/${d.payrollRunId}`}
                          className="inline-flex items-center gap-1 text-[#2E4156] hover:underline text-xs"
                        >
                          View run <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Recent top-ups */}
        {wallet && wallet.topUps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#2E4156]" />
                Top-up History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Amount</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.topUps.map(t => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-semibold">{fmtPHP(t.amountPeso)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-[11px] border-0 ${topUpStatusClass(t.status)}`}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {new Date(t.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
