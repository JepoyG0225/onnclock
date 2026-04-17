'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Gift, ChevronLeft, ChevronRight, CheckCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ThirteenthMonthEntry {
  id: string
  year: number
  totalBasicPaid: number
  thirteenthAmount: number
  proRatedMonths: number
  isPaid: boolean
  paidAt: string | null
  janBasic: number; febBasic: number; marBasic: number; aprBasic: number
  mayBasic: number; junBasic: number; julBasic: number; augBasic: number
  sepBasic: number; octBasic: number; novBasic: number; decBasic: number
  employee: {
    firstName: string; lastName: string; employeeNo: string
    department: { name: string } | null
    position: { title: string } | null
  }
}

interface ThirteenthSettings {
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_KEYS = ['janBasic', 'febBasic', 'marBasic', 'aprBasic', 'mayBasic', 'junBasic',
  'julBasic', 'augBasic', 'sepBasic', 'octBasic', 'novBasic', 'decBasic'] as const

function peso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(n)
}

function toDateInput(month: number, day: number, year: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day))
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function ThirteenthMonthPage() {
  const [entries, setEntries] = useState<ThirteenthMonthEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [computing, setComputing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [coverageStart, setCoverageStart] = useState('')
  const [coverageEnd, setCoverageEnd] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<ThirteenthMonthEntry | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/thirteenth-month?year=${year}`)
      const data = await res.json().catch(() => ({}))
      setEntries(data.entries ?? [])

      const s = data.settings as ThirteenthSettings | undefined
      if (s) {
        const wrapsAcrossYear =
          Number(s.startMonth) > Number(s.endMonth) ||
          (Number(s.startMonth) === Number(s.endMonth) && Number(s.startDay) > Number(s.endDay))
        setCoverageStart(
          toDateInput(Number(s.startMonth), Number(s.startDay), wrapsAcrossYear ? year - 1 : year)
        )
        setCoverageEnd(toDateInput(Number(s.endMonth), Number(s.endDay), year))
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [year])

  async function compute() {
    setComputing(true)
    try {
      const res = await fetch('/api/thirteenth-month/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      if (res.ok) await load()
    } catch {
      // silent
    } finally {
      setComputing(false)
    }
  }

  async function saveCoverageSettings() {
    if (!coverageStart || !coverageEnd) return
    setSavingSettings(true)
    try {
      const s = new Date(`${coverageStart}T00:00:00`)
      const e = new Date(`${coverageEnd}T00:00:00`)
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return

      const res = await fetch('/api/thirteenth-month', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startMonth: s.getMonth() + 1,
          startDay: s.getDate(),
          endMonth: e.getMonth() + 1,
          endDay: e.getDate(),
        }),
      })
      if (res.ok) {
        await load()
      }
    } finally {
      setSavingSettings(false)
    }
  }

  const totalAmount = entries.reduce((sum, e) => sum + Number(e.thirteenthAmount), 0)
  const paidCount = entries.filter(e => e.isPaid).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Gift className="w-6 h-6 text-green-600" /> 13th Month Pay
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            PD 851 - Must be paid on or before December 24. Non-taxable up to PHP 90,000.
          </p>
          {coverageStart && coverageEnd && (
            <p className="text-xs text-gray-500 mt-1">
              Coverage: {format(new Date(`${coverageStart}T00:00:00`), 'MMM d, yyyy')} to {format(new Date(`${coverageEnd}T00:00:00`), 'MMM d, yyyy')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 hover:bg-gray-100 rounded">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold px-2">{year}</span>
            <button
              onClick={() => setYear(y => y + 1)}
              disabled={year >= new Date().getFullYear()}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={compute}
            disabled={computing}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {computing ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Gift className="w-4 h-4" />
            )}
            Compute {year}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-500 uppercase mb-3">Computation Coverage</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start</label>
            <input
              type="date"
              value={coverageStart}
              onChange={e => setCoverageStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End</label>
            <input
              type="date"
              value={coverageEnd}
              onChange={e => setCoverageEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={saveCoverageSettings}
            disabled={savingSettings || !coverageStart || !coverageEnd}
            className="bg-[#2E4156] hover:bg-[#1A2D42] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {savingSettings ? 'Saving...' : 'Save Coverage'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Employees</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{entries.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Liability</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{peso(totalAmount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Paid</p>
          <p className="text-2xl font-bold text-[#2E4156] mt-1">{paidCount} / {entries.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Deadline</p>
          <p className="text-base font-bold text-gray-900 mt-1">December 24, {year}</p>
        </div>
      </div>

      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedEntry.employee.firstName} {selectedEntry.employee.lastName}
                </h2>
                <p className="text-sm text-gray-500">{selectedEntry.employee.employeeNo} - {selectedEntry.employee.department?.name}</p>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="text-gray-400 hover:text-gray-600">x</button>
            </div>
            <div className="grid grid-cols-6 gap-1.5 mb-4">
              {MONTHS.map((m, i) => {
                const val = Number(selectedEntry[MONTH_KEYS[i]])
                return (
                  <div key={m} className={`text-center rounded-lg p-2 ${val > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <p className="text-xs text-gray-400">{m}</p>
                    <p className={`text-xs font-medium ${val > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {val > 0 ? peso(val) : '-'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Months</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total Basic Paid</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">13th Month</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <Gift className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No data. Click "Compute" to calculate 13th month for {year}.
                  </td>
                </tr>
              ) : (
                entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{entry.employee.lastName}, {entry.employee.firstName}</p>
                      <p className="text-xs text-gray-400">{entry.employee.employeeNo}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{entry.employee.department?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{Number(entry.proRatedMonths).toFixed(0)}/12</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{peso(Number(entry.totalBasicPaid))}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">{peso(Number(entry.thirteenthAmount))}</td>
                    <td className="px-4 py-3">
                      {entry.isPaid ? (
                        <Badge className="bg-green-50 text-green-700 border-green-200 gap-1">
                          <CheckCircle className="w-3 h-3" /> Paid {entry.paidAt ? format(new Date(entry.paidAt), 'MMM d') : ''}
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                          <Clock className="w-3 h-3" /> Pending
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedEntry(entry)} className="text-xs text-[#2E4156] hover:text-[#1A2D42]">
                        View breakdown
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
