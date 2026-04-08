'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
import Link from 'next/link'
import { peso } from '@/lib/utils'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

interface PHRow {
  pin: string; lastName: string; firstName: string
  basicSalary: number; premiumTotal: number; employeeShare: number; employerShare: number
}

export default function PhilHealthReportPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [rows,  setRows]  = useState<PHRow[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function loadPreview() {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/philhealth-rf1?month=${month}&year=${year}&format=json`)
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
      const res = await fetch(`/api/reports/philhealth-rf1?month=${month}&year=${year}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `PhilHealth-RF1-${year}-${String(month).padStart(2,'0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const totalEE     = rows.reduce((s, r) => s + r.employeeShare, 0)
  const totalER     = rows.reduce((s, r) => s + r.employerShare, 0)
  const totalPremium = rows.reduce((s, r) => s + r.premiumTotal, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PhilHealth RF-1 — Premium Remittance Return</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monthly PhilHealth premium contributions per employee</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Month</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border rounded px-3 py-2 text-sm">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Year</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border rounded px-3 py-2 text-sm">
              {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Button onClick={downloadXLSX} disabled={downloading || rows.length === 0} className="bg-green-600 hover:bg-green-700">
            <Download className="w-4 h-4 mr-2" />
            {downloading ? 'Generating...' : 'Download XLSX'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'EE Shares (2.5%)', value: totalEE,     color: 'text-green-700' },
          { label: 'ER Shares (2.5%)', value: totalER,     color: 'text-teal-700' },
          { label: 'Total Premium',    value: totalPremium, color: 'text-gray-900' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{peso(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            PhilHealth RF-1 — {MONTHS[month - 1]} {year}
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
                    <th className="text-left p-3 font-medium text-gray-600">PhilHealth No. (PIN)</th>
                    <th className="text-left p-3 font-medium text-gray-600">Name</th>
                    <th className="text-right p-3 font-medium text-gray-600">Basic Salary</th>
                    <th className="text-right p-3 font-medium text-gray-600">EE Share</th>
                    <th className="text-right p-3 font-medium text-gray-600">ER Share</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-sm">{r.pin || '—'}</td>
                      <td className="p-3">{r.lastName}, {r.firstName}</td>
                      <td className="p-3 text-right">{peso(r.basicSalary)}</td>
                      <td className="p-3 text-right text-green-700">{peso(r.employeeShare)}</td>
                      <td className="p-3 text-right text-teal-700">{peso(r.employerShare)}</td>
                      <td className="p-3 text-right font-medium">{peso(r.premiumTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t font-semibold">
                  <tr>
                    <td colSpan={3} className="p-3">TOTAL</td>
                    <td className="p-3 text-right text-green-700">{peso(totalEE)}</td>
                    <td className="p-3 text-right text-teal-700">{peso(totalER)}</td>
                    <td className="p-3 text-right">{peso(totalPremium)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4 text-sm text-green-800">
          <strong>Remittance Deadline:</strong> Last working day of the following month.
          File RF-1 form with your PhilHealth Regional/Local Office or via PhilHealth online portal.
        </CardContent>
      </Card>
    </div>
  )
}
