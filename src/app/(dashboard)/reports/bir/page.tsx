'use client'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Download, Calculator, FileDown, AlertCircle,
  ArrowUpRight, ArrowDownLeft,
} from 'lucide-react'
import { peso } from '@/lib/utils'
import { toast } from 'sonner'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

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

// ── Tax annualization types ─────────────────────────────────────────────────
interface AnnualizationRow {
  employeeId: string
  employeeNo: string
  firstName: string
  lastName: string
  middleName: string | null
  department: string | null
  isMinimumWageEarner: boolean
  isExemptFromTax: boolean
  basicSalary: number
  payslipCount: number
  totalGross: number
  totalBasic: number
  totalTaxable: number
  totalNonTaxable: number
  totalSss: number
  totalPhilhealth: number
  totalPagibig: number
  totalThirteenth: number
  totalDeMinimis: number
  totalOvertime: number
  totalHoliday: number
  totalNightDiff: number
  totalTaxWithheld: number
  annualTaxableIncome: number
  annualTaxDue: number
  refundOrAdditional: number
}
interface AnnualizationSummary {
  year: number
  employeeCount: number
  totalGross: number
  totalTaxWithheld: number
  totalTaxDue: number
  totalRefund: number
  totalAdditional: number
  rows: AnnualizationRow[]
}

