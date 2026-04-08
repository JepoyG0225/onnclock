'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import { peso } from '@/lib/utils'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

interface SSSRow {
  employeeNo: string; sssNo: string; lastName: string; firstName: string
  msc: number; employeeShare: number; employerShare: number; ec: number; total: number
}

export default function SSSReportPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [rows,  setRows]  = useState<SSSRow[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function loadPreview() {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/sss-r3?month=${month}&year=${year}&format=json`)
      const data = await res.json().catch(() => ({}))
      setRows(data.rows ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPreview() }, [month, year])

  async function downloadXLSX() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/reports/sss-r3?month=${month}&year=${year}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `SSS-R3-${year}-${String(month).padStart(2,'0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const totalEmployee = rows.reduce((s, r) => s + r.employeeShare, 0)
  const totalEmployer = rows.reduce((s, r) => s + r.employerShare, 0)
  const totalEC       = rows.reduce((s, r) => s + r.ec, 0)
  const grandTotal    = rows.reduce((s, r) => s + r.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SSS R3 — Contribution Collection List</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monthly SSS contributions in SSS-prescribed format</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="border rounded px-3 py-2 text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border rounded px-3 py-2 text-sm"
            >
              {[2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Button onClick={downloadXLSX} disabled={downloading || rows.length === 0} className="bg-teal-600 hover:bg-teal-700">
            <Download className="w-4 h-4 mr-2" />
            {downloading ? 'Generating...' : 'Download XLSX'}
          </Button>
          <Button onClick={downloadXLSX} disabled={downloading || rows.length === 0} variant="outline">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Employee Shares',  value: totalEmployee, color: 'text-teal-700' },
          { label: 'Employer Shares',  value: totalEmployer, color: 'text-green-700' },
          { label: 'EC Total',         value: totalEC,       color: 'text-yellow-700' },
          { label: 'Grand Total',      value: grandTotal,    color: 'text-red-700' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{peso(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            SSS R3 — {MONTHS[month - 1]} {year}
            <Badge variant="outline">{rows.length} employees</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No payroll data for this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Employee No.</th>
                    <th className="text-left p-3 font-medium text-gray-600">SSS Number</th>
                    <th className="text-left p-3 font-medium text-gray-600">Name</th>
                    <th className="text-right p-3 font-medium text-gray-600">MSC</th>
                    <th className="text-right p-3 font-medium text-gray-600">EE Share</th>
                    <th className="text-right p-3 font-medium text-gray-600">ER Share</th>
                    <th className="text-right p-3 font-medium text-gray-600">EC</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{r.employeeNo}</td>
                      <td className="p-3 font-mono text-sm">{r.sssNo || '—'}</td>
                      <td className="p-3">{r.lastName}, {r.firstName}</td>
                      <td className="p-3 text-right">{peso(r.msc)}</td>
                      <td className="p-3 text-right text-teal-700">{peso(r.employeeShare)}</td>
                      <td className="p-3 text-right text-green-700">{peso(r.employerShare)}</td>
                      <td className="p-3 text-right">{peso(r.ec)}</td>
                      <td className="p-3 text-right font-medium">{peso(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t font-semibold">
                  <tr>
                    <td colSpan={4} className="p-3">TOTAL</td>
                    <td className="p-3 text-right text-teal-700">{peso(totalEmployee)}</td>
                    <td className="p-3 text-right text-green-700">{peso(totalEmployer)}</td>
                    <td className="p-3 text-right">{peso(totalEC)}</td>
                    <td className="p-3 text-right">{peso(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remittance Note */}
      <Card className="border-teal-200 bg-teal-50">
        <CardContent className="p-4 text-sm text-teal-800">
          <strong>Remittance Deadline:</strong> Last working day of the following month.
          File via My.SSS portal or SSS branch. Keep the Official Receipt for 3 years.
        </CardContent>
      </Card>
    </div>
  )
}
