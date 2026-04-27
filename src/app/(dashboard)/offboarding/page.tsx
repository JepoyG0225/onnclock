'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
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
  Settings,
  FolderPlus,
  AlertTriangle,
  Lock,
  Star,
} from 'lucide-react'
import Link from 'next/link'
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

interface TemplateItem {
  id: string
  category: string
  title: string
  description?: string | null
  sortOrder: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  RESIGNATION: 'Resignation',
  TERMINATION: 'Termination',
  RETIREMENT: 'Retirement',
  END_OF_CONTRACT: 'End of Contract',
  REDUNDANCY: 'Redundancy',
}

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  HR: 'bg-blue-50 border-blue-200 text-blue-700',
  Finance: 'bg-green-50 border-green-200 text-green-700',
  IT: 'bg-purple-50 border-purple-200 text-purple-700',
  Admin: 'bg-orange-50 border-orange-200 text-orange-700',
  Other: 'bg-gray-50 border-gray-200 text-gray-700',
}

const DEFAULT_CATEGORY_DOTS: Record<string, string> = {
  HR: 'bg-blue-500',
  Finance: 'bg-green-500',
  IT: 'bg-purple-500',
  Admin: 'bg-orange-500',
  Other: 'bg-gray-400',
}

// Default template items — mirrors the DEFAULT_ITEMS in the API route
const DEFAULT_TEMPLATE = [
  { category: 'HR', title: 'Acceptance of resignation letter / Notice of termination' },
  { category: 'HR', title: 'Conduct exit interview' },
  { category: 'HR', title: 'Process final pay computation' },
  { category: 'HR', title: 'Issue Certificate of Employment (COE)' },
  { category: 'HR', title: 'Update employee status in system' },
  { category: 'Finance', title: 'Clearance from Finance / Accounting' },
  { category: 'Finance', title: 'Settle any outstanding cash advances or loans' },
  { category: 'IT', title: 'Return company laptop / equipment' },
  { category: 'IT', title: 'Revoke system access / deactivate accounts' },
  { category: 'IT', title: 'Return mobile phone / SIM' },
  { category: 'Admin', title: 'Return company ID / access card' },
  { category: 'Admin', title: 'Return office keys' },
  { category: 'Admin', title: 'Clear personal belongings from workspace' },
]

