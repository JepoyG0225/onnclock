'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Building2, CreditCard, Save, Plus, Trash2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

type SubscriptionPlan = 'TRIAL' | 'MONTHLY' | 'ANNUAL'
type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
type BillingCycle = 'MONTHLY' | 'ANNUAL' | null
type PaymentMethodType = 'GCASH' | 'BANK_TRANSFER' | 'E_WALLET' | 'OTHER'
type AdminTab = 'companies' | 'subscriptions' | 'payments'
type SubscriptionFilter = 'TRIAL' | 'ACTIVE' | 'EXPIRED'

interface CompanyRow {
  id: string
  name: string
  email: string | null
  isActive: boolean
  activeEmployees: number
  unpaidCount: number
  paidTotal: number
  subscription: {
    id: string
    plan: SubscriptionPlan
    status: SubscriptionStatus
    billingCycle: BillingCycle
    seatCount: number
    pricePerSeat: number
    trialEndsAt: string | null
    currentPeriodEnd: string | null
  } | null
}

interface PaymentMethod {
  id: string
  code: string
  label: string
  type: PaymentMethodType
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  instructions: string | null
  qrImageUrl: string | null
  sortOrder: number
  isActive: boolean
}

interface SubmittedPayment {
  id: string
  invoiceNo: string
  company: { id: string; name: string; email: string | null }
  status: 'DRAFT' | 'UNPAID' | 'PAID' | 'VOID'
  total: number
  paymentMethodLabel: string | null
  createdAt: string
  paidAt: string | null
  proofOfPaymentDataUrl: string
  proofUploadedAt: string | null
}

interface EditableSubscription {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  billingCycle: BillingCycle
  seatCount: number
  pricePerSeat: number
}

