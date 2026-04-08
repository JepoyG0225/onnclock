'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar } from 'lucide-react'
import { format, differenceInBusinessDays } from 'date-fns'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'

interface LeaveType { id: string; name: string; code: string; isWithPay: boolean }
interface LeaveBalance {
  leaveType: { name: string; code: string }
  entitled: number; used: number; pending: number; carriedOver: number
}
interface LeaveRequest {
  id: string; status: string; startDate: string; endDate: string; totalDays: number
  reason: string | null; createdAt: string
  leaveType: { name: string; code: string }
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

export default function MyLeavesPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [balances,   setBalances]   = useState<LeaveBalance[]>([])
  const [requests,   setRequests]   = useState<LeaveRequest[]>([])
  const [loading,    setLoading]    = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [form, setForm] = useState({
    leaveTypeId: '', startDate: '', endDate: '', reason: '',
  })

  async function load() {
    setLoading(true)
    const [typesRes, leavesRes] = await Promise.all([
      fetch('/api/leaves/types'),
      fetch('/api/leaves?own=true'),
    ])
    const typesData  = await typesRes.json()
    const leavesData = await leavesRes.json()
    setLeaveTypes(typesData.types ?? [])
    setRequests(leavesData.leaves ?? [])
    setBalances(leavesData.balances ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submit() {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) {
      toast.error('Please fill in all required fields')
      return
    }
    const res = await fetch('/api/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      toast.success('Leave request submitted')
      setShowForm(false)
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' })
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? 'Failed to submit leave')
    }
  }

  const totalDays = form.startDate && form.endDate
    ? Math.max(0, differenceInBusinessDays(new Date(form.endDate), new Date(form.startDate)) + 1)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Leaves</h1>
          <p className="text-gray-500 text-sm mt-1">View your leave balances and file leave requests</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />File Leave
        </Button>
      </div>

      {/* Leave Balances */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {balances.map(b => {
            const available = b.entitled + b.carriedOver - b.used - b.pending
            return (
              <Card key={b.leaveType.code}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{b.leaveType.code}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{b.leaveType.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-teal-700">{available}</span>
                    <span className="text-xs text-gray-400 mb-0.5">/ {b.entitled + b.carriedOver} days</span>
                  </div>
                  {b.pending > 0 && <p className="text-xs text-yellow-600 mt-1">{b.pending} pending</p>}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* File Leave Form */}
      {showForm && (
        <Card className="border-teal-200">
          <CardHeader><CardTitle className="text-base">File Leave Request</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Leave Type *</label>
                <select value={form.leaveTypeId} onChange={e => setForm(f => ({ ...f, leaveTypeId: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Select leave type...</option>
                  {leaveTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code}) — {t.isWithPay ? 'With Pay' : 'Without Pay'}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Start Date *</label>
                  <DatePicker value={form.startDate} onChange={(v) => setForm(f => ({ ...f, startDate: v }))} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 block mb-1">End Date *</label>
                  <DatePicker value={form.endDate} onChange={(v) => setForm(f => ({ ...f, endDate: v }))} min={form.startDate} />
                </div>
              </div>
            </div>
            {totalDays > 0 && (
              <div className="bg-teal-50 rounded p-3 text-sm text-teal-800">
                <Calendar className="inline w-4 h-4 mr-1" />
                <strong>{totalDays} business day{totalDays !== 1 ? 's' : ''}</strong>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Reason / Notes</label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Brief reason for the leave..." />
            </div>
            <div className="flex gap-2">
              <Button onClick={submit}>Submit Request</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leave History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Leave History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No leave requests yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Leave Type</th>
                    <th className="text-left p-3 font-medium text-gray-600">Period</th>
                    <th className="text-right p-3 font-medium text-gray-600">Days</th>
                    <th className="text-left p-3 font-medium text-gray-600">Reason</th>
                    <th className="text-center p-3 font-medium text-gray-600">Status</th>
                    <th className="text-left p-3 font-medium text-gray-600">Filed</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{r.leaveType.code}</Badge>
                        <span className="ml-2 text-xs text-gray-600">{r.leaveType.name}</span>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        {format(new Date(r.startDate), 'MMM d')} – {format(new Date(r.endDate), 'MMM d, yyyy')}
                      </td>
                      <td className="p-3 text-right">{r.totalDays}d</td>
                      <td className="p-3 text-xs text-gray-500">{r.reason ?? '—'}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.status] ?? ''}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-400">{format(new Date(r.createdAt), 'MMM d, yyyy')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
