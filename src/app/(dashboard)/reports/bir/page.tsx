'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download } from 'lucide-react'
import Link from 'next/link'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const CURRENT_YEAR = new Date().getFullYear()

function DownloadButton({ label, url, filename, color, disabled }: { label: string; url: string; filename: string; color: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false)

  async function download() {
    if (disabled) return
    setLoading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={download} disabled={loading || disabled} className={color}>
      <Download className="w-4 h-4 mr-2" />
      {loading ? 'Generating...' : label}
    </Button>
  )
}

export default function BIRReportPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string; employeeNo: string }[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const selectedEmployee = employees.find(e => e.id === employeeId)

  useEffect(() => {
    async function loadEmployees() {
      const res = await fetch('/api/employees?limit=500')
      const data = await res.json().catch(() => ({}))
      setEmployees(data.employees ?? [])
    }
    loadEmployees()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BIR Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">BIR 1601C, Form 2316, and Alphalist 1604CF</p>
        </div>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Month (for monthly reports)</label>
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
        </CardContent>
      </Card>

      <Tabs defaultValue="1601c">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="1601c">1601C</TabsTrigger>
          <TabsTrigger value="2316">Form 2316</TabsTrigger>
          <TabsTrigger value="alphalist">1604CF</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
        </TabsList>

        {/* 1601C */}
        <TabsContent value="1601c" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">BIR Form 1601C — Monthly Remittance Return</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Monthly withholding tax remittance form. Lists all employees with their monthly compensation
                and corresponding tax withheld. Due on the <strong>10th of the following month</strong>.
              </p>
              <div className="flex gap-3">
                <DownloadButton
                  label="Download XLSX"
                  url={`/api/reports/bir?type=1601c&month=${month}&year=${year}`}
                  filename={`BIR-1601C-${year}-${String(month).padStart(2,'0')}.xlsx`}
                  color="bg-red-600 hover:bg-red-700"
                />
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                <strong>Deadline:</strong> 10th of {MONTHS[month % 12]} {month === 12 ? year + 1 : year}
                (for {MONTHS[month - 1]} {year} taxes withheld)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Form 2316 */}
        <TabsContent value="2316" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">BIR Form 2316 — Certificate of Compensation Payment/Tax Withheld</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Annual tax certificate issued to each employee. Must be provided to employees by
                <strong> February 28</strong> of the following year. Substitutes for individual ITR filing
                for employees earning purely compensation income.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Employee *</label>
                  <select
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    className="border rounded px-3 py-2 text-sm w-full"
                  >
                    <option value="">Select employee...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.lastName}, {e.firstName} ({e.employeeNo})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <DownloadButton
                    label="Download 2316 PDF"
                    url={`/api/reports/bir?type=2316&employeeId=${employeeId}&year=${year}`}
                    filename={`BIR-2316-${year}-${selectedEmployee ? `${selectedEmployee.lastName}-${selectedEmployee.firstName}` : employeeId}.pdf`}
                    color="bg-amber-600 hover:bg-amber-700"
                    disabled={!employeeId}
                  />
                </div>
              </div>
              {!employeeId && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                  Select an employee to generate their BIR Form 2316.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 1604CF Alphalist */}
        <TabsContent value="alphalist" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">BIR Form 1604CF — Annual Alphalist of Employees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Annual information return with complete list of all employees and their year-to-date
                compensation and tax withheld. Due on <strong>January 31</strong> of the following year.
              </p>
              <div className="flex gap-3">
                <DownloadButton
                  label="Download Alphalist XLSX"
                  url={`/api/reports/bir?type=alphalist&year=${year}`}
                  filename={`BIR-1604CF-Alphalist-${year}.xlsx`}
                  color="bg-red-600 hover:bg-red-700"
                />
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                <strong>Deadline:</strong> January 31, {year + 1}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Register */}
        <TabsContent value="register" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payroll Register</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Full payroll summary per employee showing all earnings and deductions for the selected month.
                For internal use and audit purposes.
              </p>
              <div className="flex gap-3">
                <DownloadButton
                  label="Download Payroll Register XLSX"
                  url={`/api/reports/bir?type=register&month=${month}&year=${year}`}
                  filename={`Payroll-Register-${year}-${String(month).padStart(2,'0')}.xlsx`}
                  color="bg-purple-600 hover:bg-purple-700"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* BIR Tax Table Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">TRAIN Law Tax Table (Effective 2023)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 font-medium">Annual Taxable Income</th>
                  <th className="text-right p-2 font-medium">Base Tax</th>
                  <th className="text-right p-2 font-medium">Rate on Excess</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { bracket: '₱0 – ₱250,000',           base: '₱0',         rate: '0%' },
                  { bracket: '₱250,001 – ₱400,000',      base: '₱0',         rate: '15%' },
                  { bracket: '₱400,001 – ₱800,000',      base: '₱22,500',    rate: '20%' },
                  { bracket: '₱800,001 – ₱2,000,000',    base: '₱102,500',   rate: '25%' },
                  { bracket: '₱2,000,001 – ₱8,000,000',  base: '₱402,500',   rate: '30%' },
                  { bracket: 'Over ₱8,000,000',           base: '₱2,202,500', rate: '35%' },
                ].map((row) => (
                  <tr key={row.bracket} className="border-b">
                    <td className="p-2">{row.bracket}</td>
                    <td className="p-2 text-right">{row.base}</td>
                    <td className="p-2 text-right font-semibold text-red-700">{row.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
