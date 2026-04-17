'use client'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  UserMinus,
  Plus,
  CheckCircle2,
  Circle,
  ChevronRight,
  Users,
  Briefcase,
  CalendarDays,
  ClipboardList,
  XCircle,
  Pencil,
  Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  department?: { name: string } | null
  position?: { title: string } | null
}

interface OffboardingProcess {
  id: string
  employeeId: string
  reason: string
  lastWorkingDate: string
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  notes: string | null
  createdAt: string
  itemsTotal: number
  itemsDone: number
  employee: Employee
}

interface OffboardingItem {
  id: string
  category: string
  title: string
  description?: string | null
  isDone: boolean
  doneAt?: string | null
  notes?: string | null
  sortOrder: number
}

interface OffboardingDetail extends OffboardingProcess {
  items: OffboardingItem[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  RESIGNATION: 'Resignation',
  TERMINATION: 'Termination',
  RETIREMENT: 'Retirement',
  END_OF_CONTRACT: 'End of Contract',
  REDUNDANCY: 'Redundancy',
}

const CATEGORIES = ['HR', 'Finance', 'IT', 'Admin', 'Other']
const CATEGORY_ORDER = ['HR', 'Finance', 'IT', 'Admin', 'Other']

const CATEGORY_COLORS: Record<string, string> = {
  HR: 'bg-blue-50 border-blue-200 text-blue-700',
  Finance: 'bg-green-50 border-green-200 text-green-700',
  IT: 'bg-purple-50 border-purple-200 text-purple-700',
  Admin: 'bg-orange-50 border-orange-200 text-orange-700',
  Other: 'bg-gray-50 border-gray-200 text-gray-700',
}

const CATEGORY_DOT: Record<string, string> = {
  HR: 'bg-blue-500',
  Finance: 'bg-green-500',
  IT: 'bg-purple-500',
  Admin: 'bg-orange-500',
  Other: 'bg-gray-400',
}

function statusBadge(status: string) {
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700'
  if (status === 'COMPLETED') return 'bg-green-100 text-green-700'
  if (status === 'CANCELLED') return 'bg-gray-100 text-gray-500'
  return 'bg-gray-100 text-gray-500'
}

function statusLabel(status: string) {
  if (status === 'IN_PROGRESS') return 'In Progress'
  if (status === 'COMPLETED') return 'Completed'
  if (status === 'CANCELLED') return 'Cancelled'
  return status
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OffboardingPage() {
  const [processes, setProcesses] = useState<OffboardingProcess[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>('ALL')
  const [selected, setSelected] = useState<OffboardingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Start offboarding dialog
  const [showCreate, setShowCreate] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employeeId: '',
    reason: 'RESIGNATION',
    lastWorkingDate: '',
    notes: '',
  })

  const loadProcesses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (activeTab !== 'ALL') params.set('status', activeTab)
      const res = await fetch(`/api/offboarding?${params}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setProcesses(data.processes)
    } catch {
      toast.error('Failed to load offboarding processes')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { loadProcesses() }, [loadProcesses])

  async function loadDetail(id: string) {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/offboarding/${id}`)
      if (!res.ok) throw new Error('Failed to load detail')
      const data = await res.json()
      setSelected(data.process)
    } catch {
      toast.error('Failed to load details')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleSelectProcess(p: OffboardingProcess) {
    await loadDetail(p.id)
  }

  async function handleToggleItem(item: OffboardingItem) {
    if (!selected) return
    const newDone = !item.isDone
    setSelected(prev => prev ? {
      ...prev,
      items: prev.items.map(i => i.id === item.id ? { ...i, isDone: newDone } : i),
      itemsDone: prev.items.filter(i => i.isDone).length + (newDone ? 1 : -1),
    } : prev)

    try {
      const res = await fetch(`/api/offboarding/${selected.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDone: newDone }),
      })
      if (!res.ok) throw new Error('Failed to update')
      const data = await res.json()
      setSelected(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === item.id ? { ...i, ...data.item } : i),
      } : prev)
      setProcesses(prev => prev.map(p => p.id === selected.id ? {
        ...p,
        itemsDone: p.itemsDone + (newDone ? 1 : -1),
      } : p))
    } catch {
      toast.error('Failed to update item')
      await loadDetail(selected.id)
    }
  }

  async function handleUpdateStatus(status: 'COMPLETED' | 'CANCELLED') {
    if (!selected) return
    const label = status === 'COMPLETED' ? 'complete' : 'cancel'
    if (!confirm(`Are you sure you want to ${label} this offboarding process?`)) return

    try {
      const res = await fetch(`/api/offboarding/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast.success(`Process marked as ${statusLabel(status)}`)
      await loadDetail(selected.id)
      await loadProcesses()
    } catch {
      toast.error('Failed to update status')
    }
  }

  async function handleOpenCreate() {
    setShowCreate(true)
    if (employees.length === 0) {
      try {
        const res = await fetch('/api/employees?limit=200')
        if (res.ok) {
          const data = await res.json()
          setEmployees(data.employees ?? data.data ?? [])
        }
      } catch { /* ignore */ }
    }
  }

  async function handleCreate() {
    if (!form.employeeId || !form.lastWorkingDate) {
      toast.error('Please fill in all required fields')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/offboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: form.employeeId,
          reason: form.reason,
          lastWorkingDate: form.lastWorkingDate,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create')
      }
      const data = await res.json()
      toast.success('Offboarding process started')
      setShowCreate(false)
      setForm({ employeeId: '', reason: 'RESIGNATION', lastWorkingDate: '', notes: '' })
      await loadProcesses()
      await loadDetail(data.process.id)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create offboarding')
    } finally {
      setSaving(false)
    }
  }

  function handleItemsChanged(updatedItems: OffboardingItem[]) {
    if (!selected) return
    const done = updatedItems.filter(i => i.isDone).length
    setSelected(prev => prev ? { ...prev, items: updatedItems, itemsTotal: updatedItems.length, itemsDone: done } : prev)
    setProcesses(prev => prev.map(p => p.id === selected.id
      ? { ...p, itemsTotal: updatedItems.length, itemsDone: done }
      : p
    ))
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'ALL', label: 'All' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'CANCELLED', label: 'Cancelled' },
  ] as const

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserMinus className="w-6 h-6 text-[#fa5e01]" />
            Offboarding
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">Manage employee exit processes and clearance checklists</p>
        </div>
        <Button onClick={handleOpenCreate} className="bg-[#1A2D42] hover:bg-[#243d57] text-white">
          <Plus className="w-4 h-4 mr-2" />
          Start Offboarding
        </Button>
      </div>

