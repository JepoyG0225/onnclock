'use client'

import { useEffect, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import NewFeatureBadge from '@/components/ui/NewFeatureBadge'
import { KpiCard } from '@/components/ui/kpi-card'
import { AppSpinner } from '@/components/ui/AppSpinner'

type AuditLog = {
  id: string
  action: string
  entity: string
  entityId: string
  userId: string
  userName: string | null
  userEmail: string | null
  ipAddress: string | null
  newValues: { description?: string } | null
  createdAt: string
}

export default function AuditSettingsPage() {
  const [query, setQuery] = useState('')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '50' })
        if (query.trim()) params.set('q', query.trim())
        const res = await fetch(`/api/settings/audit?${params.toString()}`)
        const data = await res.json().catch(() => ({}))
        if (!mounted || !res.ok) return
        setLogs(data.logs ?? [])
        setTotalCount(data.totalCount ?? 0)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    const timer = setTimeout(() => { void load() }, 200)
    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="space-y-6 bg-gradient-to-b from-slate-50 to-white p-4 md:p-6 rounded-2xl">
      <SettingsTabs />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Audit & Compliance</h1>
          <NewFeatureBadge releasedAt="2026-05-01T00:00:00+08:00" />
        </div>
        <p className="text-sm text-slate-500 mt-1">Track every payroll-impacting action with full accountability.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Total events" value={totalCount} icon={<ShieldCheck className="h-5 w-5" />} />
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9"
                placeholder="Search action, entity, or entity ID"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#000000]" />
            Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center p-8"><AppSpinner size="md" /></div> : null}
          {!loading && logs.length === 0 ? <p className="text-sm text-slate-500 p-4">No matching audit logs.</p> : null}
          {!loading && logs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Timestamp</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Performed by</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const actionColor =
                      log.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                      log.action === 'APPROVE' ? 'bg-blue-100 text-blue-700' :
                      log.action === 'REJECT' ? 'bg-red-100 text-red-700' :
                      log.action === 'DELETE' || log.action === 'CANCEL' ? 'bg-orange-100 text-orange-700' :
                      log.action === 'UPDATE' ? 'bg-purple-100 text-purple-700' :
                      log.action === 'SUBMIT' ? 'bg-indigo-100 text-indigo-700' :
                      log.action === 'LOCK' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-slate-100 text-slate-600'
                    const desc = (log.newValues as { description?: string } | null)?.description
                    const fallbackDesc = `${log.action} ${log.entity}`
                    return (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">{log.userName || log.userEmail || log.userId}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${actionColor}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-900">{desc || fallbackDesc}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{log.ipAddress || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
