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
  TRIAL: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  ACTIVE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  PAST_DUE: 'bg-red-500/10 text-red-300 border-red-500/20',
  CANCELLED: 'bg-slate-700/50 text-slate-400 border-slate-600',
  EXPIRED: 'bg-red-500/10 text-red-400 border-red-500/20',
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
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[#C0C8CA]/70 font-semibold">System Admin</p>
        <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-[#C0C8CA]" /> Subscriptions
        </h1>
        <p className="text-sm text-slate-400 mt-1">Manage plans, billing cycles and subscription status per company</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Trial', value: summary.trial, color: 'text-amber-300' },
          { label: 'Active', value: summary.active, color: 'text-emerald-300' },
          { label: 'Past Due', value: summary.pastDue, color: 'text-red-300' },
          { label: 'Expired/Cancelled', value: summary.expired, color: 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 p-1 rounded-xl border border-slate-800 bg-slate-900 w-fit">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-[#2E4156] text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#C0C8CA]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-slate-500 text-sm">
          No subscriptions for this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(company => {
            const editable = editableSubs[company.id]
            if (!editable) return null
            return (
              <div key={company.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-bold text-slate-100">{company.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{company.email ?? '—'} · {company.activeEmployees} employees</p>
                    {company.subscription?.trialEndsAt && (
                      <p className="text-[11px] text-amber-400/80 mt-1">
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
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-[#2E4156]"
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
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-[#2E4156]"
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
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-[#2E4156]"
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
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-[#2E4156]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Price/Seat (₱)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={editable.pricePerSeat}
                      onChange={e => setEditableSubs(prev => ({ ...prev, [company.id]: { ...prev[company.id], pricePerSeat: Number(e.target.value) || 0 } }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-[#2E4156]"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Monthly revenue: <span className="text-emerald-300 font-semibold">₱{((editable.seatCount * editable.pricePerSeat) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </p>
                  <button
                    onClick={() => saveSubscription(company.id)}
                    disabled={savingId === company.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#2E4156] hover:bg-[#2E4156] text-white px-4 py-2 text-xs font-semibold disabled:opacity-60 transition-colors"
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

