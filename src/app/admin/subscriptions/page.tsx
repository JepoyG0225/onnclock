'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

type SubscriptionPlan = 'TRIAL' | 'MONTHLY' | 'ANNUAL'
type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
type BillingCycle = 'MONTHLY' | 'ANNUAL' | null
type FilterTab = 'ALL' | 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'PAST_DUE' | 'CANCELLED'

interface CompanyRow {
  id: string
  name: string
  email: string | null
  isActive: boolean
  activeEmployees: number
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

interface EditableSubscription {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  billingCycle: BillingCycle
  seatCount: number
  pricePerSeat: number
}

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  TRIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAST_DUE: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200',
  EXPIRED: 'bg-slate-100 text-slate-700 border-slate-200',
}

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'TRIAL', label: 'Trial' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'PAST_DUE', label: 'Past Due' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

export default function AdminSubscriptionsPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [editableSubs, setEditableSubs] = useState<Record<string, EditableSubscription>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [sendingExpiredTrialEmails, setSendingExpiredTrialEmails] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/companies')
      if (!res.ok) throw new Error('Access denied')
      const data = await res.json()
      const list: CompanyRow[] = data.companies ?? []
      setCompanies(list)
      const nextEditable: Record<string, EditableSubscription> = {}
      for (const c of list) {
        nextEditable[c.id] = {
          plan: c.subscription?.plan ?? 'TRIAL',
          status: c.subscription?.status ?? 'TRIAL',
          billingCycle: c.subscription?.billingCycle ?? null,
          seatCount: c.subscription?.seatCount ?? c.activeEmployees,
          pricePerSeat: c.subscription?.pricePerSeat ?? 50,
        }
      }
      setEditableSubs(nextEditable)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveSubscription(companyId: string) {
    const editable = editableSubs[companyId]
    if (!editable) return
    setSavingId(companyId)
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editable),
      })
      if (!res.ok) throw new Error('Failed to update subscription')
      const payload = await res.json()
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, subscription: payload.subscription } : c))
      toast.success('Subscription updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  async function sendExpiredTrialEmails() {
    setSendingExpiredTrialEmails(true)
    try {
      const res = await fetch('/api/admin/subscriptions/expired-trial-email', {
        method: 'POST',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Failed to send expired trial emails')
      }

      const summary = payload?.summary as { totalExpiredTrials: number; sent: number; skipped: number; failed: number } | undefined
      if (!summary) {
        toast.success('Expired trial emails sent')
        return
      }

      toast.success(
        `Expired trials: ${summary.totalExpiredTrials} | Sent: ${summary.sent} | Skipped: ${summary.skipped} | Failed: ${summary.failed}`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send expired trial emails')
    } finally {
      setSendingExpiredTrialEmails(false)
    }
  }

  const summary = useMemo(() => ({
    trial: companies.filter(c => c.subscription?.status === 'TRIAL').length,
    active: companies.filter(c => c.subscription?.status === 'ACTIVE').length,
    pastDue: companies.filter(c => c.subscription?.status === 'PAST_DUE').length,
    expired: companies.filter(c => c.subscription?.status === 'EXPIRED' || c.subscription?.status === 'CANCELLED').length,
  }), [companies])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return companies
    return companies.filter(c => c.subscription?.status === filter)
  }, [companies, filter])

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">System Admin</p>
        <h1 className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-slate-600" /> Subscriptions
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage plans, billing cycles, and account status per company.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Trial', value: summary.trial, accent: 'text-amber-700' },
          { label: 'Active', value: summary.active, accent: 'text-emerald-700' },
          { label: 'Past Due', value: summary.pastDue, accent: 'text-rose-700' },
          { label: 'Expired/Cancelled', value: summary.expired, accent: 'text-slate-700' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-black mt-1 ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 p-1 rounded-xl border border-slate-200 bg-white w-fit">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={sendExpiredTrialEmails}
          disabled={sendingExpiredTrialEmails}
          className="inline-flex items-center gap-2 rounded-lg bg-[#fa5e01] hover:bg-[#e65500] text-white px-4 py-2 text-xs font-semibold disabled:opacity-60 transition-colors"
        >
          {sendingExpiredTrialEmails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
          Send Expired Trial Emails
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500 text-sm">
          No subscriptions for this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(company => {
            const editable = editableSubs[company.id]
            if (!editable) return null
            return (
              <div key={company.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{company.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{company.email ?? '—'} · {company.activeEmployees} employees</p>
                    {company.subscription?.trialEndsAt && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        Trial ends: {format(new Date(company.subscription.trialEndsAt), 'MMM dd, yyyy')}
                      </p>
                    )}
                    {company.subscription?.currentPeriodEnd && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Period ends: {format(new Date(company.subscription.currentPeriodEnd), 'MMM dd, yyyy')}
                      </p>
                    )}
                  </div>
                  {company.subscription && (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[company.subscription.status]}`}>
                      {company.subscription.status}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Plan</label>
                    <select
                      value={editable.plan}
                      onChange={e => setEditableSubs(prev => ({ ...prev, [company.id]: { ...prev[company.id], plan: e.target.value as SubscriptionPlan } }))}
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                    >
                      <option value="TRIAL">TRIAL</option>
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="ANNUAL">ANNUAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Status</label>
                    <select
                      value={editable.status}
                      onChange={e => setEditableSubs(prev => ({ ...prev, [company.id]: { ...prev[company.id], status: e.target.value as SubscriptionStatus } }))}
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                    >
                      <option value="TRIAL">TRIAL</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PAST_DUE">PAST_DUE</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Billing Cycle</label>
                    <select
                      value={editable.billingCycle ?? ''}
                      onChange={e => setEditableSubs(prev => ({ ...prev, [company.id]: { ...prev[company.id], billingCycle: (e.target.value || null) as BillingCycle } }))}
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                    >
                      <option value="">None</option>
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="ANNUAL">ANNUAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Seats</label>
                    <input
                      type="number"
                      min={0}
                      value={editable.seatCount}
                      onChange={e => setEditableSubs(prev => ({ ...prev, [company.id]: { ...prev[company.id], seatCount: Number(e.target.value) || 0 } }))}
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Price/Seat (PHP)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={editable.pricePerSeat}
                      onChange={e => setEditableSubs(prev => ({ ...prev, [company.id]: { ...prev[company.id], pricePerSeat: Number(e.target.value) || 0 } }))}
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Monthly revenue: <span className="text-slate-900 font-semibold">PHP {((editable.seatCount * editable.pricePerSeat) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </p>
                  <button
                    onClick={() => saveSubscription(company.id)}
                    disabled={savingId === company.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-xs font-semibold disabled:opacity-60 transition-colors"
                  >
                    {savingId === company.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
