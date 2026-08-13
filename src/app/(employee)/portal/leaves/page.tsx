'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { FileText, Plus, Clock, CalendarDays } from 'lucide-react'
import Link from 'next/link'

interface LeaveBalance {
  id: string
  year: number
  entitled: number
  used: number
  pending: number
  balance: number
  carriedOver: number
  leaveType: { name: string; code: string; isWithPay: boolean }
}

interface LeaveRequest {
  id: string
  startDate: string
  endDate: string
  totalDays: number
  reason: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  createdAt: string
  reviewedAt: string | null
  reviewNotes: string | null
  leaveType: { name: string; code: string }
}

const NAVY = '#032b63'
const ORANGE = '#ff5900'

/** Status colours: `bar` drives the card's left stripe, bg/fg the chip. */
const STATUS_TONE: Record<string, { bar: string; bg: string; fg: string }> = {
  PENDING:   { bar: '#f59e0b', bg: '#fffbeb', fg: '#b45309' },
  APPROVED:  { bar: '#10b981', bg: '#ecfdf5', fg: '#047857' },
  REJECTED:  { bar: '#ef4444', bg: '#fef2f2', fg: '#b91c1c' },
  CANCELLED: { bar: '#cbd5e1', bg: '#f8fafc', fg: '#64748b' },
}

export default function LeavesPage() {
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'balances' | 'requests'>('balances')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [balRes, reqRes] = await Promise.all([
          fetch('/api/leaves?own=true&limit=1'),
          fetch('/api/leaves?own=true&limit=20'),
        ])
        const balData = await balRes.json()
        const reqData = await reqRes.json()
        setBalances(balData.balances ?? [])
        setRequests(reqData.leaves ?? reqData.requests ?? [])
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])


  const safeNumber = (value: unknown) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }

  // Totals for the summary strip. Only paid types count toward "days available"
  // — unpaid leave has no balance worth advertising as a number.
  const paid = balances.filter(b => b.leaveType.isWithPay)
  const totalRemaining = paid.reduce((s, b) => {
    const entitled = Math.max(0, safeNumber(b.entitled))
    const carried  = Math.max(0, safeNumber(b.carriedOver))
    const used     = Math.max(0, safeNumber(b.used))
    const pend     = Math.max(0, safeNumber(b.pending))
    const fallback = entitled + carried - used - pend
    return s + Math.max(0, Number.isFinite(Number(b.balance)) ? Number(b.balance) : fallback)
  }, 0)
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] lg:text-2xl font-black tracking-tight" style={{ color: NAVY }}>
            My Leaves
          </h1>
          <p className="text-[13px] text-slate-400 font-semibold mt-0.5">
            {loading
              ? 'Loading…'
              : `${totalRemaining.toFixed(1)} day${totalRemaining === 1 ? '' : 's'} available${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`}
          </p>
        </div>
        <Link
          href="/portal/leaves/new"
          className="inline-flex items-center gap-1.5 text-white px-4 py-2.5 rounded-2xl text-[13px] font-black shrink-0 active:scale-[0.98] transition-transform"
          style={{ background: ORANGE, boxShadow: '0 8px 20px rgba(255,89,0,0.28)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.6} />
          File leave
        </Link>
      </header>

      {/* Tabs — same pill treatment as the tasks page filters */}
      <div className="flex items-center gap-2">
        {([
          { id: 'balances', label: 'Balances' },
          { id: 'requests', label: 'Requests' },
        ] as const).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`text-[12px] font-black px-3.5 py-1.5 rounded-full border transition-colors ${
              tab === t.id ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200'
            }`}
            style={tab === t.id ? { background: NAVY } : undefined}
          >
            {t.label}
            {t.id === 'requests' && pendingCount > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                  tab === t.id ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Balances ─────────────────────────────────────────────────────── */}
      <div style={{ display: tab === 'balances' ? 'block' : 'none' }}>
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/70 rounded-2xl animate-pulse" />)}
          </div>
        ) : balances.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-base font-black text-slate-900">No leave types yet</p>
            <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
              Your admin hasn’t set up leave types for your company.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {balances.map(lb => {
              const entitled = Math.max(0, safeNumber(lb.entitled))
              const used = Math.max(0, safeNumber(lb.used))
              const pending = Math.max(0, safeNumber(lb.pending))
              const carried = Math.max(0, safeNumber(lb.carriedOver))
              const computedRemaining = entitled + carried - used - pending
              const remaining = Math.max(0, Number.isFinite(Number(lb.balance)) ? Number(lb.balance) : computedRemaining)
              const total = entitled + carried
              const pct = total > 0 ? Math.min(100, (remaining / total) * 100) : 0
              // Bar turns amber once a type is nearly spent, so a low balance is
              // visible without reading the numbers.
              const low = total > 0 && pct <= 20
              return (
                <div
                  key={lb.id}
                  className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {lb.leaveType.code}
                        </span>
                        {!lb.leaveType.isWithPay && (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                            Unpaid
                          </span>
                        )}
                      </div>
                      <p className="text-[14px] font-bold text-slate-900 truncate">{lb.leaveType.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-black leading-none tabular-nums" style={{ color: low ? '#b45309' : NAVY }}>
                        {remaining.toFixed(1)}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">days left</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, background: low ? '#f59e0b' : ORANGE }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-400 mt-2">
                      <span>Entitled {entitled.toFixed(1)}</span>
                      <span>Used {used.toFixed(1)}</span>
                      {pending > 0 && <span className="text-amber-600">Pending {pending.toFixed(1)}</span>}
                      {carried > 0 && <span>Carried {carried.toFixed(1)}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Requests ─────────────────────────────────────────────────────── */}
      <div style={{ display: tab === 'requests' ? 'block' : 'none' }}>
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/70 rounded-2xl animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-violet-500" />
            </div>
            <p className="text-base font-black text-slate-900">No leave requests yet</p>
            <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
              When you file leave it will appear here with its approval status.
            </p>
            <Link
              href="/portal/leaves/new"
              className="inline-flex items-center gap-1.5 mt-5 text-white px-4 py-2.5 rounded-2xl text-[13px] font-black"
              style={{ background: ORANGE }}
            >
              <Plus className="w-4 h-4" strokeWidth={2.6} />
              File leave
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {requests.map(req => {
              const tone = STATUS_TONE[req.status] ?? STATUS_TONE.CANCELLED
              return (
                <div
                  key={req.id}
                  className="relative rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 pl-5 overflow-hidden"
                >
                  <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: tone.bar }} />

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-slate-900 truncate">
                        {req.leaveType.name}
                      </p>
                      <p className="text-[12px] font-semibold text-slate-400 mt-0.5">
                        {format(new Date(req.startDate), 'MMM d')} – {format(new Date(req.endDate), 'MMM d, yyyy')}
                        <span className="text-slate-300"> · </span>
                        {req.totalDays}d
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {req.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-2.5 text-[11px] font-semibold text-slate-400">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Filed {format(new Date(req.createdAt), 'MMM d, yyyy')}</span>
                  </div>

                  {(req.reviewNotes || req.status === 'PENDING') && (
                    <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">
                      {req.reviewNotes ?? 'Awaiting review'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
