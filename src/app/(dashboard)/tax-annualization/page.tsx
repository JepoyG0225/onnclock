'use client'
import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Calculator, Download, FileDown, AlertCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { peso } from '@/lib/utils'
import { toast } from 'sonner'

interface Row {
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

interface Summary {
  year: number
  employeeCount: number
  totalGross: number
  totalTaxWithheld: number
  totalTaxDue: number
  totalRefund: number
  totalAdditional: number
  rows: Row[]
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

export default function TaxAnnualizationPage() {
  const [year, setYear]       = useState(CURRENT_YEAR)
  const [data, setData]       = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState<'all' | 'refund' | 'additional' | 'zero'>('all')
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
      // Sequentially fetch each 2316 PDF (already supported by /api/reports/bir).
      for (const r of data.rows) {
        await download2316(r.employeeId, r.lastName, r.firstName)
      }
      toast.success(`Downloaded ${data.rows.length} BIR 2316 PDFs`)
    } finally {
      setDownloadingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Year-End Tax Annualization</h1>
          <p className="text-slate-500 text-sm mt-1">
            Annualized income tax review per BIR RR No. 2-98. Surfaces refund-due / additional-withholding for the year and prints BIR Form 2316 per employee.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border rounded px-3 py-2 text-sm"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button
            onClick={downloadAll2316}
            disabled={!data || data.rows.length === 0 || downloadingAll}
            style={{ background: '#fa5e01' }}
          >
            <FileDown className="w-4 h-4 mr-2" />
            {downloadingAll ? 'Downloading…' : `Generate All BIR 2316 (${data?.rows.length ?? 0})`}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><AppSpinner size="md" /></div>
      ) : !data ? (
        <Card><CardContent className="p-8 text-center text-gray-400">No data</CardContent></Card>
      ) : (
        <>
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
                <p className="text-xs text-gray-500">Net Refund / Additional</p>
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

          {/* Filters */}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Annualization — {year}
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
        </>
      )}
    </div>
  )
}
