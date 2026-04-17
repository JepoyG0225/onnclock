'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Calculator, Loader2 } from 'lucide-react'

type VariableIncomeRequirement = {
  employeeId: string
  employeeNo: string
  employeeName: string
  incomes: {
    incomeTypeId: string
    name: string
    isTaxable: boolean
    amount: number
  }[]
}

export function ComputePayrollButton({ runId }: { runId: string }) {
  const [computing, setComputing] = useState(false)
  const [loadingRequirements, setLoadingRequirements] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [requirements, setRequirements] = useState<VariableIncomeRequirement[]>([])
  const [entryValues, setEntryValues] = useState<Record<string, string>>({})
  const router = useRouter()

  const hasVariableIncome = requirements.some(r => r.incomes.length > 0)

  const requiredKeys = useMemo(() => {
    return requirements.flatMap(row => row.incomes.map(income => `${row.employeeId}:${income.incomeTypeId}`))
  }, [requirements])

  const flatEntries = useMemo(() => {
    return requirements.flatMap(row =>
      row.incomes.map(income => {
        const key = `${row.employeeId}:${income.incomeTypeId}`
        const rawValue = (entryValues[key] ?? '').trim()
        return {
          employeeId: row.employeeId,
          incomeTypeId: income.incomeTypeId,
          amount: rawValue === '' ? NaN : Number(rawValue),
        }
      })
    )
  }, [entryValues, requirements])

  async function runCompute(variableIncomeEntries: Array<{ employeeId: string; incomeTypeId: string; amount: number }>) {
    setComputing(true)
    try {
      const res = await fetch(`/api/payroll/${runId}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variableIncomeEntries }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Computation failed')
        return
      }

      const result = await res.json()
      toast.success(`Payroll computed for ${result.employeeCount} employees!`)
      setShowDialog(false)
      router.refresh()
    } catch {
      toast.error('An error occurred during computation')
    } finally {
      setComputing(false)
    }
  }

  async function handleCompute() {
    setLoadingRequirements(true)
    try {
      const res = await fetch(`/api/payroll/${runId}/compute`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to prepare payroll compute')
        return
      }

      const data = await res.json()
      const list = (data.variableIncomeRequirements ?? []) as VariableIncomeRequirement[]
      setRequirements(list)

      const initialEntries: Record<string, string> = {}
      for (const row of list) {
        for (const income of row.incomes) {
          initialEntries[`${row.employeeId}:${income.incomeTypeId}`] = String(Number(income.amount ?? 0))
        }
      }
      setEntryValues(initialEntries)

      if (list.length === 0) {
        await runCompute([])
        return
      }

      setShowDialog(true)
    } catch {
      toast.error('Failed to prepare payroll compute')
    } finally {
      setLoadingRequirements(false)
    }
  }

  return (
    <>
      <Button onClick={handleCompute} disabled={computing || loadingRequirements}>
        {computing || loadingRequirements ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {loadingRequirements ? 'Preparing...' : 'Computing...'}</>
        ) : (
          <><Calculator className="mr-2 h-4 w-4" /> Compute Payroll</>
        )}
      </Button>

      {showDialog && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !computing && setShowDialog(false)} />
          <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-xl p-5 space-y-4 max-h-[85vh] overflow-auto">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Enter Variable Other Income</h2>
              <p className="text-sm text-gray-500">Input commissions, allowances, bonuses, or other variable income for this payroll run.</p>
            </div>

            {!hasVariableIncome ? (
              <p className="text-sm text-gray-500">No variable income assignments found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">Employee</th>
                      <th className="text-left px-3 py-2">Income Type</th>
                      <th className="text-left px-3 py-2">Tax Status</th>
                      <th className="text-right px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.flatMap(row =>
                      row.incomes.map(income => {
                        const key = `${row.employeeId}:${income.incomeTypeId}`
                        return (
                          <tr key={key} className="border-t">
                            <td className="px-3 py-2">
                              {row.employeeName}
                              <p className="text-xs text-gray-400">{row.employeeNo}</p>
                            </td>
                            <td className="px-3 py-2">{income.name}</td>
                            <td className="px-3 py-2 text-xs">{income.isTaxable ? 'Taxable' : 'Non-taxable'}</td>
                            <td className="px-3 py-2 text-right">
                              <Input
                                className="text-right"
                                type="number"
                                min={0}
                                step="0.01"
                                value={entryValues[key] ?? ''}
                                onChange={e => setEntryValues(prev => ({ ...prev, [key]: e.target.value }))}
                              />
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)} disabled={computing}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const missing = requiredKeys.filter(key => (entryValues[key] ?? '').trim() === '')
                  if (missing.length > 0) {
                    toast.error('Please enter all required variable income amounts before computing')
                    return
                  }

                  const invalid = flatEntries.some(
                    entry => Number.isNaN(entry.amount) || !Number.isFinite(entry.amount) || entry.amount < 0
                  )
                  if (invalid) {
                    toast.error('Variable income amounts must be valid numbers greater than or equal to 0')
                    return
                  }

                  void runCompute(flatEntries)
                }}
                disabled={computing}
              >
                {computing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Computing...</> : 'Compute Payroll'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
