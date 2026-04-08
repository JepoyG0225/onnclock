'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import {
  CreditCard, Users, Calendar, AlertCircle,
  Download, Loader2, TrendingUp, Star, Clock, RefreshCw, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SubscriptionData {
  subscription: {
    id: string
    plan: 'TRIAL' | 'MONTHLY' | 'ANNUAL'
    status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
    trialEndsAt: string | null
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    billingCycle: string | null
    pricePerSeat: number
    seatCount: number
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

interface PaymentMethod {
  id: string
  code: string
  label: string
  type: 'GCASH' | 'BANK_TRANSFER' | 'E_WALLET' | 'OTHER'
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  instructions: string | null
  qrImageUrl: string | null
  isActive: boolean
}

const MONTHLY_PRICE = 50
const ANNUAL_PRICE_PER_MONTH = 40

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BillingPage() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'MONTHLY' | 'ANNUAL' | null>(null)
  const [seatCount, setSeatCount] = useState(1)
  const [paymentCode, setPaymentCode] = useState<string | null>(null)
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null)
  const [proofFileName, setProofFileName] = useState<string | null>(null)

  async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [subRes, invRes, methodRes] = await Promise.all([
        fetch('/api/billing/subscription'),
        fetch('/api/billing/invoices'),
        fetch('/api/billing/payment-methods'),
      ])
      if (subRes.ok) {
        const next = await subRes.json()
        setData(next)
        setSeatCount(Math.max(next.employeeCount, next.subscription?.seatCount ?? 1))
      }
      if (invRes.ok) setInvoices((await invRes.json()).invoices ?? [])
      if (methodRes.ok) {
        const list = (await methodRes.json()).methods ?? []
        setMethods(list)
        if (list[0]?.code) setPaymentCode((prev) => prev ?? list[0].code)
      }
    } catch {
      toast.error('Failed to load billing information')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function confirmPlan() {
    if (!selectedPlan || !paymentCode) return
    setUpgrading(true)
    try {
      const res = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingCycle: selectedPlan,
          seatCount,
          paymentMethodCode: paymentCode,
          proofOfPaymentDataUrl: proofDataUrl ?? undefined,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Subscription failed')
      toast.success('Subscription updated and invoice generated.')
      setSelectedPlan(null)
      setProofDataUrl(null)
      setProofFileName(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Subscription failed')
    } finally {
      setUpgrading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    )
  }
  if (!data) return null

  const { subscription: sub, employeeCount, daysLeft, estimatedMonthly } = data
  const isOnTrial = sub.status === 'TRIAL'
  const isExpired = sub.status === 'EXPIRED'
  const isActive = sub.status === 'ACTIVE'
  const isAnnual = sub.billingCycle === 'ANNUAL'

  const effectiveSeatCount = Math.max(employeeCount, seatCount)
  const monthlyTotal = MONTHLY_PRICE * effectiveSeatCount
  const annualTotal = ANNUAL_PRICE_PER_MONTH * 12 * effectiveSeatCount
  const annualSavings = MONTHLY_PRICE * 12 * effectiveSeatCount - annualTotal

  const selectedMethod = methods.find((m) => m.code === paymentCode) ?? null
  const selectedTotal = selectedPlan === 'ANNUAL' ? annualTotal : monthlyTotal

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Billing & Subscription</h1>
          <p className="text-sm text-slate-500 mt-1">Select a plan, quantity, and payment option with QR.</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {(isOnTrial || isExpired) && (
        <div className={`rounded-2xl px-5 py-4 flex items-start gap-4 border ${
          isExpired ? 'bg-red-50 border-red-200' : 'bg-teal-50 border-teal-200'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isExpired ? 'bg-red-100' : 'bg-teal-100'}`}>
            {isExpired ? <AlertCircle className="w-5 h-5 text-red-600" /> : <Clock className="w-5 h-5 text-teal-600" />}
          </div>
          <div className="flex-1">
            <p className={`font-bold text-sm ${isExpired ? 'text-red-700' : 'text-teal-700'}`}>
              {isExpired ? 'Your free trial has ended' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial`}
            </p>
            <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-600' : 'text-slate-600'}`}>
              Upgrade now to continue payroll and attendance features.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,127,132,0.12)' }}>
              <CreditCard className="w-5 h-5" style={{ color: '#227f84' }} />
            </div>
            <div>
              <p className="font-bold text-slate-800">Current Plan</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {isOnTrial && `Free Trial — expires ${sub.trialEndsAt ? format(new Date(sub.trialEndsAt), 'MMM dd, yyyy') : ''}`}
                {isActive && sub.currentPeriodEnd && `${isAnnual ? 'Annual' : 'Monthly'} — renews ${format(new Date(sub.currentPeriodEnd), 'MMM dd, yyyy')}`}
                {isExpired && 'Expired — please subscribe'}
              </p>
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
            isOnTrial ? 'bg-teal-100 text-teal-700' : isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
          }`}>
            {isOnTrial ? 'Free Trial' : isActive ? (isAnnual ? 'Annual' : 'Monthly') : 'Expired'}
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
            <p className="text-xs text-slate-400 font-medium mb-1">Rate per Employee</p>
            <p className="text-xl font-black text-slate-800">{fmt(isAnnual ? ANNUAL_PRICE_PER_MONTH : MONTHLY_PRICE)}<span className="text-xs font-medium text-slate-400">/mo</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">Est. Monthly Cost</p>
            <p className="text-xl font-black" style={{ color: '#227f84' }}>{fmt(estimatedMonthly)}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-slate-800 mb-4">{isActive ? 'Change Plan' : 'Choose a Plan'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`rounded-2xl border-2 p-6 transition-all ${selectedPlan === 'MONTHLY' ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
            <p className="font-black text-slate-900 text-lg">Monthly</p>
            <p className="text-xs text-slate-400 mt-1">₱50 / employee / month</p>
            <p className="mt-4 text-sm font-semibold text-slate-700">{fmt(monthlyTotal)} / month</p>
            <button
              onClick={() => setSelectedPlan('MONTHLY')}
              className="mt-5 w-full py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: '#227f84' }}
            >
              {selectedPlan === 'MONTHLY' ? 'Selected' : 'Choose Monthly'}
            </button>
          </div>

          <div className={`rounded-2xl border-2 p-6 transition-all ${selectedPlan === 'ANNUAL' ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
            <div className="flex items-center justify-between">
              <p className="font-black text-slate-900 text-lg">Annual</p>
              <span className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full text-white"
                style={{ background: 'linear-gradient(135deg, #227f84, #0b4a3b)' }}>
                <Star className="w-2.5 h-2.5 fill-white" /> BEST VALUE
              </span>
            </div>
            <p className="text-xs text-emerald-600 font-bold mt-1">Save 20%</p>
            <p className="mt-4 text-sm font-semibold text-slate-700">{fmt(annualTotal)} / year</p>
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Save {fmt(annualSavings)} yearly
            </p>
            <button
              onClick={() => setSelectedPlan('ANNUAL')}
              className="mt-5 w-full py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #227f84, #0b4a3b)' }}
            >
              {selectedPlan === 'ANNUAL' ? 'Selected' : 'Choose Annual'}
            </button>
          </div>
        </div>
      </div>

      {selectedPlan && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <h3 className="text-base font-bold text-slate-900">Checkout</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quantity (Seats)</label>
                <input
                  type="number"
                  min={Math.max(1, employeeCount)}
                  value={seatCount}
                  onChange={(e) => setSeatCount(Math.max(employeeCount, Number(e.target.value) || employeeCount))}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">Minimum is active employees: {employeeCount}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">Selected Plan: {selectedPlan}</p>
                <p>Total: <span className="font-black text-teal-700">{fmt(selectedTotal)}</span></p>
                <p className="text-xs text-slate-500 mt-1">{effectiveSeatCount} seats billed.</p>
              </div>
              <button
                onClick={confirmPlan}
                disabled={!paymentCode || !proofDataUrl || upgrading}
                className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: '#227f84' }}
              >
                {upgrading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm Subscription
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Payment Options</p>
              <Tabs
                value={paymentCode ?? methods[0]?.code ?? ''}
                onValueChange={setPaymentCode}
                className="w-full"
              >
                <TabsList className="w-full h-auto p-1 grid gap-1 grid-cols-2">
                  {methods.map((method) => (
                    <TabsTrigger
                      key={method.id}
                      value={method.code}
                      className="py-2 text-xs sm:text-sm font-bold"
                    >
                      {method.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {methods.map((method) => (
                  <TabsContent key={method.id} value={method.code} className="mt-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                      {method.accountName && (
                        <p className="text-xs text-slate-500 mb-3">{method.accountName}</p>
                      )}
                      {method.qrImageUrl ? (
                        <img
                          src={method.qrImageUrl}
                          alt={`${method.label} QR`}
                          className="w-40 h-40 sm:w-48 sm:h-48 mx-auto rounded-xl border border-slate-200 bg-white object-contain p-2"
                        />
                      ) : (
                        <p className="text-xs text-slate-400">No QR configured</p>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Upload Proof of Payment</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-2 file:py-1.5 file:text-xs"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try {
                      const dataUrl = await fileToDataUrl(file)
                      setProofDataUrl(dataUrl)
                      setProofFileName(file.name)
                    } catch {
                      toast.error('Failed to read proof file.')
                    }
                  }}
                />
                {proofFileName && <p className="text-xs text-slate-500 mt-1">Selected: {proofFileName}</p>}
                {proofDataUrl && (
                  <img src={proofDataUrl} alt="Proof preview" className="w-28 h-28 rounded-lg border border-slate-200 bg-white mt-2 object-cover" />
                )}
              </div>
              {!selectedMethod && <p className="text-xs text-red-500 mt-2">Select a payment method.</p>}
              {!proofDataUrl && <p className="text-xs text-red-500 mt-1">Upload proof of payment to continue.</p>}
            </div>
          </div>
        </div>
      )}

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
                    <td className="px-4 py-4 hidden md:table-cell text-xs text-slate-600">
                      {invoice.paymentMethodLabel ?? '—'}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-800">{fmt(invoice.total)}</td>
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
    </div>
  )
}
