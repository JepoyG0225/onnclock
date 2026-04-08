'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { FileText, Plus, Clock } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

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

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-green-50 text-green-700 border-green-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-gray-50 text-gray-500 border-gray-200',
  }
  return <Badge className={map[status] ?? ''}>{status}</Badge>
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Leaves</h1>
          <p className="text-gray-500 text-sm mt-1">Balances and requests</p>
        </div>
        <Link
          href="/portal/leaves/new"
          className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: '#fa5e01' }}
        >
          <Plus className="w-4 h-4" /> File Leave
        </Link>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-full bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('balances')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            tab === 'balances' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
          }`}
        >
          Leave Balances
        </button>
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            tab === 'requests' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
          }`}
        >
          Leave Requests
        </button>
      </div>

      {/* Leave Balances */}
      <div style={{ display: tab === 'balances' ? 'block' : 'none' }}>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Leave Balances - {new Date().getFullYear()}
        </h2>
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-gray-400">No leave types configured.</p>
        ) : (
          <div className="space-y-2.5">
            {balances.map(lb => {
              const safeNumber = (value: unknown) => {
                const n = Number(value)
                return Number.isFinite(n) ? n : 0
              }
              const entitled = Math.max(0, safeNumber(lb.entitled))
              const used = Math.max(0, safeNumber(lb.used))
              const pending = Math.max(0, safeNumber(lb.pending))
              const carried = Math.max(0, safeNumber(lb.carriedOver))
              const computedRemaining = entitled + carried - used - pending
              const remaining = Math.max(0, Number.isFinite(Number(lb.balance)) ? Number(lb.balance) : computedRemaining)
              const pct = entitled > 0 ? Math.min(100, (remaining / entitled) * 100) : 0
              return (
                <div key={lb.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {lb.leaveType.code}
                        </span>
                        {!lb.leaveType.isWithPay && (
                          <span className="text-[11px] text-gray-400">Unpaid</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 truncate">{lb.leaveType.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Remaining</p>
                      <p className="text-xl font-black" style={{ color: '#227f84' }}>
                        {remaining.toFixed(1)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, background: '#fa5e01' }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-1.5">
                      <span>Entitled: {entitled.toFixed(1)}</span>
                      <span>Used: {used.toFixed(1)}</span>
                      {pending > 0 && <span className="text-amber-600">Pending: {pending.toFixed(1)}</span>}
                      {carried > 0 && <span>Carried: {carried.toFixed(1)}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Leave Requests History */}
      <div style={{ display: tab === 'requests' ? 'block' : 'none' }}>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Leave Requests</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-8 text-center text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No leave requests yet
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {req.leaveType.code} <span className="text-gray-400 text-xs">· {req.leaveType.name}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(req.startDate), 'MMM d')} - {format(new Date(req.endDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {statusBadge(req.status)}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-[10px] text-gray-400">Days</p>
                    <p className="text-sm font-semibold text-gray-900">{req.totalDays}d</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-[10px] text-gray-400">Filed</p>
                    <p className="text-sm font-semibold text-gray-900">{format(new Date(req.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2 col-span-2">
                    <p className="text-[10px] text-gray-400">Remarks</p>
                    <p className="text-[11px] text-gray-600 mt-1">
                      {req.reviewNotes ?? (req.status === 'PENDING' ? 'Awaiting review' : '-')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
