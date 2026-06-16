'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Plus, UserPlus, Undo2, Trash2, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { toast } from 'sonner'

type Asset = {
  id: string
  assetTag: string | null
  category: string
  name: string
  serialNumber: string | null
  purchaseDate: string | null
  purchaseCost: number | string | null
  warrantyUntil: string | null
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED' | 'LOST'
  notes: string | null
  assignments: { id: string; assignedAt: string; employee: { id: string; firstName: string; lastName: string; employeeNo: string } }[]
}

type Employee = { id: string; firstName: string; lastName: string; employeeNo: string }

const STATUS_CLR: Record<Asset['status'], string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ASSIGNED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_REPAIR: 'bg-amber-50 text-amber-700 border-amber-200',
  RETIRED: 'bg-slate-100 text-slate-600 border-slate-200',
  LOST: 'bg-red-50 text-red-700 border-red-200',
}

const DEFAULT_CATEGORIES = ['Laptop', 'Desktop', 'Phone', 'ID Card', 'Uniform', 'Tablet', 'Headset', 'Vehicle', 'Other']

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<string>('')

  // Add asset modal
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    assetTag: '', category: 'Laptop', name: '', serialNumber: '',
    purchaseDate: '', purchaseCost: '', warrantyUntil: '', notes: '',
  })

  // Assign modal
  const [assignFor, setAssignFor] = useState<Asset | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assignTo, setAssignTo] = useState('')
  const [assignCondition, setAssignCondition] = useState('')
  const [assigning, setAssigning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filterStatus) qs.set('status', filterStatus)
      if (filterCategory) qs.set('category', filterCategory)
      const res = await fetch(`/api/assets${qs.toString() ? `?${qs.toString()}` : ''}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setAssets(data.assets ?? [])
    } finally { setLoading(false) }
  }, [filterStatus, filterCategory])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!assignFor) return
    void fetch('/api/employees?limit=500')
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? []))
      .catch(() => setEmployees([]))
  }, [assignFor])

  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES)
    assets.forEach((a) => set.add(a.category))
    return Array.from(set).sort()
  }, [assets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return assets
    return assets.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.assetTag ?? '').toLowerCase().includes(q) ||
      (a.serialNumber ?? '').toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.assignments[0]?.employee
        ? `${a.assignments[0].employee.firstName} ${a.assignments[0].employee.lastName}`.toLowerCase().includes(q)
        : false,
    )
  }, [assets, search])

  const summary = useMemo(() => ({
    total: assets.length,
    available: assets.filter((a) => a.status === 'AVAILABLE').length,
    assigned: assets.filter((a) => a.status === 'ASSIGNED').length,
    inRepair: assets.filter((a) => a.status === 'IN_REPAIR').length,
  }), [assets])

  async function submitAdd() {
    if (!form.name.trim() || !form.category.trim()) { toast.error('Name + category required'); return }
    setAdding(true)
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to add asset'); return }
      toast.success('Asset added')
      setShowAdd(false)
      setForm({ assetTag: '', category: 'Laptop', name: '', serialNumber: '', purchaseDate: '', purchaseCost: '', warrantyUntil: '', notes: '' })
      await load()
    } finally { setAdding(false) }
  }

  async function submitAssign() {
    if (!assignFor || !assignTo) { toast.error('Pick an employee'); return }
    setAssigning(true)
    try {
      const res = await fetch(`/api/assets/${assignFor.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: assignTo, conditionAtIssue: assignCondition || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to assign'); return }
      toast.success('Asset assigned')
      setAssignFor(null); setAssignTo(''); setAssignCondition('')
      await load()
    } finally { setAssigning(false) }
  }

  async function returnAsset(assetId: string) {
    if (!confirm('Mark this asset as returned?')) return
    const res = await fetch(`/api/assets/${assetId}/return`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? 'Failed'); return }
    toast.success('Asset return logged')
    await load()
  }

  async function deleteAsset(assetId: string) {
    if (!confirm('Delete this asset? Assignment history will be removed.')) return
    const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? 'Failed'); return }
    toast.success('Asset deleted')
    await load()
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-blue-600" />
            Assets & Equipment
          </h1>
          <p className="text-gray-500 text-sm mt-1">Track company-issued equipment, assignments, and returns.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Asset</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: summary.total },
          { label: 'Available', value: summary.available, cls: 'text-emerald-600' },
          { label: 'Assigned', value: summary.assigned, cls: 'text-blue-600' },
          { label: 'In Repair', value: summary.inRepair, cls: 'text-amber-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{s.label}</p>
              <p className={`text-2xl font-black mt-1 ${s.cls ?? 'text-slate-800'}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder="Search tag, serial, name, assigned employee..." />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border rounded px-3 py-2 text-sm bg-white">
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_REPAIR">In Repair</option>
            <option value="RETIRED">Retired</option>
            <option value="LOST">Lost</option>
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="border rounded px-3 py-2 text-sm bg-white">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{filtered.length} asset{filtered.length !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><AppSpinner size="md" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No assets match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Tag / Serial</th>
                    <th className="text-left p-3 font-medium text-gray-600">Category</th>
                    <th className="text-left p-3 font-medium text-gray-600">Name</th>
                    <th className="text-left p-3 font-medium text-gray-600">Assigned to</th>
                    <th className="text-center p-3 font-medium text-gray-600">Status</th>
                    <th className="text-center p-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const active = a.assignments[0]
                    return (
                      <tr key={a.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <p className="font-medium text-slate-800">{a.assetTag ?? '—'}</p>
                          <p className="text-xs text-slate-400">{a.serialNumber ?? ''}</p>
                        </td>
                        <td className="p-3"><Badge variant="outline">{a.category}</Badge></td>
                        <td className="p-3">{a.name}</td>
                        <td className="p-3 text-sm">
                          {active ? (
                            <>
                              <p>{active.employee.firstName} {active.employee.lastName}</p>
                              <p className="text-xs text-slate-400">{active.employee.employeeNo} · since {new Date(active.assignedAt).toLocaleDateString()}</p>
                            </>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_CLR[a.status]}`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center">
                            {a.status === 'AVAILABLE' && (
                              <Button size="sm" variant="outline" onClick={() => setAssignFor(a)} className="h-7 text-xs gap-1">
                                <UserPlus className="w-3 h-3" /> Assign
                              </Button>
                            )}
                            {a.status === 'ASSIGNED' && (
                              <Button size="sm" variant="outline" onClick={() => returnAsset(a.id)} className="h-7 text-xs gap-1">
                                <Undo2 className="w-3 h-3" /> Return
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => deleteAsset(a.id)} className="h-7 text-xs text-red-600 hover:bg-red-50">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
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

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <Card className="relative w-full max-w-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Add Asset</CardTitle>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs font-medium">Asset Tag</label><Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} placeholder="LK12-LP-001" /></div>
                <div><label className="text-xs font-medium">Category *</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div><label className="text-xs font-medium">Name / Description *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lenovo ThinkPad T14" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs font-medium">Serial</label><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
                <div><label className="text-xs font-medium">Purchase ₱</label><Input type="number" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs font-medium">Purchase date</label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
                <div><label className="text-xs font-medium">Warranty until</label><Input type="date" value={form.warrantyUntil} onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })} /></div>
              </div>
              <div><label className="text-xs font-medium">Notes</label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={submitAdd} disabled={adding} className="bg-blue-600 hover:bg-blue-700 text-white">{adding ? 'Saving…' : 'Add Asset'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assign modal */}
      {assignFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAssignFor(null)} />
          <Card className="relative w-full max-w-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Assign {assignFor.name}</CardTitle>
              <button onClick={() => setAssignFor(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">{assignFor.category} · Tag {assignFor.assetTag ?? '—'} · SN {assignFor.serialNumber ?? '—'}</p>
              <div>
                <label className="text-xs font-medium">Employee *</label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">— Select —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNo})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Condition at issue (optional)</label>
                <Input value={assignCondition} onChange={(e) => setAssignCondition(e.target.value)} placeholder="Brand new in sealed box" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setAssignFor(null)}>Cancel</Button>
                <Button onClick={submitAssign} disabled={assigning} className="bg-blue-600 hover:bg-blue-700 text-white">{assigning ? 'Assigning…' : 'Confirm Assignment'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
