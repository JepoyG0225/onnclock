'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface IncomeTypeItem {
  id: string
  name: string
  code: string | null
  mode: 'FIXED' | 'VARIABLE'
  defaultAmount: number
  isTaxable: boolean
  excludeFrom2316: boolean
  prorate: boolean
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
    excludeFrom2316: false,
    prorate: false,
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
      setNewIncomeType({ name: '', code: '', mode: 'VARIABLE', defaultAmount: 0, isTaxable: true, excludeFrom2316: false, prorate: false })
      await loadIncomeTypes()
    } finally {
      setCreatingIncomeType(false)
    }
  }

  const [editingType, setEditingType] = useState<IncomeTypeItem | null>(null)
  const [editForm, setEditForm] = useState({ name: '', code: '', mode: 'VARIABLE' as 'FIXED' | 'VARIABLE', defaultAmount: 0, isTaxable: true, excludeFrom2316: false, prorate: false })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openEdit(type: IncomeTypeItem) {
    setEditingType(type)
    setEditForm({
      name: type.name,
      code: type.code ?? '',
      mode: type.mode,
      defaultAmount: type.defaultAmount,
      isTaxable: type.isTaxable,
      excludeFrom2316: type.excludeFrom2316,
      prorate: type.prorate,
    })
  }

  async function saveEdit() {
    if (!editingType) return
    if (!editForm.name.trim()) {
      toast.error('Income type name is required')
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/income-types/${editingType.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to update income type')
        return
      }
      toast.success('Income type updated')
      setEditingType(null)
      await loadIncomeTypes()
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteIncomeType(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/income-types/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to deactivate income type')
        return
      }
      toast.success('Income type deactivated')
      await loadIncomeTypes()
    } finally {
      setDeletingId(null)
    }
  }

  async function toggleExcludeFrom2316(id: string, current: boolean) {
    const res = await fetch(`/api/income-types/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludeFrom2316: !current }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || 'Failed to update income type')
      return
    }
    setIncomeTypes(prev => prev.map(t => t.id === id ? { ...t, excludeFrom2316: !current } : t))
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
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-amber-50 border-amber-200">
          <Switch
            checked={newIncomeType.excludeFrom2316}
            onCheckedChange={v => setNewIncomeType(prev => ({ ...prev, excludeFrom2316: v }))}
          />
          <div>
            <p className="text-sm font-medium">Exclude from BIR Form 2316</p>
            <p className="text-xs text-gray-500">This income type will not appear in the employee&apos;s annual BIR 2316 totals.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-blue-50 border-blue-200">
          <Switch
            checked={newIncomeType.prorate}
            onCheckedChange={v => setNewIncomeType(prev => ({ ...prev, prorate: v }))}
          />
          <div>
            <p className="text-sm font-medium">Pro-rate by days employed</p>
            <p className="text-xs text-gray-500">A mid-period joiner/leaver gets a partial amount (amount × employed working days ÷ period working days) instead of the full one.</p>
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
              <div key={type.id} className="flex items-center justify-between border rounded-lg px-3 py-2 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{type.name}{type.code ? <span className="ml-1 text-xs text-gray-400">({type.code})</span> : null}</p>
                  <p className="text-xs text-gray-500">
                    {type.mode === 'FIXED' ? `Fixed: PHP ${Number(type.defaultAmount).toFixed(2)}` : 'Variable'}
                    {' • '}
                    {type.isTaxable ? 'Taxable' : 'Non-taxable'}
                    {type.excludeFrom2316 && (
                      <span className="ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">Excl. 2316</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 hidden sm:block">Excl. 2316</span>
                    <Switch
                      checked={type.excludeFrom2316}
                      onCheckedChange={() => toggleExcludeFrom2316(type.id, type.excludeFrom2316)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(type)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                    disabled={deletingId === type.id}
                    onClick={() => deleteIncomeType(type.id)}
                  >
                    {deletingId === type.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <Dialog open={!!editingType} onOpenChange={open => { if (!open) setEditingType(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Income Type</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Code (optional)</label>
                <Input
                  value={editForm.code}
                  onChange={e => setEditForm(prev => ({ ...prev, code: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Mode</label>
                <Select
                  value={editForm.mode}
                  onValueChange={v => setEditForm(prev => ({ ...prev, mode: v as 'FIXED' | 'VARIABLE' }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VARIABLE">Variable (input per payroll run)</SelectItem>
                    <SelectItem value="FIXED">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Default Fixed Amount</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={editForm.mode !== 'FIXED'}
                  value={editForm.defaultAmount}
                  onChange={e => setEditForm(prev => ({ ...prev, defaultAmount: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm font-medium">Taxable</span>
                <Switch
                  checked={editForm.isTaxable}
                  onCheckedChange={v => setEditForm(prev => ({ ...prev, isTaxable: v }))}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-amber-50 border-amber-200">
                <Switch
                  checked={editForm.excludeFrom2316}
                  onCheckedChange={v => setEditForm(prev => ({ ...prev, excludeFrom2316: v }))}
                />
                <div>
                  <p className="text-sm font-medium">Exclude from BIR Form 2316</p>
                  <p className="text-xs text-gray-500">This income type will not appear in the employee&apos;s annual BIR 2316 totals.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-blue-50 border-blue-200">
                <Switch
                  checked={editForm.prorate}
                  onCheckedChange={v => setEditForm(prev => ({ ...prev, prorate: v }))}
                />
                <div>
                  <p className="text-sm font-medium">Pro-rate by days employed</p>
                  <p className="text-xs text-gray-500">A mid-period joiner/leaver gets a partial amount instead of the full one.</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingType(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

