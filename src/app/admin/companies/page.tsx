'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Loader2, Users, FileText, CheckCircle, XCircle, Eye,
  Mail, AlertCircle, ChevronDown, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

type SubscriptionPlan = 'TRIAL' | 'MONTHLY' | 'ANNUAL'
type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
type BillingCycle = 'MONTHLY' | 'ANNUAL' | null
type DemoStatus =
  | 'NOT_CONTACTED'
  | 'EMAIL_SENT'
  | 'DEMO_REQUESTED'
  | 'DEMO_SCHEDULED'
  | 'DEMO_COMPLETED'
  | 'NO_SHOW'
  | 'NOT_INTERESTED'

interface CompanyRow {
  id: string
  name: string
  email: string | null
  isActive: boolean
  demoStatus: DemoStatus
  demoEmailSentAt: string | null
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

const DEMO_STATUS_OPTIONS: { value: DemoStatus; label: string; color: string }[] = [
  { value: 'NOT_CONTACTED',  label: 'Not Contacted',   color: 'text-slate-600 bg-slate-100 border-slate-200' },
  { value: 'EMAIL_SENT',     label: 'Email Sent',      color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 'DEMO_REQUESTED', label: 'Demo Requested',  color: 'text-violet-700 bg-violet-50 border-violet-200' },
  { value: 'DEMO_SCHEDULED', label: 'Demo Scheduled',  color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'DEMO_COMPLETED', label: 'Demo Completed',  color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { value: 'NO_SHOW',        label: 'No Show',         color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'NOT_INTERESTED', label: 'Not Interested',  color: 'text-rose-700 bg-rose-50 border-rose-200' },
]

function demoStatusMeta(s: DemoStatus) {
  return DEMO_STATUS_OPTIONS.find(o => o.value === s) ?? DEMO_STATUS_OPTIONS[0]
}

type FilterTab = 'all' | 'no-employees'

export default function AdminCompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null)
  const [updatingDemoId, setUpdatingDemoId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

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
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, isActive } : c))
      toast.success(`Company ${isActive ? 'activated' : 'deactivated'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  async function updateDemoStatus(id: string, demoStatus: DemoStatus) {
    setUpdatingDemoId(id)
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoStatus }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, demoStatus } : c))
      toast.success('Demo status updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update demo status')
    } finally {
      setUpdatingDemoId(null)
    }
  }

  async function sendDemoEmail(company: CompanyRow) {
    if (!company.email) {
      toast.error('This company has no email address on file.')
      return
    }
    setSendingEmailId(company.id)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/send-demo-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to send email')
      }
      setCompanies(prev => prev.map(c =>
        c.id === company.id
          ? { ...c, demoStatus: 'EMAIL_SENT', demoEmailSentAt: new Date().toISOString() }
          : c
      ))
      toast.success(`Demo email sent to ${company.email}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send email')
    } finally {
      setSendingEmailId(null)
    }
  }

  const summary = useMemo(() => ({
    total: companies.length,
    active: companies.filter(c => c.isActive).length,
    noEmployees: companies.filter(c => c.activeEmployees === 0).length,
    collected: companies.reduce((s, c) => s + c.paidTotal, 0),
  }), [companies])

  const filtered = useMemo(() => {
    let list = companies
    if (tab === 'no-employees') list = list.filter(c => c.activeEmployees === 0)
    const q = search.toLowerCase()
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q))
    return list
  }, [companies, search, tab])

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: THEME.mid }}>
            System Admin
          </p>
          <h1 className="text-2xl font-black mt-1 flex items-center gap-2" style={{ color: THEME.light }}>
            <Building2 className="w-6 h-6" style={{ color: THEME.soft }} /> Companies
          </h1>
          <p className="text-sm mt-1" style={{ color: THEME.mid }}>
            Manage all registered companies, track demo outreach, and monitor status
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing || loading}
          title="Refresh companies list"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors hover:bg-slate-50 disabled:opacity-50 mt-1"
          style={{ borderColor: THEME.base, background: '#fff', color: THEME.soft }}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: summary.total, color: THEME.light },
          { label: 'Active', value: summary.active, color: THEME.soft },
          { label: 'No Employees', value: summary.noEmployees, color: '#d97706' },
          { label: 'Collected', value: fmt(summary.collected), color: THEME.light },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border p-4" style={{ borderColor: THEME.base, background: THEME.deep }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: THEME.mid }}>{stat.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border overflow-hidden text-xs font-semibold" style={{ borderColor: THEME.base }}>
          {([
            { key: 'all', label: 'All Companies' },
            { key: 'no-employees', label: `No Employees (${summary.noEmployees})` },
          ] as { key: FilterTab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 transition-colors ${tab === t.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 min-w-[200px] max-w-xs rounded-xl border px-4 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          style={{ borderColor: THEME.base, background: THEME.deep, color: THEME.light }}
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: THEME.base, background: THEME.deep }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: THEME.soft }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: THEME.mid }}>No companies found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: THEME.base }}>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.mid }}>Company</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: THEME.mid }}>Subscription</th>
                <th className="text-center px-5 py-3 text-[11px] font-semibold uppercase tracking-wide hidden lg:table-cell" style={{ color: THEME.mid }}>Employees</th>
                <th className="text-center px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.mid }}>Demo Status</th>
                <th className="text-center px-5 py-3 text-[11px] font-semibold uppercase tracking-wide hidden xl:table-cell" style={{ color: THEME.mid }}>Outreach</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.mid }}>Active</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.mid }}>Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: `${THEME.base}CC` }}>
              {filtered.map(company => {
                const meta = demoStatusMeta(company.demoStatus)
                const noEmployees = company.activeEmployees === 0
                return (
                  <tr key={company.id} className={`transition-colors hover:bg-slate-50 ${noEmployees ? 'bg-amber-50/30' : ''}`}>

                    {/* Company */}
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        {noEmployees && (
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-semibold" style={{ color: THEME.light }}>{company.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: THEME.mid }}>{company.email ?? '—'}</p>
                          {company.subscription?.trialEndsAt && (
                            <p className="text-[11px] mt-0.5" style={{ color: THEME.soft }}>
                              Trial ends {format(new Date(company.subscription.trialEndsAt), 'MMM dd, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Subscription */}
                    <td className="px-5 py-4 hidden md:table-cell">
                      {company.subscription ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[company.subscription.status]}`}>
                          {company.subscription.status}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: THEME.mid }}>No subscription</span>
                      )}
                    </td>

                    {/* Employees */}
                    <td className="px-5 py-4 text-center hidden lg:table-cell">
                      <span className={`inline-flex items-center gap-1 font-medium ${noEmployees ? 'text-amber-600' : ''}`} style={{ color: noEmployees ? undefined : THEME.soft }}>
                        <Users className="w-3.5 h-3.5" />
                        {company.activeEmployees}
                      </span>
                    </td>

                    {/* Demo status dropdown */}
                    <td className="px-5 py-4 text-center">
                      <div className="relative inline-block">
                        <select
                          value={company.demoStatus}
                          disabled={updatingDemoId === company.id}
                          onChange={e => updateDemoStatus(company.id, e.target.value as DemoStatus)}
                          className={`appearance-none pl-2.5 pr-6 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-opacity disabled:opacity-50 ${meta.color}`}
                          style={{ backgroundImage: 'none' }}
                        >
                          {DEMO_STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                      </div>
                    </td>

                    {/* Send demo email button */}
                    <td className="px-5 py-4 text-center hidden xl:table-cell">
                      <button
                        onClick={() => sendDemoEmail(company)}
                        disabled={sendingEmailId === company.id || !company.email}
                        title={!company.email ? 'No email address on file' : company.demoEmailSentAt ? `Last sent ${format(new Date(company.demoEmailSentAt), 'MMM dd')}` : 'Send demo outreach email'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 hover:bg-blue-50 border-blue-200 text-blue-700 bg-white"
                      >
                        {sendingEmailId === company.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Mail className="w-3.5 h-3.5" />}
                        {company.demoEmailSentAt ? 'Resend' : 'Send Email'}
                      </button>
                      {company.demoEmailSentAt && (
                        <p className="text-[10px] mt-1" style={{ color: THEME.mid }}>
                          {format(new Date(company.demoEmailSentAt), 'MMM dd, yyyy')}
                        </p>
                      )}
                    </td>

                    {/* Active toggle */}
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
                          <><CheckCircle className="w-3.5 h-3.5" /> Active</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5" /> Inactive</>
                        )}
                      </button>
                    </td>

                    {/* Preview */}
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => viewAsCompany(company.id)}
                        disabled={viewingId === company.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:bg-slate-100 disabled:opacity-50"
                        style={{ borderColor: THEME.base, background: '#fff', color: THEME.soft }}
                      >
                        {viewingId === company.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <><Eye className="w-3.5 h-3.5" /> View</>}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