const EMPTY_NEW_METHOD = {
  code: '',
  label: '',
  type: 'OTHER' as PaymentMethodType,
  bankName: '',
  accountName: '',
  accountNumber: '',
  instructions: '',
  qrImageUrl: '',
  sortOrder: 100,
  isActive: true,
}

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SystemAdminPage() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<AdminTab>('companies')
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>('TRIAL')

  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [editableSubs, setEditableSubs] = useState<Record<string, EditableSubscription>>({})

  const [payments, setPayments] = useState<SubmittedPayment[]>([])
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null)

  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [newMethod, setNewMethod] = useState(EMPTY_NEW_METHOD)
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null)
  const [savingMethodId, setSavingMethodId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [companiesRes, methodsRes, paymentsRes] = await Promise.all([
        fetch('/api/admin/companies'),
        fetch('/api/admin/payment-methods'),
        fetch('/api/admin/payments'),
      ])
      if (!companiesRes.ok || !methodsRes.ok || !paymentsRes.ok) {
        throw new Error('Access denied or failed to load system admin data.')
      }

      const companiesPayload = await companiesRes.json()
      const methodsPayload = await methodsRes.json()
      const paymentsPayload = await paymentsRes.json()

      setCompanies(companiesPayload.companies ?? [])
      setMethods(methodsPayload.methods ?? [])
      setPayments(paymentsPayload.payments ?? [])

      const nextEditable: Record<string, EditableSubscription> = {}
      for (const company of (companiesPayload.companies ?? [])) {
        const sub = company.subscription
        nextEditable[company.id] = {
          plan: sub?.plan ?? 'TRIAL',
          status: sub?.status ?? 'TRIAL',
          billingCycle: sub?.billingCycle ?? null,
          seatCount: sub?.seatCount ?? company.activeEmployees,
          pricePerSeat: sub?.pricePerSeat ?? 50,
        }
      }
      setEditableSubs(nextEditable)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load system admin data.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const rawTab = searchParams.get('tab')
    if (rawTab === 'companies' || rawTab === 'subscriptions' || rawTab === 'payments') {
      setTab(rawTab)
      return
    }
    setTab('companies')
  }, [searchParams])

  const filteredSubscriptions = useMemo(() => {
    return companies.filter((company) => company.subscription?.status === subscriptionFilter)
  }, [companies, subscriptionFilter])

  const summary = useMemo(() => {
    const activeCompanies = companies.filter((company) => company.isActive).length
    const activeSubs = companies.filter((company) => company.subscription?.status === 'ACTIVE').length
    const unpaidInvoices = companies.reduce((sum, company) => sum + company.unpaidCount, 0)
    const paidTotal = companies.reduce((sum, company) => sum + company.paidTotal, 0)
    return { activeCompanies, activeSubs, unpaidInvoices, paidTotal }
  }, [companies])

  async function setCompanyActive(companyId: string, isActive: boolean) {
    try {
      setSavingCompanyId(companyId)
      const res = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error('Failed to update company status.')
      setCompanies((prev) => prev.map((company) => company.id === companyId ? { ...company, isActive } : company))
      toast.success('Company status updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update company status.')
    } finally {
      setSavingCompanyId(null)
    }
  }

  async function saveSubscription(companyId: string) {
    const editable = editableSubs[companyId]
    if (!editable) return
    try {
      setSavingCompanyId(companyId)
      const res = await fetch(`/api/admin/companies/${companyId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editable),
      })
      if (!res.ok) throw new Error('Failed to update subscription.')
      const payload = await res.json()
      setCompanies((prev) =>
        prev.map((company) =>
          company.id === companyId
            ? { ...company, subscription: payload.subscription }
            : company
        )
      )
      toast.success('Subscription updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update subscription.')
    } finally {
      setSavingCompanyId(null)
    }
  }

  async function updatePaymentStatus(invoiceId: string, status: 'PAID' | 'UNPAID' | 'VOID') {
    try {
      setUpdatingPaymentId(invoiceId)
      const res = await fetch(`/api/admin/payments/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update payment status.')
      setPayments((prev) =>
        prev.map((payment) =>
          payment.id === invoiceId
            ? { ...payment, status, paidAt: status === 'PAID' ? new Date().toISOString() : null }
            : payment
        )
      )
      toast.success('Payment status updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payment status.')
    } finally {
      setUpdatingPaymentId(null)
    }
  }

  async function createMethod() {
    try {
      const res = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMethod,
          code: newMethod.code.trim().toUpperCase(),
          label: newMethod.label.trim(),
          bankName: newMethod.bankName || null,
          accountName: newMethod.accountName || null,
          accountNumber: newMethod.accountNumber || null,
          instructions: newMethod.instructions || null,
          qrImageUrl: newMethod.qrImageUrl || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create payment method.')
      const payload = await res.json()
      setMethods((prev) => [...prev, payload.method].sort((a, b) => a.sortOrder - b.sortOrder))
      setNewMethod(EMPTY_NEW_METHOD)
      toast.success('Payment method added.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create payment method.')
    }
  }

  async function saveMethod(method: PaymentMethod) {
    try {
      setSavingMethodId(method.id)
      const res = await fetch(`/api/admin/payment-methods/${method.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: method.label,
          type: method.type,
          bankName: method.bankName || null,
          accountName: method.accountName || null,
          accountNumber: method.accountNumber || null,
          instructions: method.instructions || null,
          qrImageUrl: method.qrImageUrl || null,
          sortOrder: method.sortOrder,
          isActive: method.isActive,
        }),
      })
      if (!res.ok) throw new Error('Failed to save payment method.')
      toast.success('Payment method saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save payment method.')
    } finally {
      setSavingMethodId(null)
    }
  }

  async function deleteMethod(methodId: string) {
    if (!window.confirm('Delete this payment method?')) return
    try {
      const res = await fetch(`/api/admin/payment-methods/${methodId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete payment method.')
      setMethods((prev) => prev.filter((method) => method.id !== methodId))
      toast.success('Payment method deleted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete payment method.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 font-semibold">System Control Panel</p>
          <h1 className="text-3xl font-black text-white mt-2">Admin Console</h1>
          <p className="text-sm text-slate-400 mt-1">Standalone management for companies, subscriptions, and billing operations.</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Active Companies</p>
              <p className="text-xl font-black text-white mt-1">{summary.activeCompanies}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Active Subscriptions</p>
              <p className="text-xl font-black text-white mt-1">{summary.activeSubs}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Unpaid Invoices</p>
              <p className="text-xl font-black text-amber-300 mt-1">{summary.unpaidInvoices}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Collected</p>
              <p className="text-xl font-black text-emerald-300 mt-1">{fmt(summary.paidTotal)}</p>
            </div>
          </div>
        </div>

        <div className="inline-flex rounded-xl border border-slate-700 p-1 bg-slate-900">
          <button onClick={() => setTab('companies')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'companies' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'}`}>Companies</button>
          <button onClick={() => setTab('subscriptions')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'subscriptions' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'}`}>Subscriptions</button>
          <button onClick={() => setTab('payments')} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'payments' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'}`}>Payments</button>
        </div>

      {tab === 'companies' && (
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-300" /> Companies
          </h2>
          <div className="space-y-3">
            {companies.map((company) => (
              <div key={company.id} className="border border-slate-800 bg-slate-950/70 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-slate-100">{company.name}</p>
                  <p className="text-xs text-slate-400">
                    {company.email || 'No email'} · {company.activeEmployees} employees · unpaid: {company.unpaidCount}
                  </p>
                  <p className="text-xs text-slate-400">Collected: {fmt(company.paidTotal)}</p>
                </div>
                <label className="text-xs text-slate-300 flex items-center gap-2">
                  Active
                  <input
                    type="checkbox"
                    checked={company.isActive}
                    onChange={(e) => setCompanyActive(company.id, e.target.checked)}
                    disabled={savingCompanyId === company.id}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'subscriptions' && (
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-cyan-300" /> Subscriptions
          </h2>

          <div className="inline-flex rounded-lg border border-slate-700 p-1 mb-4 bg-slate-950">
            <button onClick={() => setSubscriptionFilter('TRIAL')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${subscriptionFilter === 'TRIAL' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}>Trial</button>
            <button onClick={() => setSubscriptionFilter('ACTIVE')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${subscriptionFilter === 'ACTIVE' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}>Active</button>
            <button onClick={() => setSubscriptionFilter('EXPIRED')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${subscriptionFilter === 'EXPIRED' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}>Expired</button>
          </div>

          <div className="space-y-4">
            {filteredSubscriptions.map((company) => {
              const editable = editableSubs[company.id]
              return (
                <div key={company.id} className="border border-slate-800 bg-slate-950/70 rounded-xl p-4">
                  <p className="font-bold text-slate-100">{company.name}</p>
                  <p className="text-xs text-slate-400 mb-3">{company.email || 'No email'}</p>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <select className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={editable?.plan ?? 'TRIAL'} onChange={(e) => setEditableSubs((prev) => ({ ...prev, [company.id]: { ...prev[company.id], plan: e.target.value as SubscriptionPlan } }))}>
                      <option value="TRIAL">TRIAL</option>
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="ANNUAL">ANNUAL</option>
                    </select>
                    <select className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={editable?.status ?? 'TRIAL'} onChange={(e) => setEditableSubs((prev) => ({ ...prev, [company.id]: { ...prev[company.id], status: e.target.value as SubscriptionStatus } }))}>
                      <option value="TRIAL">TRIAL</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PAST_DUE">PAST_DUE</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                    <select className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={editable?.billingCycle ?? ''} onChange={(e) => setEditableSubs((prev) => ({ ...prev, [company.id]: { ...prev[company.id], billingCycle: (e.target.value || null) as BillingCycle } }))}>
                      <option value="">NO CYCLE</option>
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="ANNUAL">ANNUAL</option>
                    </select>
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" type="number" min={0} placeholder="Seats" value={editable?.seatCount ?? 0} onChange={(e) => setEditableSubs((prev) => ({ ...prev, [company.id]: { ...prev[company.id], seatCount: Number(e.target.value) || 0 } }))} />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" type="number" min={0} step={0.01} placeholder="Price/seat" value={editable?.pricePerSeat ?? 0} onChange={(e) => setEditableSubs((prev) => ({ ...prev, [company.id]: { ...prev[company.id], pricePerSeat: Number(e.target.value) || 0 } }))} />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button onClick={() => saveSubscription(company.id)} disabled={savingCompanyId === company.id} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-60">
                      {savingCompanyId === company.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save Subscription
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredSubscriptions.length === 0 && (
              <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-700 rounded-xl">
                No {subscriptionFilter.toLowerCase()} subscriptions.
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'payments' && (
        <section className="space-y-5">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-cyan-300" /> Payments History
            </h2>
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="border border-slate-800 bg-slate-950/70 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                  <div>
                    <p className="font-bold text-slate-100">{payment.invoiceNo}</p>
                    <p className="text-xs text-slate-400">{payment.company.name}</p>
                    <p className="text-xs text-slate-400">{format(new Date(payment.createdAt), 'MMM dd, yyyy hh:mm a')}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{fmt(payment.total)}</p>
                    <p className="text-xs text-slate-400">{payment.paymentMethodLabel ?? '—'}</p>
                    <p className="text-xs text-slate-400">Status: {payment.status}</p>
                  </div>
                  <div>
                    <img src={payment.proofOfPaymentDataUrl} alt="Proof of payment" className="w-24 h-24 rounded-lg border border-slate-700 object-cover bg-slate-900" />
                    {payment.proofUploadedAt && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Uploaded {format(new Date(payment.proofUploadedAt), 'MMM dd, yyyy hh:mm a')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 md:justify-end">
                    <button onClick={() => updatePaymentStatus(payment.id, 'PAID')} disabled={updatingPaymentId === payment.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white disabled:opacity-60">Mark Paid</button>
                    <button onClick={() => updatePaymentStatus(payment.id, 'VOID')} disabled={updatingPaymentId === payment.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-100 disabled:opacity-60">Void</button>
                  </div>
                </div>
              ))}
              {payments.length === 0 && (
                <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-700 rounded-xl">
                  No submitted payments with proof yet.
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-cyan-300" /> Payment Settings
            </h2>

            <div className="border border-slate-800 bg-slate-950/70 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-3">Add Payment Method</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" placeholder="CODE (e.g. MAYA_MAIN)" value={newMethod.code} onChange={(e) => setNewMethod((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} />
                <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" placeholder="Label" value={newMethod.label} onChange={(e) => setNewMethod((prev) => ({ ...prev, label: e.target.value }))} />
                <select className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={newMethod.type} onChange={(e) => setNewMethod((prev) => ({ ...prev, type: e.target.value as PaymentMethodType }))}>
                  <option value="GCASH">GCASH</option>
                  <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                  <option value="E_WALLET">E_WALLET</option>
                  <option value="OTHER">OTHER</option>
                </select>
                <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" type="number" min={0} value={newMethod.sortOrder} onChange={(e) => setNewMethod((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 100 }))} placeholder="Sort order" />
                <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" placeholder="Bank name (optional)" value={newMethod.bankName} onChange={(e) => setNewMethod((prev) => ({ ...prev, bankName: e.target.value }))} />
                <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" placeholder="Account name (optional)" value={newMethod.accountName} onChange={(e) => setNewMethod((prev) => ({ ...prev, accountName: e.target.value }))} />
                <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" placeholder="Account number (optional)" value={newMethod.accountNumber} onChange={(e) => setNewMethod((prev) => ({ ...prev, accountNumber: e.target.value }))} />
                <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" placeholder="QR image URL (optional)" value={newMethod.qrImageUrl} onChange={(e) => setNewMethod((prev) => ({ ...prev, qrImageUrl: e.target.value }))} />
              </div>
              <textarea className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" rows={2} placeholder="Instructions (optional)" value={newMethod.instructions} onChange={(e) => setNewMethod((prev) => ({ ...prev, instructions: e.target.value }))} />
              <div className="mt-3 flex justify-end">
                <button onClick={createMethod} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 text-white px-3 py-2 text-xs font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Add Method
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {methods.map((method) => (
                <div key={method.id} className="border border-slate-800 bg-slate-950/70 rounded-xl p-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300" value={method.code} disabled />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={method.label} onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, label: e.target.value } : row))} />
                    <select className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={method.type} onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, type: e.target.value as PaymentMethodType } : row))}>
                      <option value="GCASH">GCASH</option>
                      <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                      <option value="E_WALLET">E_WALLET</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" type="number" min={0} value={method.sortOrder} onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, sortOrder: Number(e.target.value) || 0 } : row))} />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={method.bankName ?? ''} placeholder="Bank name" onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, bankName: e.target.value } : row))} />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={method.accountName ?? ''} placeholder="Account name" onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, accountName: e.target.value } : row))} />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={method.accountNumber ?? ''} placeholder="Account number" onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, accountNumber: e.target.value } : row))} />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" value={method.qrImageUrl ?? ''} placeholder="QR image URL" onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, qrImageUrl: e.target.value } : row))} />
                  </div>
                  <textarea className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm" rows={2} value={method.instructions ?? ''} onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, instructions: e.target.value } : row))} />
                  <div className="mt-3 flex items-center justify-between">
                    <label className="text-xs text-slate-300 flex items-center gap-2">
                      Active
                      <input type="checkbox" checked={method.isActive} onChange={(e) => setMethods((prev) => prev.map((row) => row.id === method.id ? { ...row, isActive: e.target.checked } : row))} />
                    </label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveMethod(method)} disabled={savingMethodId === method.id} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-60">
                        {savingMethodId === method.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </button>
                      <button onClick={() => deleteMethod(method.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 text-red-600 px-3 py-2 text-xs font-semibold">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      </div>
    </div>
  )
}


