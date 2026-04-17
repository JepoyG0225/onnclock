'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, Users, FileText, CheckCircle, XCircle, Eye } from 'lucide-react'
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
  return 'PHP ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const THEME = {
  deep: '#FFFFFF',
  base: '#E2E8F0',
  mid: '#64748B',
  soft: '#334155',
  light: '#0F172A',
} as const

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  TRIAL: 'text-amber-700 border-amber-200 bg-amber-50',
  ACTIVE: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  PAST_DUE: 'text-orange-700 border-orange-200 bg-orange-50',
  CANCELLED: 'text-rose-700 border-rose-200 bg-rose-50',
  EXPIRED: 'text-slate-700 border-slate-200 bg-slate-100',
}

export default function AdminCompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
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

  useEffect(() => {
    load()
  }, [load])

  async function viewAsCompany(id: string) {
    setViewingId(id)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: id }),
      })
      if (!res.ok) throw new Error('Failed to impersonate')
      router.push('/dashboard')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to view company')
      setViewingId(null)
    }
  }

  async function setCompanyActive(id: string, isActive: boolean) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setCompanies(prev => prev.map(c => (c.id === id ? { ...c, isActive } : c)))
      toast.success(`Company ${isActive ? 'activated' : 'deactivated'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  const summary = useMemo(
    () => ({
      total: companies.length,
      active: companies.filter(c => c.isActive).length,
      totalEmployees: companies.reduce((s, c) => s + c.activeEmployees, 0),
      collected: companies.reduce((s, c) => s + c.paidTotal, 0),
    }),
    [companies]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return companies.filter(
      c => !q || c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q)
    )
  }, [companies, search])

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: THEME.mid }}>
          System Admin
        </p>
        <h1 className="text-2xl font-black mt-1 flex items-center gap-2" style={{ color: THEME.light }}>
          <Building2 className="w-6 h-6" style={{ color: THEME.soft }} /> Companies
        </h1>
        <p className="text-sm mt-1" style={{ color: THEME.mid }}>
          Manage all registered companies and their status
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: summary.total, color: THEME.light },
          { label: 'Active', value: summary.active, color: THEME.soft },
          { label: 'Employees', value: summary.totalEmployees, color: THEME.soft },
          { label: 'Collected', value: fmt(summary.collected), color: THEME.light },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl border p-4"
            style={{ borderColor: THEME.base, background: THEME.deep }}
          >
            <p className="text-[11px] uppercase tracking-wide" style={{ color: THEME.mid }}>
              {stat.label}
            </p>
            <p className="text-xl font-black mt-1" style={{ color: stat.color }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full max-w-sm rounded-xl border px-4 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        style={{
          borderColor: THEME.base,
          background: THEME.deep,
          color: THEME.light,
        }}
      />

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: THEME.base, background: THEME.deep }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: THEME.soft }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: THEME.mid }}>
            No companies found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: THEME.base }}>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.mid }}>Company</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: THEME.mid }}>Subscription</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide hidden lg:table-cell" style={{ color: THEME.mid }}>Employees</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide hidden lg:table-cell" style={{ color: THEME.mid }}>Unpaid</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide hidden xl:table-cell" style={{ color: THEME.mid }}>Collected</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.mid }}>Status</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.mid }}>Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: `${THEME.base}CC` }}>
              {filtered.map(company => (
                <tr key={company.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold" style={{ color: THEME.light }}>{company.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: THEME.mid }}>{company.email ?? '-'}</p>
                    {company.subscription?.trialEndsAt && (
                      <p className="text-[11px] mt-0.5" style={{ color: THEME.soft }}>
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
                      <span className="text-xs" style={{ color: THEME.mid }}>No subscription</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1" style={{ color: THEME.soft }}>
                      <Users className="w-3.5 h-3.5" style={{ color: THEME.mid }} />
                      {company.activeEmployees}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right hidden lg:table-cell">
                    {company.unpaidCount > 0 ? (
                      <span className="inline-flex items-center gap-1" style={{ color: THEME.soft }}>
                        <FileText className="w-3.5 h-3.5" />
                        {company.unpaidCount}
                      </span>
                    ) : (
                      <span style={{ color: THEME.mid }}>-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right hidden xl:table-cell">
                    <span className="font-medium" style={{ color: THEME.light }}>{fmt(company.paidTotal)}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setCompanyActive(company.id, !company.isActive)}
                      disabled={savingId === company.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                        company.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {savingId === company.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : company.isActive ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" /> Active
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" /> Inactive
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => viewAsCompany(company.id)}
                      disabled={viewingId === company.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:bg-slate-100 disabled:opacity-50"
                      style={{ borderColor: THEME.base, background: '#fff', color: THEME.soft }}
                    >
                      {viewingId === company.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" /> View
                        </>
                      )}
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
