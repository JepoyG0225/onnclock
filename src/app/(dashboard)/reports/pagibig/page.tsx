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

interface PGRow {
  memberId: string; lastName: string; firstName: string
  basicSalary: number; employeeShare: number; employerShare: number; totalContribution: number
}

export default function PagIBIGReportPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [rows,  setRows]  = useState<PGRow[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function loadPreview() {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/pagibig-mcrf?month=${month}&year=${year}&format=json`)
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
      const res = await fetch(`/api/reports/pagibig-mcrf?month=${month}&year=${year}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `PagIBIG-MCRF-${year}-${String(month).padStart(2,'0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const totalEE    = rows.reduce((s, r) => s + r.employeeShare, 0)
  const totalER    = rows.reduce((s, r) => s + r.employerShare, 0)
  const grandTotal = rows.reduce((s, r) => s + r.totalContribution, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pag-IBIG MCRF — Modified Collection and Remittance Form</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monthly Pag-IBIG contributions (employee + employer)</p>
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
          <Button onClick={downloadXLSX} disabled={downloading || rows.length === 0} className="bg-yellow-600 hover:bg-yellow-700">
            <Download className="w-4 h-4 mr-2" />
            {downloading ? 'Generating...' : 'Download XLSX'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'EE Shares', value: totalEE,    color: 'text-yellow-700' },
          { label: 'ER Shares', value: totalER,    color: 'text-orange-700' },
          { label: 'Grand Total', value: grandTotal, color: 'text-gray-900' },
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
            Pag-IBIG MCRF — {MONTHS[month - 1]} {year}
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
                    <th className="text-left p-3 font-medium text-gray-600">MID Number</th>
                    <th className="text-left p-3 font-medium text-gray-600">Name</th>
                    <th className="text-right p-3 font-medium text-gray-600">Basic Salary</th>
                    <th className="text-right p-3 font-medium text-gray-600">EE Share</th>
                    <th className="text-right p-3 font-medium text-gray-600">ER Share</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-sm">{r.memberId || '—'}</td>
                      <td className="p-3">{r.lastName}, {r.firstName}</td>
                      <td className="p-3 text-right">{peso(r.basicSalary)}</td>
                      <td className="p-3 text-right text-yellow-700">{peso(r.employeeShare)}</td>
                      <td className="p-3 text-right text-orange-700">{peso(r.employerShare)}</td>
                      <td className="p-3 text-right font-medium">{peso(r.totalContribution)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t font-semibold">
                  <tr>
                    <td colSpan={3} className="p-3">TOTAL</td>
                    <td className="p-3 text-right text-yellow-700">{peso(totalEE)}</td>
                    <td className="p-3 text-right text-orange-700">{peso(totalER)}</td>
                    <td className="p-3 text-right">{peso(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-4 text-sm text-yellow-800">
          <strong>Remittance Deadline:</strong> 10th of the following month.
          File via Virtual Pag-IBIG or authorized collecting banks using the MCRF form.
        </CardContent>
      </Card>
    </div>
  )
}