function AnnualizationPanel({ year }: { year: number }) {
  const [data, setData]                   = useState<AnnualizationSummary | null>(null)
  const [loading, setLoading]             = useState(false)
  const [filter, setFilter]               = useState<'all' | 'refund' | 'additional' | 'zero'>('all')
  const [downloadingAll, setDownloadingAll] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/tax-annualization?year=${year}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error ?? 'Failed to compute annualization')
        setData(null)
        return
      }
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year])

  const filteredRows = useMemo(() => {
    if (!data) return []
    if (filter === 'refund')     return data.rows.filter(r => r.refundOrAdditional > 0.01)
    if (filter === 'additional') return data.rows.filter(r => r.refundOrAdditional < -0.01)
    if (filter === 'zero')       return data.rows.filter(r => Math.abs(r.refundOrAdditional) <= 0.01)
    return data.rows
  }, [data, filter])

  async function download2316(employeeId: string, lastName: string, firstName: string) {
    const url = `/api/reports/bir?type=2316&year=${year}&employeeId=${employeeId}`
    const res = await fetch(url)
    if (!res.ok) {
      toast.error('Failed to generate BIR 2316')
      return
    }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `BIR-2316-${year}-${lastName}-${firstName}.pdf`
    a.click()
  }

  async function downloadAll2316() {
    if (!data || data.rows.length === 0) return
    if (!confirm(`Generate BIR 2316 for ${data.rows.length} employees? This may take a minute.`)) return
    setDownloadingAll(true)
    try {
      for (const r of data.rows) {
        await download2316(r.employeeId, r.lastName, r.firstName)
      }
      toast.success(`Downloaded ${data.rows.length} BIR 2316 PDFs`)
    } finally {
      setDownloadingAll(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><AppSpinner size="md" /></div>
  }
  if (!data) {
    return <Card><CardContent className="p-8 text-center text-gray-400">No data</CardContent></Card>
  }
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Employees</p>
            <p className="text-2xl font-bold" style={{ color: '#2E4156' }}>{data.employeeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Gross Comp</p>
            <p className="text-xl font-bold text-[#1A2D42]">{peso(data.totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Tax Withheld YTD</p>
            <p className="text-xl font-bold text-orange-700">{peso(data.totalTaxWithheld)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Annual Tax Due</p>
            <p className="text-xl font-bold text-blue-700">{peso(data.totalTaxDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Net Refund / Owed</p>
            <p className="text-xl font-bold">
              {data.totalRefund - data.totalAdditional >= 0 ? (
                <span className="text-green-700">+{peso(data.totalRefund - data.totalAdditional)}</span>
              ) : (
                <span className="text-red-700">{peso(data.totalRefund - data.totalAdditional)}</span>
              )}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {peso(data.totalRefund)} refund · {peso(data.totalAdditional)} additional
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 flex-wrap">
          {([
            { val: 'all',        label: `All (${data.rows.length})` },
            { val: 'refund',     label: `Refund Due (${data.rows.filter(r => r.refundOrAdditional > 0.01).length})` },
            { val: 'additional', label: `Additional Owed (${data.rows.filter(r => r.refundOrAdditional < -0.01).length})` },
            { val: 'zero',       label: `Settled (${data.rows.filter(r => Math.abs(r.refundOrAdditional) <= 0.01).length})` },
          ] as { val: typeof filter; label: string }[]).map(({ val, label }) => (
            <Button
              key={val}
              variant={filter === val ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(val)}
              style={filter === val ? { background: '#2E4156' } : {}}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button
          onClick={downloadAll2316}
          disabled={data.rows.length === 0 || downloadingAll}
          style={{ background: '#fa5e01' }}
        >
          <FileDown className="w-4 h-4 mr-2" />
          {downloadingAll ? 'Downloading…' : `Generate All BIR 2316 (${data.rows.length})`}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Year-End Tax Annualization — {year}
            <Badge variant="outline">{filteredRows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
              <AlertCircle className="w-5 h-5 text-gray-300" />
              No employees match this filter for {year}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="text-left p-3 font-medium">Employee</th>
                    <th className="text-right p-3 font-medium">Payslips</th>
                    <th className="text-right p-3 font-medium">Gross + 13th</th>
                    <th className="text-right p-3 font-medium">Annual Taxable</th>
                    <th className="text-right p-3 font-medium">Tax Withheld</th>
                    <th className="text-right p-3 font-medium">Annual Tax Due</th>
                    <th className="text-right p-3 font-medium">Refund / Owed</th>
                    <th className="text-center p-3 font-medium">Form 2316</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(r => {
                    const isRefund = r.refundOrAdditional > 0.01
                    const isOwed   = r.refundOrAdditional < -0.01
                    const grossWith13th = r.totalGross + r.totalThirteenth
                    return (
                      <tr key={r.employeeId} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium">{r.lastName}, {r.firstName}</div>
                          <div className="text-xs text-gray-400">
                            {r.employeeNo}
                            {r.department && ` · ${r.department}`}
                            {r.isMinimumWageEarner && <span className="ml-1 text-green-600">· MWE</span>}
                            {r.isExemptFromTax && <span className="ml-1 text-purple-600">· Tax-Exempt</span>}
                          </div>
                        </td>
                        <td className="p-3 text-right text-gray-500">{r.payslipCount}</td>
                        <td className="p-3 text-right">{peso(grossWith13th)}</td>
                        <td className="p-3 text-right text-gray-600">{peso(r.annualTaxableIncome)}</td>
                        <td className="p-3 text-right text-orange-700">{peso(r.totalTaxWithheld)}</td>
                        <td className="p-3 text-right text-blue-700">{peso(r.annualTaxDue)}</td>
                        <td className="p-3 text-right">
                          {isRefund ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                              <ArrowDownLeft className="w-3 h-3" />
                              Refund {peso(r.refundOrAdditional)}
                            </span>
                          ) : isOwed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                              <ArrowUpRight className="w-3 h-3" />
                              Owed {peso(Math.abs(r.refundOrAdditional))}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Settled</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => download2316(r.employeeId, r.lastName, r.firstName)}
                          >
                            <Download className="w-3 h-3 mr-1" />2316
                          </Button>
                        </td>
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
          <p className="text-gray-500 text-sm mt-0.5">
            BIR 1601C, Form 2316, Alphalist 1604CF, and year-end tax annualization
          </p>
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
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="1601c">1601C</TabsTrigger>
          <TabsTrigger value="2316">Form 2316</TabsTrigger>
          <TabsTrigger value="alphalist">1604CF</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="annualization">Annualization</TabsTrigger>
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
                for employees earning purely compensation income. Use the <strong>Annualization</strong> tab
                to generate all 2316 PDFs at once.
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

        {/* Year-End Tax Annualization */}
        <TabsContent value="annualization" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Year-End Tax Annualization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-gray-600">
                Per BIR Revenue Regulation No. 2-98, annualizes every employee&apos;s compensation for {year} and
                surfaces the refund-due or additional-withholding required. Click any row&apos;s
                <strong> 2316</strong> button for that employee&apos;s certificate, or use
                <strong> Generate All</strong> to download every PDF at once.
              </p>
            </CardContent>
          </Card>

          <AnnualizationPanel year={year} />
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