const PALETTE_COLORS = [
  { color: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-500' },
  { color: 'bg-green-50 border-green-200 text-green-700', dot: 'bg-green-500' },
  { color: 'bg-purple-50 border-purple-200 text-purple-700', dot: 'bg-purple-500' },
  { color: 'bg-orange-50 border-orange-200 text-orange-700', dot: 'bg-orange-500' },
  { color: 'bg-red-50 border-red-200 text-red-700', dot: 'bg-red-500' },
  { color: 'bg-yellow-50 border-yellow-200 text-yellow-700', dot: 'bg-yellow-500' },
  { color: 'bg-teal-50 border-teal-200 text-teal-700', dot: 'bg-teal-500' },
  { color: 'bg-gray-50 border-gray-200 text-gray-700', dot: 'bg-gray-400' },
]

function getCategoryColor(cat: string, index: number) {
  if (DEFAULT_CATEGORY_COLORS[cat]) return DEFAULT_CATEGORY_COLORS[cat]
  return PALETTE_COLORS[index % PALETTE_COLORS.length].color
}

function getCategoryDot(cat: string, index: number) {
  if (DEFAULT_CATEGORY_DOTS[cat]) return DEFAULT_CATEGORY_DOTS[cat]
  return PALETTE_COLORS[index % PALETTE_COLORS.length].dot
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

// ─── Inline Confirm Popup ─────────────────────────────────────────────────────

interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  variant: 'destructive' | 'success' | 'default'
  onConfirm: () => void
}

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <Dialog open={state.open} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state.variant === 'destructive' && <AlertTriangle className="w-5 h-5 text-red-500" />}
            {state.variant === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {state.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 py-1">{state.message}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => { onClose(); state.onConfirm() }}
            className={
              state.variant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : state.variant === 'success'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-[#1A2D42] hover:bg-[#243d57] text-white'
            }
          >
            {state.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OffboardingPage() {
  const [proLocked, setProLocked] = useState(false)
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

  // Template manager
  const [showTemplate, setShowTemplate] = useState(false)

  // Confirm dialog
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    variant: 'default',
    onConfirm: () => {},
  })

  function showConfirm(opts: Omit<ConfirmState, 'open'>) {
    setConfirmState({ ...opts, open: true })
  }

  const loadProcesses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (activeTab !== 'ALL') params.set('status', activeTab)
      const res = await fetch(`/api/offboarding?${params}`)
      if (res.status === 403) { setProLocked(true); setLoading(false); return }
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

    const doUpdate = async () => {
      try {
        const res = await fetch(`/api/offboarding/${selected.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        if (!res.ok) throw new Error('Failed to update')
        if (status === 'COMPLETED') {
          toast.success('Offboarding completed. Employee has been deactivated.')
        } else {
          toast.success(`Process marked as ${statusLabel(status)}`)
        }
        await loadDetail(selected.id)
        await loadProcesses()
      } catch {
        toast.error('Failed to update status')
      }
    }

    if (status === 'COMPLETED') {
      showConfirm({
        title: 'Mark as Completed',
        message: `This will complete the offboarding for ${selected.employee.firstName} ${selected.employee.lastName} and deactivate their account. This action cannot be undone.`,
        confirmLabel: 'Complete Offboarding',
        variant: 'success',
        onConfirm: doUpdate,
      })
    } else {
      showConfirm({
        title: 'Cancel Offboarding',
        message: `Are you sure you want to cancel the offboarding process for ${selected.employee.firstName} ${selected.employee.lastName}?`,
        confirmLabel: 'Cancel Process',
        variant: 'destructive',
        onConfirm: doUpdate,
      })
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

  if (proLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-[#1A2D42] to-[#2E4156] px-8 py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white">Pro Feature</h2>
            <p className="text-white/70 text-sm mt-2">Offboarding is available on the Pro plan (₱100/seat/month)</p>
          </div>
          <div className="px-8 py-6 space-y-4">
            <div className="space-y-2.5">
              {[
                'Structured employee exit checklists',
                'Multi-department clearance tracking',
                'Customizable offboarding templates',
                'Auto-deactivation on completion',
                'Also includes: Screen capture, Recruitment, Performance Reviews, and more',
              ].map(f => (
                <div key={f} className="flex items-start gap-2.5">
                  <Star className="w-4 h-4 text-[#fa5e01] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-600">{f}</span>
                </div>
              ))}
            </div>
            <Link
              href="/settings/billing"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #1A2D42, #2E4156)' }}
            >
              Upgrade to Pro
            </Link>
            <p className="text-center text-xs text-slate-400">Annual billing · 20% discount applied automatically</p>
          </div>
        </div>
      </div>
    )
  }

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTemplate(true)}
            className="text-gray-600 border-gray-200 hover:bg-gray-50"
          >
            <Settings className="w-4 h-4 mr-1.5" />
            Checklist Template
          </Button>
          <Button onClick={handleOpenCreate} className="bg-[#1A2D42] hover:bg-[#243d57] text-white">
            <Plus className="w-4 h-4 mr-2" />
            Start Offboarding
          </Button>
        </div>
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

      {/* Template Manager */}
      {showTemplate && (
        <TemplateManager onClose={() => setShowTemplate(false)} />
      )}

      {/* Inline confirm */}
      <ConfirmDialog
        state={confirmState}
        onClose={() => setConfirmState(s => ({ ...s, open: false }))}
      />
    </div>
  )
}

// ─── Template Manager ─────────────────────────────────────────────────────────

function TemplateManager({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  // Add/edit item form
  const [itemDialog, setItemDialog] = useState<{
    open: boolean
    mode: 'add' | 'edit'
    item?: TemplateItem
    defaultCategory?: string
  }>({ open: false, mode: 'add' })
  const [itemForm, setItemForm] = useState({ title: '', description: '', category: '' })

  // Add category form
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryItem, setNewCategoryItem] = useState('')
  const addCategoryRef = useRef<HTMLInputElement>(null)

  // Inline delete confirm
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false, title: '', message: '', confirmLabel: 'Delete', variant: 'destructive', onConfirm: () => {},
  })

  useEffect(() => {
    fetch('/api/offboarding/template')
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .catch(() => toast.error('Failed to load template'))
      .finally(() => setLoading(false))
  }, [])

  // Derive unique categories in order
  const allCategories = Array.from(new Set(items.map(i => i.category)))

  function openAddItem(cat?: string) {
    setItemForm({ title: '', description: '', category: cat ?? (allCategories[0] ?? 'HR') })
    setItemDialog({ open: true, mode: 'add', defaultCategory: cat })
  }

  function openEditItem(item: TemplateItem) {
    setItemForm({ title: item.title, description: item.description ?? '', category: item.category })
    setItemDialog({ open: true, mode: 'edit', item })
  }

  async function handleSaveItem() {
    if (!itemForm.title.trim() || !itemForm.category.trim()) {
      toast.error('Category and title are required')
      return
    }
    setSaving(true)
    try {
      if (itemDialog.mode === 'add') {
        const res = await fetch('/api/offboarding/template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: itemForm.category.trim(),
            title: itemForm.title.trim(),
            description: itemForm.description.trim() || null,
            sortOrder: items.filter(i => i.category === itemForm.category).length,
          }),
        })
        if (!res.ok) throw new Error('Failed to add')
        const data = await res.json()
        setItems(prev => [...prev, data.item])
        toast.success('Item added to template')
      } else if (itemDialog.item) {
        const res = await fetch(`/api/offboarding/template/${itemDialog.item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: itemForm.category.trim(),
            title: itemForm.title.trim(),
            description: itemForm.description.trim() || null,
          }),
        })
        if (!res.ok) throw new Error('Failed to update')
        const data = await res.json()
        setItems(prev => prev.map(i => i.id === data.item.id ? data.item : i))
        toast.success('Template item updated')
      }
      setItemDialog({ open: false, mode: 'add' })
    } catch {
      toast.error('Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  function confirmDeleteItem(item: TemplateItem) {
    setConfirmState({
      open: true,
      title: 'Delete Item',
      message: `Delete "${item.title}" from the template?`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/offboarding/template/${item.id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error()
          setItems(prev => prev.filter(i => i.id !== item.id))
          toast.success('Item removed')
        } catch {
          toast.error('Failed to delete item')
        }
      },
    })
  }

  function confirmDeleteCategory(cat: string) {
    const catItems = items.filter(i => i.category === cat)
    setConfirmState({
      open: true,
      title: `Delete "${cat}" Category`,
      message: `This will delete ${catItems.length} item${catItems.length !== 1 ? 's' : ''} in this category. This cannot be undone.`,
      confirmLabel: 'Delete Category',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await Promise.all(
            catItems.map(item => fetch(`/api/offboarding/template/${item.id}`, { method: 'DELETE' }))
          )
          setItems(prev => prev.filter(i => i.category !== cat))
          toast.success(`"${cat}" category deleted`)
        } catch {
          toast.error('Failed to delete category')
        }
      },
    })
  }

  async function handleImportDefaults() {
    setImporting(true)
    try {
      const created: TemplateItem[] = []
      for (let i = 0; i < DEFAULT_TEMPLATE.length; i++) {
        const item = DEFAULT_TEMPLATE[i]
        const res = await fetch('/api/offboarding/template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: item.category, title: item.title, sortOrder: i }),
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        created.push(data.item)
      }
      setItems(created)
      toast.success('Default template imported — customize as needed')
    } catch {
      toast.error('Failed to import default template')
    } finally {
      setImporting(false)
    }
  }

  async function handleAddCategory() {
    const catName = newCategoryName.trim()
    const firstItem = newCategoryItem.trim()
    if (!catName) { toast.error('Category name is required'); return }
    if (!firstItem) { toast.error('At least one item title is required'); return }
    if (allCategories.map(c => c.toLowerCase()).includes(catName.toLowerCase())) {
      toast.error('Category already exists'); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/offboarding/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: catName, title: firstItem, sortOrder: 0 }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setItems(prev => [...prev, data.item])
      setNewCategoryName('')
      setNewCategoryItem('')
      setShowAddCategory(false)
      toast.success(`Category "${catName}" added`)
    } catch {
      toast.error('Failed to add category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={open => { if (!open) onClose() }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-[#fa5e01]" />
              Checklist Template
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-0.5">
              Customize the default checklist items used when starting a new offboarding process.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {loading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Loading template…</div>
            ) : allCategories.length === 0 ? (
              <div className="space-y-3">
                {/* Banner */}
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <ClipboardList className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-800">Using default checklist template</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      The items below are applied to every new offboarding process. Click <strong>Customize</strong> to save a copy you can edit.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleImportDefaults}
                    disabled={importing}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                  >
                    {importing ? 'Importing…' : 'Customize'}
                  </Button>
                </div>

                {/* Preview of default items grouped by category */}
                {Array.from(new Set(DEFAULT_TEMPLATE.map(i => i.category))).map((cat, catIdx) => {
                  const catItems = DEFAULT_TEMPLATE.filter(i => i.category === cat)
                  const colorClass = getCategoryColor(cat, catIdx)
                  const dotClass = getCategoryDot(cat, catIdx)
                  return (
                    <Card key={cat} className="opacity-70">
                      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${colorClass}`}>
                        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                        <span className="font-semibold text-sm">{cat}</span>
                        <span className="text-xs opacity-60">({catItems.length})</span>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {catItems.map((item, idx) => (
                          <li key={idx} className="flex items-center gap-3 px-4 py-2.5">
                            <Circle className="w-4 h-4 text-gray-200 flex-shrink-0" />
                            <p className="text-sm text-gray-500">{item.title}</p>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )
                })}
              </div>
            ) : (
              allCategories.map((cat, catIdx) => {
                const catItems = items.filter(i => i.category === cat).sort((a, b) => a.sortOrder - b.sortOrder)
                const colorClass = getCategoryColor(cat, catIdx)
                const dotClass = getCategoryDot(cat, catIdx)
                return (
                  <Card key={cat} className="overflow-hidden">
                    <div className={`flex items-center justify-between px-4 py-2.5 border-b ${colorClass}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                        <span className="font-semibold text-sm">{cat}</span>
                        <span className="text-xs opacity-60">({catItems.length})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openAddItem(cat)}
                          className="p-1 rounded hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
                          title="Add item"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => confirmDeleteCategory(cat)}
                          className="p-1 rounded hover:bg-red-100 transition-colors opacity-60 hover:opacity-100"
                          title="Delete category"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {catItems.map(item => (
                        <li key={item.id} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700">{item.title}</p>
                            {item.description && (
                              <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditItem(item)}
                              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => confirmDeleteItem(item)}
                              className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => openAddItem(cat)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add item to {cat}
                    </button>
                  </Card>
                )
              })
            )}

            {/* Add Category */}
            {showAddCategory ? (
              <Card className="border-2 border-dashed border-[#fa5e01]/40 bg-orange-50/30">
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <FolderPlus className="w-4 h-4 text-[#fa5e01]" />
                    New Category
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category Name</label>
                    <Input
                      ref={addCategoryRef}
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Legal, Compliance, Security…"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">First Item Title</label>
                    <Input
                      value={newCategoryItem}
                      onChange={e => setNewCategoryItem(e.target.value)}
                      placeholder="e.g. Sign NDA exit agreement"
                      className="text-sm"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddCategory() }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddCategory}
                      disabled={saving}
                      className="bg-[#1A2D42] hover:bg-[#243d57] text-white"
                    >
                      {saving ? 'Adding…' : 'Add Category'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowAddCategory(false); setNewCategoryName(''); setNewCategoryItem('') }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <button
                onClick={() => { setShowAddCategory(true); setTimeout(() => addCategoryRef.current?.focus(), 100) }}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:border-[#fa5e01]/40 hover:bg-orange-50/20 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                Add Category
              </button>
            )}
          </div>

          <DialogFooter className="border-t pt-3">
            <p className="text-xs text-gray-400 flex-1 text-left">Changes apply to new offboarding processes only.</p>
            <Button onClick={onClose} className="bg-[#1A2D42] hover:bg-[#243d57] text-white">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit item dialog */}
      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {itemDialog.mode === 'add' ? 'Add Template Item' : 'Edit Template Item'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <Input
                value={itemForm.category}
                onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. HR, Finance, IT…"
                list="template-categories"
              />
              <datalist id="template-categories">
                {allCategories.map(c => <option key={c} value={c} />)}
              </datalist>
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
            <Button variant="outline" onClick={() => setItemDialog(d => ({ ...d, open: false }))}>Cancel</Button>
            <Button
              onClick={handleSaveItem}
              disabled={saving}
              className="bg-[#1A2D42] hover:bg-[#243d57] text-white"
            >
              {saving ? 'Saving…' : itemDialog.mode === 'add' ? 'Add Item' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        state={confirmState}
        onClose={() => setConfirmState(s => ({ ...s, open: false }))}
      />
    </>
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

  // Inline delete confirm
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false, title: '', message: '', confirmLabel: 'Delete', variant: 'destructive', onConfirm: () => {},
  })

  const pct = process.itemsTotal > 0
    ? Math.round((process.itemsDone / process.itemsTotal) * 100)
    : 0

  // Group items — include all categories
  const allCategories = Array.from(new Set([
    ...process.items.map(i => i.category),
  ]))

  const grouped = allCategories.reduce<Record<string, OffboardingItem[]>>((acc, cat) => {
    const catItems = process.items.filter(i => i.category === cat).sort((a, b) => a.sortOrder - b.sortOrder)
    if (catItems.length > 0) acc[cat] = catItems
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

  function handleDeleteItem(item: OffboardingItem) {
    setConfirmState({
      open: true,
      title: 'Delete Item',
      message: `Delete "${item.title}"?`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/offboarding/${process.id}/items/${item.id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Failed to delete')
          onItemsChanged(process.items.filter(i => i.id !== item.id))
          toast.success('Item deleted')
        } catch {
          toast.error('Failed to delete item')
        }
      },
    })
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
      {Object.entries(grouped).map(([cat, catItems], catIdx) => {
        const catDone = catItems.filter(i => i.isDone).length
        const colorClass = getCategoryColor(cat, catIdx)
        const dotClass = getCategoryDot(cat, catIdx)
        return (
          <Card key={cat}>
            <CardContent className="p-0">
              <div className={`flex items-center justify-between px-4 py-3 border-b ${colorClass}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                  <span className="font-semibold text-sm">{cat}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium opacity-75">{catDone}/{catItems.length}</span>
                  <button
                    onClick={() => openAdd(cat)}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                    title={`Add item to ${cat}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-gray-100">
                {catItems.map(item => (
                  <li key={item.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <button
                      onClick={() => onToggleItem(item)}
                      className="mt-0.5 flex-shrink-0 transition-colors hover:scale-110"
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
              <button
                onClick={() => openAdd(cat)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-100"
              >
                <Plus className="w-3.5 h-3.5" />
                Add item to {cat}
              </button>
            </CardContent>
          </Card>
        )
      })}

      {/* Add to new category */}
      <button
        onClick={() => openAdd('Other')}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add custom checklist item
      </button>

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
              <Input
                value={itemForm.category}
                onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. HR, Finance, IT…"
                list="checklist-categories"
              />
              <datalist id="checklist-categories">
                {allCategories.map(c => <option key={c} value={c} />)}
              </datalist>
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

      {/* Delete confirm */}
      <ConfirmDialog
        state={confirmState}
        onClose={() => setConfirmState(s => ({ ...s, open: false }))}
      />
    </div>
  )
}
