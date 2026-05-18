'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import {
  CreditCard, Users, Calendar, AlertCircle,
  Download, Loader2, TrendingUp, Star, Clock, RefreshCw,
  FileText, QrCode, CheckCircle2, XCircle, TimerReset,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

interface SubscriptionData {
  subscription: {
    id: string
    plan: string
    status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
    trialEndsAt: string | null
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    billingCycle: string | null
    pricePerSeat: number
    seatCount: number
    creditBalance?: number
  }
  employeeCount: number
  daysLeft: number | null
  estimatedMonthly: number
}

interface Invoice {
  id: string
  invoiceNo: string
  status: 'DRAFT' | 'UNPAID' | 'PAID' | 'VOID'
  periodStart: string
  periodEnd: string
  seatCount: number
  total: number
  paymentMethodLabel: string | null
  createdAt: string
}

// ── QR Modal state ────────────────────────────────────────────────────────────
type QrState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | {
      phase: 'qr'
      qrImage: string
      paymentIntentId: string
      amountDue: number
      invoiceNo: string
      expiresAt: string
    }
  | { phase: 'success'; invoiceNo: string }
  | { phase: 'expired' }
  | { phase: 'failed' }

const STANDARD_PRICE = 50
const PRO_PRICE = 100
const POLL_INTERVAL_MS = 5_000
const QR_LIFETIME_MS = 29 * 60 * 1000 // 29 min

// ── Subscription duration options ────────────────────────────────────────────
// Only the 1-year (ANNUAL) plan carries the 20% prepay discount. 3M and 6M
// are convenience plans for companies that want a shorter commitment — they
// pay the standard per-seat-per-month rate × number of months, no discount.
type Duration = '3_MONTH' | '6_MONTH' | 'ANNUAL'
const DURATION_MONTHS: Record<Duration, number> = {
  '3_MONTH': 3,
  '6_MONTH': 6,
  ANNUAL: 12,
}
const DURATION_DISCOUNT: Record<Duration, number> = {
  '3_MONTH': 0,
  '6_MONTH': 0,
  ANNUAL: 0.2,
}
const DURATION_LABEL: Record<Duration, string> = {
  '3_MONTH': '3 Months',
  '6_MONTH': '6 Months',
  ANNUAL: '1 Year (20% off)',
}
const DURATION_SHORT: Record<Duration, string> = {
  '3_MONTH': '3-Month',
  '6_MONTH': '6-Month',
  ANNUAL: 'Annual',
}

// Mirrors the server-side window (api/billing/qrph). After this many days
// from the current cycle's start, an upgrade no longer credits unused value
// from the existing plan — the new plan is charged at full price. Keep both
// constants in sync if you ever change one.
const PRORATION_WINDOW_DAYS = 10
const PRORATION_WINDOW_MS = PRORATION_WINDOW_DAYS * 24 * 60 * 60 * 1000

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

