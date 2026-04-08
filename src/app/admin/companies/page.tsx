'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Loader2, Users, FileText, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

type SubscriptionPlan = 'TRIAL' | 'MONTHLY' | 'ANNUAL'
type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
type BillingCycle = 'MONTHLY' | 'ANNUAL' | null

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

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  TRIAL: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  ACTIVE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  PAST_DUE: 'bg-red-500/10 text-red-300 border-red-500/20',
  CANCELLED: 'bg-slate-500/10 text-slate-400 border-slate-600',
  EXPIRED: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/companies')
      if (!res.ok) throw new Error('Access denied')
      const data = await res.json()
      setCompanies(data.companies ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load companies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function setCompanyActive(id: string, isActive: boolean) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, isActive } : c))
      toast.success(`Company ${isActive ? 'activated' : 'deactivated'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  const summary = useMemo(() => ({
    total: companies.length,
    active: companies.filter(c => c.isActive).length,
    totalEmployees: companies.reduce((s, c) => s + c.activeEmployees, 0),
    collected: companies.reduce((s, c) => s + c.paidTotal, 0),
  }), [companies])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return companies.filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q)
    )
  }, [companies, search])

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-400/70 font-semibold">System Admin</p>
        <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-cyan-400" /> Companies
        </h1>
        <p className="text-sm text-slate-400 mt-1">Manage all registered companies and their status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: summary.total, color: 'text-slate-100' },
          { label: 'Active', value: summary.active, color: 'text-emerald-300' },
          { label: 'Employees', value: summary.totalEmployees, color: 'text-cyan-300' },
          { label: 'Collected', value: fmt(summary.collected), color: 'text-amber-300' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">{stat.label}</p>
            <p className={`text-xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 text-slate-100 px-4 py-2 text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
      />

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">No companies found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Company</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Subscription</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Employees</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Unpaid</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Collected</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(company => (
                <tr key={company.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-100">{company.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{company.email ?? '—'}</p>
                    {company.subscription?.trialEndsAt && (
                      <p className="text-[11px] text-amber-400/70 mt-0.5">
                        Trial ends {format(new Date(company.subscription.trialEndsAt), 'MMM dd, yyyy')}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    {company.subscription ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[company.subscription.status]}`}>
                        {company.subscription.status}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">No subscription</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1 text-slate-300">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {company.activeEmployees}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right hidden lg:table-cell">
                    {company.unpaidCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <FileText className="w-3.5 h-3.5" />
                        {company.unpaidCount}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right hidden xl:table-cell">
                    <span className="text-emerald-300 font-medium">{fmt(company.paidTotal)}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setCompanyActive(company.id, !company.isActive)}
                      disabled={savingId === company.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                        company.isActive
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {savingId === company.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : company.isActive
                          ? <><CheckCircle className="w-3.5 h-3.5" /> Active</>
                          : <><XCircle className="w-3.5 h-3.5" /> Inactive</>
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
