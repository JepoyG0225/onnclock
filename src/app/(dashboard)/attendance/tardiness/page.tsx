'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import {
  AlertTriangle,
  Clock,
  Users,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DTRRecord {
  id: string
  employeeId: string
  date: string
  timeIn: string | null
  timeOut: string | null
  lateMinutes: number | null
  undertimeMinutes: number | null
  isAbsent: boolean
  employee: {
    firstName: string
    lastName: string
    employeeNo: string
    department: { name: string } | null
  }
}

interface CompanyOption {
  id: string
  name: string
}

interface EmployeeSummary {
  employeeId: string
  name: string
  employeeNo: string
  department: string
  tardyDays: number
  totalLateMinutes: number
  avgLateMinutes: number
  totalUndertimeMinutes: number
  absentDays: number
  dailyRecords: DTRRecord[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

function formatTime(dt: string | null): string {
  if (!dt) return '—'
  try {
    return format(parseISO(dt), 'HH:mm')
  } catch {
    return '—'
  }
}

function tardyColor(tardyDays: number): string {
  if (tardyDays >= 3) return 'bg-red-100 text-red-800 border-red-200'
  if (tardyDays >= 2) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (tardyDays >= 1) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function exportCSV(rows: EmployeeSummary[]) {
  const headers = [
    'Employee No',
    'Employee Name',
    'Department',
    'Tardy Days',
    'Total Late',
    'Avg Late/Day',
    'Undertime',
    'Absent Days',
  ]
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      [
        r.employeeNo,
        `"${r.name}"`,
        `"${r.department}"`,
        r.tardyDays,
        formatMinutes(r.totalLateMinutes),
        r.tardyDays > 0 ? formatMinutes(Math.round(r.avgLateMinutes)) : '0m',
        formatMinutes(r.totalUndertimeMinutes),
        r.absentDays,
      ].join(',')
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tardiness-report-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function TardinessReportPage() {
  const now = new Date()
  const defaultFrom = format(startOfMonth(now), 'yyyy-MM-dd')
  const defaultTo = format(endOfMonth(now), 'yyyy-MM-dd')

  // Filter state
  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)
  const [deptFilter, setDeptFilter] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [minLateMinutes, setMinLateMinutes] = useState(0)

  // Data state
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Super-admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')

  // UI
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // ── Bootstrap: check role ────────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      try {
        const meRes = await fetch('/api/users/me')
        if (meRes.ok) {
          const me = await meRes.json()
          if (me?.actorRole === 'SUPER_ADMIN') {
            setIsSuperAdmin(true)
            const compRes = await fetch('/api/admin/companies')
            if (compRes.ok) {
              const data = await compRes.json()
              setCompanies(Array.isArray(data) ? data : data.companies ?? [])
            }
          }
        }
      } catch {
        // ignore
      }
    }
    bootstrap()
  }, [])

  // ── Fetch DTR records ────────────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/dtr?from=${fromDate}&to=${toDate}&limit=2000`
      if (isSuperAdmin && selectedCompanyId) {
        url += `&companyId=${encodeURIComponent(selectedCompanyId)}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch DTR records')
      const data = await res.json()
      setRecords(Array.isArray(data) ? data : data.records ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, isSuperAdmin, selectedCompanyId])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // ── Derived: unique departments ──────────────────────────────────────────
  const departments = useMemo(() => {
    const depts = new Set<string>()
    records.forEach(r => {
      const d = r.employee?.department?.name
      if (d) depts.add(d)
    })
    return Array.from(depts).sort()
  }, [records])

  // ── Aggregation by employee ──────────────────────────────────────────────
  const employeeSummaries = useMemo((): EmployeeSummary[] => {
    const map = new Map<string, EmployeeSummary>()

    for (const rec of records) {
      const emp = rec.employee
      if (!emp) continue

      const key = rec.employeeId
      if (!map.has(key)) {
        map.set(key, {
          employeeId: key,
          name: `${emp.firstName} ${emp.lastName}`,
          employeeNo: emp.employeeNo,
          department: emp.department?.name ?? '—',
          tardyDays: 0,
          totalLateMinutes: 0,
          avgLateMinutes: 0,
          totalUndertimeMinutes: 0,
          absentDays: 0,
          dailyRecords: [],
        })
      }

      const summary = map.get(key)!
      summary.dailyRecords.push(rec)

      if (rec.isAbsent) {
        summary.absentDays++
      }
      if ((rec.lateMinutes ?? 0) > 0) {
        summary.tardyDays++
        summary.totalLateMinutes += rec.lateMinutes!
      }
      if ((rec.undertimeMinutes ?? 0) > 0) {
        summary.totalUndertimeMinutes += rec.undertimeMinutes!
      }
    }

    // Compute average
    for (const s of map.values()) {
      s.avgLateMinutes = s.tardyDays > 0 ? s.totalLateMinutes / s.tardyDays : 0
      // Sort daily records by date
      s.dailyRecords.sort((a, b) => a.date.localeCompare(b.date))
    }

    return Array.from(map.values()).sort((a, b) => b.totalLateMinutes - a.totalLateMinutes)
  }, [records])

  // ── Filtered rows ────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return employeeSummaries.filter(s => {
      if (deptFilter && s.department !== deptFilter) return false
      if (
        employeeSearch &&
        !s.name.toLowerCase().includes(employeeSearch.toLowerCase()) &&
        !s.employeeNo.toLowerCase().includes(employeeSearch.toLowerCase())
      )
        return false
      if (s.totalLateMinutes < minLateMinutes) return false
      return true
    })
  }, [employeeSummaries, deptFilter, employeeSearch, minLateMinutes])

  // ── Summary stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalTardy = filteredRows.reduce((acc, r) => acc + r.tardyDays, 0)
    const totalAbsent = filteredRows.reduce((acc, r) => acc + r.absentDays, 0)
    const totalLate = filteredRows.reduce((acc, r) => acc + r.totalLateMinutes, 0)
    const avgLate = totalTardy > 0 ? Math.round(totalLate / totalTardy) : 0
    const employeesWithTardiness = filteredRows.filter(r => r.tardyDays > 0).length
    return { totalTardy, totalAbsent, avgLate, employeesWithTardiness }
  }, [filteredRows])

  // ── Expand toggle ────────────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A2D42]">Tardiness Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Late arrivals, absences & undertime analytics
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => exportCSV(filteredRows)}
          disabled={filteredRows.length === 0}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {/* Super-admin company selector */}
            {isSuperAdmin && (
              <div className="xl:col-span-5">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Company</label>
                <select
                  value={selectedCompanyId}
                  onChange={e => setSelectedCompanyId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#fa5e01]/40"
                >
                  <option value="">— All Companies —</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* From date */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> From
              </label>
              <DatePicker value={fromDate} onChange={setFromDate} max={toDate} />
            </div>

            {/* To date */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> To
              </label>
              <DatePicker value={toDate} onChange={setToDate} min={fromDate} />
            </div>

            {/* Department */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Department</label>
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#fa5e01]/40"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Employee search */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Employee</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Name or ID…"
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Min late minutes */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Min Late (min)
              </label>
              <Input
                type="number"
                min={0}
                value={minLateMinutes}
                onChange={e => setMinLateMinutes(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Stats ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Tardy Incidents</p>
                <p className="text-2xl font-bold text-[#1A2D42]">{stats.totalTardy}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <CalendarDays className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Absent Days</p>
                <p className="text-2xl font-bold text-[#1A2D42]">{stats.totalAbsent}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Avg Late / Tardy Day</p>
                <p className="text-2xl font-bold text-[#1A2D42]">
                  {stats.avgLate > 0 ? formatMinutes(stats.avgLate) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Employees w/ Tardiness</p>
                <p className="text-2xl font-bold text-[#1A2D42]">{stats.employeesWithTardiness}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Table ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-[#1A2D42]">
            Tardiness Summary
            {filteredRows.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({filteredRows.length} employee{filteredRows.length !== 1 ? 's' : ''})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <div className="w-5 h-5 border-2 border-[#1A2D42] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading records…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center justify-center py-16 gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {!loading && !error && filteredRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <Clock className="w-8 h-8 opacity-40" />
              <p className="text-sm">No tardiness records found for the selected filters.</p>
            </div>
          )}

          {!loading && !error && filteredRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium w-8" />
                    <th className="text-left px-4 py-3 font-medium">Employee</th>
                    <th className="text-left px-4 py-3 font-medium">Dept</th>
                    <th className="text-center px-4 py-3 font-medium">Tardy Days</th>
                    <th className="text-center px-4 py-3 font-medium">Total Late</th>
                    <th className="text-center px-4 py-3 font-medium">Avg Late/Day</th>
                    <th className="text-center px-4 py-3 font-medium">Undertime</th>
                    <th className="text-center px-4 py-3 font-medium">Absent Days</th>
                    <th className="text-center px-4 py-3 font-medium w-16">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => (
                    <>
                      <tr
                        key={row.employeeId}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpand(row.employeeId)}
                            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                            aria-label="Toggle daily breakdown"
                          >
                            {expanded[row.employeeId] ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1A2D42]">{row.name}</div>
                          <div className="text-xs text-gray-400">{row.employeeNo}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.department}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold border ${tardyColor(row.tardyDays)}`}
                          >
                            {row.tardyDays}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-sm">
                          {row.totalLateMinutes > 0 ? (
                            <span className="text-red-600 font-medium">
                              {formatMinutes(row.totalLateMinutes)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-sm text-gray-600">
                          {row.tardyDays > 0
                            ? formatMinutes(Math.round(row.avgLateMinutes))
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-sm">
                          {row.totalUndertimeMinutes > 0 ? (
                            <span className="text-orange-600">
                              {formatMinutes(row.totalUndertimeMinutes)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.absentDays > 0 ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                              {row.absentDays}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 text-xs">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleExpand(row.employeeId)}
                            className="text-xs text-[#fa5e01] hover:underline font-medium"
                          >
                            {expanded[row.employeeId] ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>

                      {/* ── Daily Breakdown ────────────────────────────────────── */}
                      {expanded[row.employeeId] && (
                        <tr key={`${row.employeeId}-expanded`} className="bg-gray-50/60">
                          <td colSpan={9} className="px-6 py-0">
                            <div className="py-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                Daily Breakdown — {row.name}
                              </p>
                              <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-gray-100 text-gray-500 uppercase tracking-wide">
                                      <th className="text-left px-3 py-2 font-medium">Date</th>
                                      <th className="text-center px-3 py-2 font-medium">Time In</th>
                                      <th className="text-center px-3 py-2 font-medium">Time Out</th>
                                      <th className="text-center px-3 py-2 font-medium">Late</th>
                                      <th className="text-center px-3 py-2 font-medium">Undertime</th>
                                      <th className="text-center px-3 py-2 font-medium">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.dailyRecords
                                      .filter(
                                        r =>
                                          (r.lateMinutes ?? 0) > 0 ||
                                          (r.undertimeMinutes ?? 0) > 0 ||
                                          r.isAbsent
                                      )
                                      .map(r => (
                                        <tr
                                          key={r.id}
                                          className={`border-t border-gray-200 ${r.isAbsent ? 'bg-red-50' : ''}`}
                                        >
                                          <td className="px-3 py-2 font-medium text-gray-700">
                                            {format(parseISO(r.date), 'EEE, MMM d, yyyy')}
                                          </td>
                                          <td className="px-3 py-2 text-center text-gray-600">
                                            {r.isAbsent ? '—' : formatTime(r.timeIn)}
                                          </td>
                                          <td className="px-3 py-2 text-center text-gray-600">
                                            {r.isAbsent ? '—' : formatTime(r.timeOut)}
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            {(r.lateMinutes ?? 0) > 0 ? (
                                              <span className="font-semibold text-red-600">
                                                {formatMinutes(r.lateMinutes!)}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400">—</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            {(r.undertimeMinutes ?? 0) > 0 ? (
                                              <span className="font-semibold text-orange-600">
                                                {formatMinutes(r.undertimeMinutes!)}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400">—</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            {r.isAbsent ? (
                                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                                                Absent
                                              </span>
                                            ) : (r.lateMinutes ?? 0) > 0 ? (
                                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">
                                                Late
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
                                                Undertime
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    {row.dailyRecords.filter(
                                      r =>
                                        (r.lateMinutes ?? 0) > 0 ||
                                        (r.undertimeMinutes ?? 0) > 0 ||
                                        r.isAbsent
                                    ).length === 0 && (
                                      <tr>
                                        <td
                                          colSpan={6}
                                          className="px-3 py-4 text-center text-gray-400"
                                        >
                                          No late/absent records in this period
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