export default function BillingPage() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPricePerSeat, setSelectedPricePerSeat] = useState<50 | 100>(STANDARD_PRICE)
  const [selectedDuration, setSelectedDuration] = useState<Duration>('ANNUAL')
  const [seatCount, setSeatCount] = useState(1)
  // Add-seats flow (current-cycle, pro-rated). Default to whatever the
  // company is over by; if not over, prefill 1.
  const [seatsToAdd, setSeatsToAdd] = useState(1)
  const [addingSeats, setAddingSeats] = useState(false)
  const [qr, setQr] = useState<QrState>({ phase: 'idle' })
  const [countdown, setCountdown] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const expiresRef = useRef<number>(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [subRes, invRes] = await Promise.all([
        fetch('/api/billing/subscription'),
        fetch('/api/billing/invoices'),
      ])
      if (subRes.ok) {
        const next = await subRes.json()
        setData(next)
        setSeatCount(Math.max(next.employeeCount, next.subscription?.seatCount ?? 1))
        const rate = Number(next.subscription?.pricePerSeat ?? STANDARD_PRICE)
        setSelectedPricePerSeat(rate >= PRO_PRICE ? PRO_PRICE : STANDARD_PRICE)
      }
      if (invRes.ok) setInvoices((await invRes.json()).invoices ?? [])
    } catch {
      toast.error('Failed to load billing information')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Polling ───────────────────────────────────────────────────────────────
  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }

  function startPolling(paymentIntentId: string, expiresAt: string) {
    stopPolling()
    expiresRef.current = new Date(expiresAt).getTime()
    setCountdown(Math.max(0, expiresRef.current - Date.now()))

    // Countdown tick every second
    tickRef.current = setInterval(() => {
      const remaining = expiresRef.current - Date.now()
      setCountdown(Math.max(0, remaining))
      if (remaining <= 0) {
        stopPolling()
        setQr({ phase: 'expired' })
      }
    }, 1000)

    // Status poll every 5 s
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/billing/qrph/status?intentId=${encodeURIComponent(paymentIntentId)}`)
        if (!res.ok) return
        const json = await res.json()
        if (json.status === 'succeeded') {
          stopPolling()
          setQr({ phase: 'success', invoiceNo: json.invoiceNo ?? '' })
          await loadData()
        } else if (json.status === 'failed') {
          stopPolling()
          setQr({ phase: 'failed' })
        }
      } catch { /* ignore transient network errors */ }
    }, POLL_INTERVAL_MS)
  }

  useEffect(() => () => stopPolling(), [])

  // Default the add-seats input to whatever the company is over by, so a
  // single click pays for the unbilled headcount. Re-runs whenever the
  // unbilled count changes (after data load or seat-count refresh).
  useEffect(() => {
    if (data) {
      const ac = data.employeeCount
      const sc = Number(data.subscription?.seatCount ?? 0)
      const unbilled = Math.max(0, ac - sc)
      setSeatsToAdd(Math.max(1, unbilled))
    }
  }, [data])

  // ── Computed values ───────────────────────────────────────────────────────
  const employeeCount = data?.employeeCount ?? 0
  const sub = data?.subscription
  const isOnTrial = sub?.status === 'TRIAL'
  const isExpired = sub?.status === 'EXPIRED'
  const isActive = sub?.status === 'ACTIVE'
  // Active employees beyond the paid seatCount. Only flagged for ACTIVE
  // subscriptions — TRIAL/EXPIRED have their own handling above. This
  // matches src/lib/billing/seat-limit.ts so the banner shows exactly
  // when SubscriptionGate routes here.
  const unbilledSeats = isActive ? Math.max(0, employeeCount - Number(sub?.seatCount ?? 0)) : 0
  // Available billing credit earned from deactivations / refunds. Applied
  // automatically against any paid invoice (renewal or add-seats).
  const creditBalance = Number(sub?.creditBalance ?? 0)

  // Add-seats cost preview (mirrors api/billing/qrph/add-seats math so the
  // user can verify before paying). Only meaningful for ACTIVE subs.
  const addSeatsCost = (() => {
    if (!isActive || !sub?.currentPeriodStart || !sub?.currentPeriodEnd) return null
    const cycleKey = (sub.billingCycle as Duration | null) ?? 'ANNUAL'
    const cycleMonths = DURATION_MONTHS[cycleKey] ?? 12
    const discountPct = (DURATION_DISCOUNT[cycleKey] ?? 0) * 100
    const subPricePerSeat = Number(sub.pricePerSeat ?? 0)
    const totalCycleMs = Math.max(1, new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime())
    const remainingMs = Math.max(0, new Date(sub.currentPeriodEnd).getTime() - Date.now())
    const remainingRatio = Math.min(1, remainingMs / totalCycleMs)
    const daysRemaining = Math.max(0, Math.round(remainingMs / 86_400_000))
    const subtotalBase = Math.round(seatsToAdd * cycleMonths * subPricePerSeat * remainingRatio * 100) / 100
    const discountAmount = Math.round(subtotalBase * (discountPct / 100) * 100) / 100
    const total = Math.max(0, Math.round((subtotalBase - discountAmount) * 100) / 100)
    return { subtotalBase, discountAmount, total, daysRemaining, cycleMonths, discountPct, subPricePerSeat }
  })()

  const effectiveSeatCount = Math.max(employeeCount, seatCount)
  // ── Plan total math, generalized over the selected duration ─────────────
  // Annual gets the 20% discount; 3M and 6M are full price × months × seats.
  const selectedMonths = DURATION_MONTHS[selectedDuration]
  const selectedDiscount = DURATION_DISCOUNT[selectedDuration]
  const pricePerMonthAfterDiscount = Math.round(selectedPricePerSeat * (1 - selectedDiscount))
  const planTotal = pricePerMonthAfterDiscount * selectedMonths * effectiveSeatCount
  const planFullPrice = selectedPricePerSeat * selectedMonths * effectiveSeatCount
  const planSavings = planFullPrice - planTotal

  // Proration is offered only inside a 10-day window from the current
  // cycle's start. Outside that window the API charges full price even if
  // the cycle hasn't ended yet, so the UI must not promise a credit.
  const withinProrationWindow = Boolean(
    sub?.currentPeriodStart &&
    Date.now() - new Date(sub.currentPeriodStart).getTime() <= PRORATION_WINDOW_MS,
  )
  const hasRemainingPeriod = Boolean(
    isActive
    && sub?.currentPeriodEnd
    && new Date(sub.currentPeriodEnd).getTime() > Date.now()
    && withinProrationWindow,
  )
  const remainingRatio = hasRemainingPeriod && sub?.currentPeriodStart && sub?.currentPeriodEnd
    ? Math.min(1, Math.max(0,
        (new Date(sub.currentPeriodEnd).getTime() - Date.now()) /
        Math.max(1, new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime())
      ))
    : 0
  // Compute the existing cycle's total (matches whatever billingCycle the
  // current subscription was created under). Discount only applied when
  // current cycle is ANNUAL.
  const currentCycleKey: Duration = (sub?.billingCycle as Duration | undefined) ?? 'ANNUAL'
  const currentMonths = DURATION_MONTHS[currentCycleKey] ?? 12
  const currentDiscount = DURATION_DISCOUNT[currentCycleKey] ?? 0
  const currentCycleTotal = Number(sub?.pricePerSeat ?? 0)
    * currentMonths
    * Number(sub?.seatCount ?? 0)
    * (1 - currentDiscount)
  const remainingCredit = Math.round(currentCycleTotal * remainingRatio * 100) / 100
  const isSameCycle = sub?.billingCycle === selectedDuration
  const selectedTotal = (() => {
    if (!hasRemainingPeriod) return planTotal
    if (isSameCycle) {
      const delta = Math.max(0, planTotal - currentCycleTotal)
      return Math.round(delta * remainingRatio * 100) / 100
    }
    return Math.max(0, Math.round((planTotal - remainingCredit) * 100) / 100)
  })()

  // ── Proceed to payment ────────────────────────────────────────────────────
  async function proceedToPayment() {
    setQr({ phase: 'loading' })
    try {
      const res = await fetch('/api/billing/qrph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingCycle: selectedDuration,
          seatCount: effectiveSeatCount,
          pricePerSeat: selectedPricePerSeat,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to create payment')
        setQr({ phase: 'idle' })
        return
      }
      setQr({
        phase: 'qr',
        qrImage: json.qrImage,
        paymentIntentId: json.paymentIntentId,
        amountDue: json.amountDue,
        invoiceNo: json.invoiceNo,
        expiresAt: json.expiresAt,
      })
      startPolling(json.paymentIntentId, json.expiresAt)
    } catch {
      toast.error('Connection error — please try again')
      setQr({ phase: 'idle' })
    }
  }

  function closeModal() {
    stopPolling()
    setQr({ phase: 'idle' })
  }

  // ── Add seats to current cycle ────────────────────────────────────────────
  // Pro-rated by remaining cycle days; opens the same QR modal as the main
  // checkout, just with a different API + activation type. seatCount on
  // the subscription is incremented (not replaced) on payment success.
  async function addSeats() {
    if (seatsToAdd <= 0) {
      toast.error('Enter at least 1 seat to add')
      return
    }
    setAddingSeats(true)
    setQr({ phase: 'loading' })
    try {
      const res = await fetch('/api/billing/qrph/add-seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalSeats: seatsToAdd }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to start add-seats payment')
        setQr({ phase: 'idle' })
        return
      }
      setQr({
        phase: 'qr',
        qrImage: json.qrImage,
        paymentIntentId: json.paymentIntentId,
        amountDue: json.amountDue,
        invoiceNo: json.invoiceNo,
        expiresAt: json.expiresAt,
      })
      startPolling(json.paymentIntentId, json.expiresAt)
    } catch {
      toast.error('Connection error — please try again')
      setQr({ phase: 'idle' })
    } finally {
      setAddingSeats(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SettingsTabs />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-[#2E4156]" />
        </div>
      </div>
    )
  }
  if (!data || !sub) return null

  return (
    <div className="space-y-6">
      <SettingsTabs />
      <div className="max-w-4xl space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Billing & Subscription</h1>
          <p className="text-sm text-slate-500 mt-1">Pay via GCash or Maya QR code — instant confirmation.</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* ── Trial / Expired banner ── */}
      {(isOnTrial || isExpired) && (
        <div className={`rounded-2xl px-5 py-4 flex items-start gap-4 border ${isExpired ? 'bg-red-50 border-red-200' : 'bg-[#D4D8DD] border-[#AAB7B7]'}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isExpired ? 'bg-red-100' : 'bg-[#C0C8CA]'}`}>
            {isExpired ? <AlertCircle className="w-5 h-5 text-red-600" /> : <Clock className="w-5 h-5 text-[#2E4156]" />}
          </div>
          <div className="flex-1">
            <p className={`font-bold text-sm ${isExpired ? 'text-red-700' : 'text-[#1A2D42]'}`}>
              {isExpired ? 'Your free trial has ended' : `${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'} left in your free trial`}
            </p>
            <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-600' : 'text-slate-600'}`}>
              Subscribe now to keep payroll and attendance features running.
            </p>
          </div>
        </div>
      )}

      {/* ── Billing credit balance ── */}
      {creditBalance > 0 && (
        <div className="rounded-2xl px-5 py-4 flex items-start gap-4 border bg-emerald-50 border-emerald-200">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-emerald-900">
              You have {fmt(creditBalance)} in billing credit
            </p>
            <p className="text-xs mt-0.5 text-emerald-800">
              Earned from mid-cycle employee deactivations. Applied automatically
              to your next paid invoice (renewal or added seats).
            </p>
          </div>
        </div>
      )}

      {/* ── Over-seat banner ── */}
      {unbilledSeats > 0 && (
        <div className="rounded-2xl px-5 py-4 flex items-start gap-4 border bg-amber-50 border-amber-200">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-100">
            <AlertCircle className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-amber-900">
              {unbilledSeats} unbilled {unbilledSeats === 1 ? 'employee' : 'employees'}
            </p>
            <p className="text-xs mt-0.5 text-amber-800">
              You have <strong>{employeeCount}</strong> active {employeeCount === 1 ? 'employee' : 'employees'} but
              only <strong>{Number(sub?.seatCount ?? 0)}</strong> paid {Number(sub?.seatCount ?? 0) === 1 ? 'seat' : 'seats'}.
              Adding employees beyond your seat count is blocked until you upgrade your subscription below.
              The seat quantity is pre-filled to match your current headcount.
            </p>
          </div>
        </div>
      )}

      {/* ── Add seats to current cycle ── */}
      {/* Only shown on ACTIVE subscriptions. Lets HR top up seats mid-cycle
          without restarting the whole subscription period. Cost is the
          per-seat-per-month rate × number of cycle months × the fraction
          of the cycle that's still remaining, with the same discount the
          parent cycle was bought under (0% for 3M/6M, 20% for annual). */}
      {isActive && addSeatsCost && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">Add seats to current plan</h3>
            <span className="ml-auto text-xs text-slate-500">
              {addSeatsCost.daysRemaining} day{addSeatsCost.daysRemaining === 1 ? '' : 's'} remaining
            </span>
          </div>
          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seats to add</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={seatsToAdd}
                  onChange={(e) => setSeatsToAdd(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {unbilledSeats > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Pre-filled to {unbilledSeats} to cover your unbilled employee{unbilledSeats === 1 ? '' : 's'}.
                  </p>
                )}
                {unbilledSeats === 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    No unbilled employees right now — add seats ahead of time so new hires aren&apos;t blocked.
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-700 mb-2">Cost preview</p>
                <div className="flex justify-between">
                  <span>Per-seat rate</span>
                  <span className="font-bold text-[#1A2D42]">{fmt(addSeatsCost.subPricePerSeat)} / month</span>
                </div>
                <div className="flex justify-between">
                  <span>Cycle length</span>
                  <span className="font-bold text-[#1A2D42]">
                    {addSeatsCost.cycleMonths} month{addSeatsCost.cycleMonths === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Pro-rated to cycle remaining</span>
                  <span className="font-bold text-[#1A2D42]">{addSeatsCost.daysRemaining} days</span>
                </div>
                {addSeatsCost.discountPct > 0 && (
                  <div className="flex justify-between text-emerald-700 text-xs">
                    <span>Annual discount</span>
                    <span className="font-bold">−{addSeatsCost.discountPct.toFixed(0)}% (−{fmt(addSeatsCost.discountAmount)})</span>
                  </div>
                )}
                {creditBalance > 0 && (
                  <div className="flex justify-between text-emerald-700 text-xs">
                    <span>Billing credit applied</span>
                    <span className="font-bold">−{fmt(Math.min(creditBalance, addSeatsCost.total))}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-2 mt-1 flex justify-between text-base">
                  <span className="font-bold text-slate-800">Amount Due Now</span>
                  <span className="font-black text-[#1A2D42] text-lg">
                    {fmt(Math.max(0, addSeatsCost.total - Math.min(creditBalance, addSeatsCost.total)))}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Seats are added to your current cycle and expire alongside it.
                  Cycle period is unchanged.
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center flex flex-col items-center gap-3">
                <img src="/qrph-logo.svg" alt="QR Ph" className="h-10 w-auto" />
                <div>
                  <p className="font-bold text-slate-700 text-sm">Pay via QR Ph</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Same payment flow as your subscription. Scan to confirm.
                  </p>
                </div>
              </div>
              <button
                onClick={addSeats}
                disabled={addingSeats || seatsToAdd <= 0 || addSeatsCost.total <= 0}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
              >
                {addingSeats
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <QrCode className="w-4 h-4" />}
                Pay to add {seatsToAdd} seat{seatsToAdd === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Current plan card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,65,86,0.12)' }}>
              <CreditCard className="w-5 h-5" style={{ color: '#2E4156' }} />
            </div>
            <div>
              <p className="font-bold text-slate-800">Current Plan</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {isOnTrial && `Free Trial — expires ${sub.trialEndsAt ? format(new Date(sub.trialEndsAt), 'MMM dd, yyyy') : ''}`}
                {isActive && sub.currentPeriodEnd && `${DURATION_SHORT[(sub.billingCycle as Duration) ?? 'ANNUAL'] ?? 'Annual'} — renews ${format(new Date(sub.currentPeriodEnd), 'MMM dd, yyyy')}`}
                {isExpired && 'Expired — please subscribe'}
              </p>
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${isOnTrial ? 'bg-[#C0C8CA] text-[#1A2D42]' : isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
            {isOnTrial ? 'Free Trial' : isActive ? 'Active' : 'Expired'}
          </span>
        </div>
        <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">Active Employees</p>
            <div className="flex items-baseline gap-1">
              <Users className="w-4 h-4 text-slate-400 mt-0.5" />
              <p className="text-xl font-black text-slate-800">{employeeCount}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">Subscribed Seats</p>
            <p className="text-xl font-black text-slate-800">{sub.seatCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">Rate / Employee</p>
            <p className="text-xl font-black text-slate-800">{fmt(sub.pricePerSeat)}<span className="text-xs font-medium text-slate-400">/mo</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">Est. Monthly Cost</p>
            <p className="text-xl font-black" style={{ color: '#2E4156' }}>{fmt(data.estimatedMonthly)}</p>
          </div>
        </div>
      </div>

      {/* ── Plan tier selection ── */}
      <div>
        <h2 className="text-base font-bold text-slate-800 mb-4">Choose Plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { price: STANDARD_PRICE as 50, label: 'Basic', desc: 'Core HR, payroll, and attendance' },
            { price: PRO_PRICE as 100, label: 'Pro', desc: 'Includes screen capture, recruitment, onboarding, performance, disciplinary, overtime, and offboarding' },
          ].map(({ price, label, desc }) => (
            <button
              key={price}
              type="button"
              onClick={() => setSelectedPricePerSeat(price)}
              className={`rounded-2xl border-2 p-5 text-left transition-all ${selectedPricePerSeat === price ? 'border-[#2E4156] bg-[#D4D8DD]/40' : 'border-slate-200 bg-white hover:border-[#AAB7B7]'}`}
            >
              <p className="font-black text-slate-900 text-lg">{label}</p>
              <p className="text-xs text-slate-500 mt-1">{desc}</p>
              <p className="mt-3 text-sm font-semibold text-slate-700">₱{price} / employee / month</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Checkout card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-slate-900">Checkout</h3>
          {selectedDuration === 'ANNUAL' && (
            <span className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full text-white" style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}>
              <Star className="w-2.5 h-2.5 fill-white" /> 20% ANNUAL DISCOUNT
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left — seats + summary */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subscription Duration</label>
              <select
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value as Duration)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="3_MONTH">3 Months</option>
                <option value="6_MONTH">6 Months</option>
                <option value="ANNUAL">1 Year — 20% off</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {selectedDuration === 'ANNUAL'
                  ? 'Prepay 12 months, save 20% per seat.'
                  : `Prepay ${selectedMonths} months at the regular monthly rate.`}
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quantity (Seats)</label>
              <input
                type="number"
                min={Math.max(1, employeeCount)}
                value={seatCount}
                onChange={(e) => setSeatCount(Math.max(employeeCount, Number(e.target.value) || employeeCount))}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">Minimum: {employeeCount} active employee{employeeCount !== 1 ? 's' : ''}</p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600 space-y-1.5">
              <p className="font-bold text-slate-700 mb-2">{DURATION_SHORT[selectedDuration]} Plan Summary</p>
              <div className="flex justify-between">
                <span>Rate</span>
                <span className="font-bold text-[#1A2D42]">{fmt(pricePerMonthAfterDiscount)} / seat / month</span>
              </div>
              <div className="flex justify-between">
                <span>Plan total ({effectiveSeatCount} seats × {selectedMonths} {selectedMonths === 1 ? 'month' : 'months'})</span>
                <span className="font-bold text-[#1A2D42]">{fmt(planTotal)}</span>
              </div>
              {planSavings > 0 && (
                <div className="flex justify-between text-emerald-600 text-xs">
                  <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Annual savings</span>
                  <span className="font-bold">{fmt(planSavings)}</span>
                </div>
              )}
              {hasRemainingPeriod && remainingCredit > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Current plan credit</span>
                  <span className="font-bold">−{fmt(remainingCredit)}</span>
                </div>
              )}
              {creditBalance > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Billing credit applied</span>
                  <span className="font-bold">−{fmt(Math.min(creditBalance, selectedTotal))}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 mt-1 flex justify-between text-base">
                <span className="font-bold text-slate-800">Amount Due Now</span>
                <span className="font-black text-[#1A2D42] text-lg">
                  {fmt(Math.max(0, selectedTotal - Math.min(creditBalance, selectedTotal)))}
                </span>
              </div>
            </div>
          </div>

          {/* Right — payment info + CTA */}
          <div className="flex flex-col justify-between gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center flex flex-col items-center gap-3">
              <img src="/qrph-logo.svg" alt="QR Ph" className="h-10 w-auto" />
              <div>
                <p className="font-bold text-slate-700 text-sm">Pay via QR Ph</p>
                <p className="text-xs text-slate-500 mt-1">Supports GCash, Maya, and any QR Ph-enabled bank app. Scan and confirm payment instantly.</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {['GCash', 'Maya', 'BPI', 'BDO', 'UnionBank'].map((b) => (
                  <span key={b} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{b}</span>
                ))}
              </div>
            </div>

            <button
              onClick={proceedToPayment}
              disabled={selectedTotal <= 0}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
            >
              <QrCode className="w-4 h-4" />
              Proceed to Payment
            </button>
          </div>
        </div>
      </div>

      {/* ── Invoice History ── */}
      <div>
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" /> Invoice History
        </h2>
        {invoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">No invoices yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Invoice</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Period</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Payment</th>
                  <th className="text-right px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-center px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800 text-sm">{invoice.invoiceNo}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{format(new Date(invoice.createdAt), 'MMM dd, yyyy')}</p>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell text-xs text-slate-600">
                      {format(new Date(invoice.periodStart), 'MMM dd')} – {format(new Date(invoice.periodEnd), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell text-xs text-slate-600">{invoice.paymentMethodLabel ?? '—'}</td>
                    <td className="px-4 py-4 text-right font-bold text-slate-800">{fmt(invoice.total)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                        invoice.status === 'VOID' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/billing/invoices/${invoice.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── QR Payment Modal ── */}
      {qr.phase !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,.65)', backdropFilter: 'blur(6px)' }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

            {/* Loading */}
            {qr.phase === 'loading' && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#2E4156' }} />
                <p className="font-bold text-slate-700">Generating QR code…</p>
                <p className="text-xs text-slate-400 text-center">Generating your QR code…</p>
              </div>
            )}

            {/* QR Code */}
            {qr.phase === 'qr' && (
              <>
                <div className="px-6 pt-6 pb-4 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3" style={{ background: 'rgba(46,65,86,.1)' }}>
                    <QrCode className="w-6 h-6" style={{ color: '#2E4156' }} />
                  </div>
                  <h2 className="text-lg font-black text-slate-900">Scan to Pay</h2>
                  <p className="text-xs text-slate-500 mt-1">Use GCash, Maya, or any QR Ph-enabled bank app</p>
                </div>

                {/* QR image */}
                <div className="flex justify-center px-6">
                  {qr.qrImage ? (
                    <img
                      src={qr.qrImage}
                      alt="QR Ph payment code"
                      className="w-56 h-56 rounded-2xl border-2 border-slate-200 bg-white p-1"
                    />
                  ) : (
                    <div className="w-56 h-56 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
                      <p className="text-xs text-slate-400 text-center px-4">QR image unavailable.<br/>Please try again.</p>
                    </div>
                  )}
                </div>

                {/* Amount + invoice */}
                <div className="mx-6 mt-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-center">
                  <p className="text-xs text-slate-500">Amount Due</p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5">{fmt(qr.amountDue)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Invoice {qr.invoiceNo}</p>
                </div>

                {/* Status + countdown */}
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Waiting for payment…
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-bold ${countdown < 5 * 60 * 1000 ? 'text-red-500' : 'text-slate-500'}`}>
                    <TimerReset className="w-3.5 h-3.5" />
                    {fmtCountdown(countdown)}
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <button
                    onClick={closeModal}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Success */}
            {qr.phase === 'success' && (
              <div className="flex flex-col items-center gap-4 py-12 px-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">Payment Confirmed!</h2>
                  <p className="text-sm text-slate-500 mt-1">Your subscription is now active.</p>
                  {qr.invoiceNo && <p className="text-xs text-slate-400 mt-1">Invoice {qr.invoiceNo}</p>}
                </div>
                <button
                  onClick={closeModal}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white mt-2"
                  style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
                >
                  Done
                </button>
              </div>
            )}

            {/* Expired */}
            {qr.phase === 'expired' && (
              <div className="flex flex-col items-center gap-4 py-12 px-8 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                  <TimerReset className="w-9 h-9 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">QR Expired</h2>
                  <p className="text-sm text-slate-500 mt-1">The QR code has expired. Please generate a new one.</p>
                </div>
                <div className="flex gap-3 w-full mt-2">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    onClick={proceedToPayment}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Failed */}
            {qr.phase === 'failed' && (
              <div className="flex flex-col items-center gap-4 py-12 px-8 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="w-9 h-9 text-red-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">Payment Failed</h2>
                  <p className="text-sm text-slate-500 mt-1">The payment was declined or cancelled.</p>
                </div>
                <div className="flex gap-3 w-full mt-2">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    onClick={proceedToPayment}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
      </div>
    </div>
  )
}
