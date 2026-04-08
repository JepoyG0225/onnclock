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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_KEYS = ['janBasic', 'febBasic', 'marBasic', 'aprBasic', 'mayBasic', 'junBasic',
  'julBasic', 'augBasic', 'sepBasic', 'octBasic', 'novBasic', 'decBasic'] as const

function peso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(n)
}

export default function ThirteenthMonthPage() {
  const [entries, setEntries] = useState<ThirteenthMonthEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [computing, setComputing] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<ThirteenthMonthEntry | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/thirteenth-month?year=${year}`)
      const data = await res.json().catch(() => ({}))
      setEntries(data.entries ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year])

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
            PD 851 — Must be paid on or before December 24. Non-taxable up to ₱90,000.
          </p>
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

      {/* Summary Cards */}
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
          <p className="text-2xl font-bold text-teal-600 mt-1">{paidCount} / {entries.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Deadline</p>
          <p className="text-base font-bold text-gray-900 mt-1">December 24, {year}</p>
          {new Date() > new Date(`${year}-12-24`) && (
            <p className="text-xs text-red-500 mt-0.5">Past due!</p>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedEntry.employee.firstName} {selectedEntry.employee.lastName}
                </h2>
                <p className="text-sm text-gray-500">{selectedEntry.employee.employeeNo} · {selectedEntry.employee.department?.name}</p>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="grid grid-cols-6 gap-1.5 mb-4">
              {MONTHS.map((m, i) => {
                const val = Number(selectedEntry[MONTH_KEYS[i]])
                return (
                  <div key={m} className={`text-center rounded-lg p-2 ${val > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <p className="text-xs text-gray-400">{m}</p>
                    <p className={`text-xs font-medium ${val > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {val > 0 ? peso(val).replace('₱', '').replace(',', 'k').trim() : '—'}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="bg-green-50 rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">13th Month Pay ({selectedEntry.proRatedMonths} months)</p>
                <p className="text-xs text-gray-400">Total Basic ÷ 12 = {peso(Number(selectedEntry.totalBasicPaid))} ÷ 12</p>
              </div>
              <p className="text-2xl font-bold text-green-700">{peso(Number(selectedEntry.thirteenthAmount))}</p>
            </div>
            {Number(selectedEntry.thirteenthAmount) > 90_000 && (
              <p className="text-xs text-amber-600 mt-2">
                ⚠️ Amount exceeds ₱90,000 non-taxable threshold. Excess {peso(Number(selectedEntry.thirteenthAmount) - 90_000)} is taxable.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Table */}
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
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <Gift className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No data. Click &quot;Compute&quot; to calculate 13th month for {year}.
                  </td>
                </tr>
              ) : (
                entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {entry.employee.lastName}, {entry.employee.firstName}
                      </p>
                      <p className="text-xs text-gray-400">{entry.employee.employeeNo}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{entry.employee.department?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{Number(entry.proRatedMonths).toFixed(0)}/12</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{peso(Number(entry.totalBasicPaid))}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {peso(Number(entry.thirteenthAmount))}
                      {Number(entry.thirteenthAmount) > 90_000 && (
                        <span className="ml-1 text-xs text-amber-500">⚠️</span>
                      )}
                    </td>
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
                      <button
                        onClick={() => setSelectedEntry(entry)}
                        className="text-xs text-teal-600 hover:text-teal-700"
                      >
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