      {/* Tab filter */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelected(null) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-[#fa5e01] text-[#fa5e01]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.key !== 'ALL' && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                {processes.filter(p => p.status === tab.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ height: 'calc(100vh - 220px)' }}>
        {/* Left: List */}
        <div className="w-80 flex-shrink-0 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(n => (
                <div key={n} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UserMinus className="w-12 h-12 text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">No offboarding processes</p>
              <p className="text-gray-400 text-sm mt-1">Click &quot;Start Offboarding&quot; to begin</p>
            </div>
          ) : (
            processes.map(p => {
              const isSelected = selected?.id === p.id
              const pct = p.itemsTotal > 0 ? Math.round((p.itemsDone / p.itemsTotal) * 100) : 0
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectProcess(p)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[#fa5e01] bg-orange-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {p.employee.lastName}, {p.employee.firstName}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.employee.employeeNo}
                        {p.employee.department && ` · ${p.employee.department.name}`}
                      </p>
                    </div>
                    <Badge className={`text-xs border-0 flex-shrink-0 ${statusBadge(p.status)}`}>
                      {statusLabel(p.status)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">{REASON_LABELS[p.reason] ?? p.reason}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {format(new Date(p.lastWorkingDate), 'MMM d, yyyy')}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{p.itemsDone}/{p.itemsTotal} items</span>
                      <span className="text-xs font-medium text-gray-600">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: pct === 100 ? '#22c55e' : '#fa5e01',
                        }}
                      />
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex items-center justify-end mt-1">
                      <ChevronRight className="w-3.5 h-3.5 text-[#fa5e01]" />
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {detailLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="w-8 h-8 border-2 border-[#fa5e01] border-t-transparent rounded-full animate-spin mx-auto" />
              </CardContent>
            </Card>
          ) : selected ? (
            <DetailPanel
              process={selected}
              onToggleItem={handleToggleItem}
              onUpdateStatus={handleUpdateStatus}
              onItemsChanged={handleItemsChanged}
            />
          ) : (
            <Card className="h-full">
              <CardContent className="flex flex-col items-center justify-center h-full py-20 text-center">
                <ClipboardList className="w-16 h-16 text-gray-200 mb-4" />
                <p className="text-gray-500 font-medium text-lg">Select an offboarding process</p>
                <p className="text-gray-400 text-sm mt-1">Click any item on the left to view its checklist</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-[#fa5e01]" />
              Start Offboarding
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee <span className="text-red-500">*</span>
              </label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeNo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Working Date <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={form.lastWorkingDate}
                onChange={e => setForm(f => ({ ...f, lastWorkingDate: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="bg-[#1A2D42] hover:bg-[#243d57] text-white"
            >
              {saving ? 'Starting…' : 'Start Offboarding'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  process,
  onToggleItem,
  onUpdateStatus,
  onItemsChanged,
}: {
  process: OffboardingDetail
  onToggleItem: (item: OffboardingItem) => void
  onUpdateStatus: (status: 'COMPLETED' | 'CANCELLED') => void
  onItemsChanged: (items: OffboardingItem[]) => void
}) {
  const [itemDialog, setItemDialog] = useState<{
    open: boolean
    mode: 'add' | 'edit'
    item?: OffboardingItem
    defaultCategory?: string
  }>({ open: false, mode: 'add' })
  const [itemForm, setItemForm] = useState({ title: '', description: '', category: 'HR' })
  const [itemSaving, setItemSaving] = useState(false)

  const pct = process.itemsTotal > 0
    ? Math.round((process.itemsDone / process.itemsTotal) * 100)
    : 0

  // Group items — include categories not in CATEGORY_ORDER too
  const allCategories = Array.from(new Set([
    ...CATEGORY_ORDER,
    ...process.items.map(i => i.category),
  ]))

  const grouped = allCategories.reduce<Record<string, OffboardingItem[]>>((acc, cat) => {
    const items = process.items.filter(i => i.category === cat).sort((a, b) => a.sortOrder - b.sortOrder)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  function openAdd(defaultCategory = 'HR') {
    setItemForm({ title: '', description: '', category: defaultCategory })
    setItemDialog({ open: true, mode: 'add', defaultCategory })
  }

  function openEdit(item: OffboardingItem) {
    setItemForm({ title: item.title, description: item.description ?? '', category: item.category })
    setItemDialog({ open: true, mode: 'edit', item })
  }

  async function handleSaveItem() {
    if (!itemForm.title.trim()) {
      toast.error('Title is required')
      return
    }
    setItemSaving(true)
    try {
      if (itemDialog.mode === 'add') {
        const res = await fetch(`/api/offboarding/${process.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: itemForm.category,
            title: itemForm.title.trim(),
            description: itemForm.description.trim() || null,
          }),
        })
        if (!res.ok) throw new Error('Failed to add item')
        const data = await res.json()
        onItemsChanged([...process.items, data.item])
        toast.success('Item added')
      } else if (itemDialog.item) {
        const res = await fetch(`/api/offboarding/${process.id}/items/${itemDialog.item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: itemForm.title.trim(),
            description: itemForm.description.trim() || null,
            category: itemForm.category,
          }),
        })
        if (!res.ok) throw new Error('Failed to update item')
        const data = await res.json()
        onItemsChanged(process.items.map(i => i.id === data.item.id ? data.item : i))
        toast.success('Item updated')
      }
      setItemDialog({ open: false, mode: 'add' })
    } catch {
      toast.error('Failed to save item')
    } finally {
      setItemSaving(false)
    }
  }

  async function handleDeleteItem(item: OffboardingItem) {
    if (!confirm(`Delete "${item.title}"?`)) return
    try {
      const res = await fetch(`/api/offboarding/${process.id}/items/${item.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      onItemsChanged(process.items.filter(i => i.id !== item.id))
      toast.success('Item deleted')
    } catch {
      toast.error('Failed to delete item')
    }
  }

  return (
    <div className="space-y-4">
      {/* Process header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-gray-900">
                  {process.employee.lastName}, {process.employee.firstName}
                </h2>
                <Badge className={`text-xs border-0 ${statusBadge(process.status)}`}>
                  {statusLabel(process.status)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {process.employee.department?.name ?? '—'}
                </span>
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {process.employee.position?.title ?? '—'}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Last day: <strong className="text-gray-700">{format(new Date(process.lastWorkingDate), 'MMMM d, yyyy')}</strong>
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium text-gray-600">{REASON_LABELS[process.reason] ?? process.reason}</span>
                {process.notes && <><span className="text-gray-300">·</span><span className="italic">{process.notes}</span></>}
              </div>
            </div>

            {process.status === 'IN_PROGRESS' && (
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => onUpdateStatus('CANCELLED')}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => onUpdateStatus('COMPLETED')}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Mark Complete
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-600">Overall Progress</span>
              <span className="font-semibold text-gray-800">{process.itemsDone} / {process.itemsTotal} items done ({pct}%)</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: pct === 100
                    ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                    : 'linear-gradient(90deg, #fa5e01, #fb923c)',
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist grouped by category */}
      {Object.entries(grouped).map(([cat, items]) => {
        const catDone = items.filter(i => i.isDone).length
        const colorClass = CATEGORY_COLORS[cat] ?? 'bg-gray-50 border-gray-200 text-gray-700'
        const dotClass = CATEGORY_DOT[cat] ?? 'bg-gray-400'
        return (
          <Card key={cat}>
            <CardContent className="p-0">
              <div className={`flex items-center justify-between px-4 py-3 border-b ${colorClass}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                  <span className="font-semibold text-sm">{cat}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium opacity-75">{catDone}/{items.length}</span>
                  {process.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => openAdd(cat)}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      title={`Add item to ${cat}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <ul className="divide-y divide-gray-100">
                {items.map(item => (
                  <li key={item.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <button
                      onClick={() => process.status === 'IN_PROGRESS' && onToggleItem(item)}
                      disabled={process.status !== 'IN_PROGRESS'}
                      className={`mt-0.5 flex-shrink-0 transition-colors ${
                        process.status !== 'IN_PROGRESS' ? 'cursor-default opacity-60' : 'hover:scale-110'
                      }`}
                    >
                      {item.isDone
                        ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                        : <Circle className="w-5 h-5 text-gray-300" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${item.isDone ? 'line-through text-gray-400' : 'text-gray-700 font-medium'}`}>
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                      )}
                      {item.isDone && item.doneAt && (
                        <p className="text-xs text-green-500 mt-0.5">
                          Done {format(new Date(item.doneAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}
                    </div>
                    {/* Edit / Delete — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Edit item"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Add item inline button */}
              {process.status === 'IN_PROGRESS' && (
                <button
                  onClick={() => openAdd(cat)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add item to {cat}
                </button>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* Add to new category */}
      {process.status === 'IN_PROGRESS' && (
        <button
          onClick={() => openAdd('Other')}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add custom checklist item
        </button>
      )}

      {/* Add / Edit item dialog */}
      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {itemDialog.mode === 'add' ? 'Add Checklist Item' : 'Edit Checklist Item'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <Select
                value={itemForm.category}
                onValueChange={v => setItemForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <Input
                value={itemForm.title}
                onChange={e => setItemForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Return company laptop"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <Input
                value={itemForm.description}
                onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Additional details…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(d => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveItem}
              disabled={itemSaving}
              className="bg-[#1A2D42] hover:bg-[#243d57] text-white"
            >
              {itemSaving ? 'Saving…' : itemDialog.mode === 'add' ? 'Add Item' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
