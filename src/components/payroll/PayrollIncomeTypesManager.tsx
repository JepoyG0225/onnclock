'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface IncomeTypeItem {
  id: string
  name: string
  code: string | null
  mode: 'FIXED' | 'VARIABLE'
  defaultAmount: number
  isTaxable: boolean
}

export default function PayrollIncomeTypesManager() {
  const [incomeTypes, setIncomeTypes] = useState<IncomeTypeItem[]>([])
  const [incomeTypesLoading, setIncomeTypesLoading] = useState(false)
  const [creatingIncomeType, setCreatingIncomeType] = useState(false)
  const [newIncomeType, setNewIncomeType] = useState({
    name: '',
    code: '',
    mode: 'VARIABLE' as 'FIXED' | 'VARIABLE',
    defaultAmount: 0,
    isTaxable: true,
  })

  async function loadIncomeTypes() {
    setIncomeTypesLoading(true)
    try {
      const res = await fetch('/api/income-types')
      const data = await res.json().catch(() => ({}))
      const list = Array.isArray(data.incomeTypes) ? data.incomeTypes : []
      setIncomeTypes(list.map((item: IncomeTypeItem & { defaultAmount: number | string }) => ({
        ...item,
        defaultAmount: Number(item.defaultAmount ?? 0),
      })))
    } finally {
      setIncomeTypesLoading(false)
    }
  }

  useEffect(() => {
    void loadIncomeTypes()
  }, [])

  async function createIncomeType() {
    if (!newIncomeType.name.trim()) {
      toast.error('Income type name is required')
      return
    }
    setCreatingIncomeType(true)
    try {
      const res = await fetch('/api/income-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIncomeType),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to create income type')
        return
      }
      toast.success('Income type created')
      setNewIncomeType({ name: '', code: '', mode: 'VARIABLE', defaultAmount: 0, isTaxable: true })
      await loadIncomeTypes()
    } finally {
      setCreatingIncomeType(false)
    }
  }

  async function deactivateIncomeType(id: string) {
    const res = await fetch(`/api/income-types/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || 'Failed to deactivate income type')
      return
    }
    toast.success('Income type deactivated')
    await loadIncomeTypes()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Other Income Types (Company-Wide)</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          Create allowance, commission, bonus, and other income types for payroll.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <Input
            placeholder="Type name (e.g. Commission)"
            value={newIncomeType.name}
            onChange={e => setNewIncomeType(prev => ({ ...prev, name: e.target.value }))}
          />
          <Input
            placeholder="Code (optional)"
            value={newIncomeType.code}
            onChange={e => setNewIncomeType(prev => ({ ...prev, code: e.target.value }))}
          />
          <Select
            value={newIncomeType.mode}
            onValueChange={v => setNewIncomeType(prev => ({ ...prev, mode: v as 'FIXED' | 'VARIABLE' }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="VARIABLE">Variable (input per payroll run)</SelectItem>
              <SelectItem value="FIXED">Fixed amount</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step="0.01"
            disabled={newIncomeType.mode !== 'FIXED'}
            placeholder="Default fixed amount"
            value={newIncomeType.defaultAmount}
            onChange={e => setNewIncomeType(prev => ({ ...prev, defaultAmount: Number(e.target.value || 0) }))}
          />
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm">Taxable</span>
            <Switch
              checked={newIncomeType.isTaxable}
              onCheckedChange={v => setNewIncomeType(prev => ({ ...prev, isTaxable: v }))}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={createIncomeType} disabled={creatingIncomeType}>
            {creatingIncomeType ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Create Income Type'}
          </Button>
        </div>

        <div className="space-y-2">
          {incomeTypesLoading ? (
            <p className="text-sm text-gray-400">Loading income types...</p>
          ) : incomeTypes.length === 0 ? (
            <p className="text-sm text-gray-400">No income types yet.</p>
          ) : (
            incomeTypes.map(type => (
              <div key={type.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{type.name}</p>
                  <p className="text-xs text-gray-500">
                    {type.mode === 'FIXED' ? `Fixed: PHP ${Number(type.defaultAmount).toFixed(2)}` : 'Variable'}
                    {' • '}
                    {type.isTaxable ? 'Taxable' : 'Non-taxable'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                  onClick={() => deactivateIncomeType(type.id)}
                >
                  Deactivate
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

