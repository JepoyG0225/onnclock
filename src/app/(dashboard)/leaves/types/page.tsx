'use client'
import { AppSpinner } from '@/components/ui/AppSpinner'


import { useState, useEffect } from 'react'
import { KpiCard } from '@/components/ui/kpi-card'
import { Search, CalendarDays, Wallet, ShieldCheck, Plus, Edit2, Trash2, X, Save, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

interface LeaveType {
  id: string
  name: string
  code: string
  daysEntitled: number
  isPaidOut: boolean
  isWithPay: boolean
  isMandatory: boolean
  carryOver: boolean
  maxCarryOver: number | null
  requiresDocuments: boolean
  description: string | null
  genderRestriction: string | null
}

const emptyForm = {
  name: '', code: '', daysEntitled: 5, isPaidOut: false, isWithPay: true, isMandatory: false,
  carryOver: false, maxCarryOver: '', requiresDocuments: false, description: '', genderRestriction: '',
}

const GENDER_LABELS: Record<string, string> = { MALE: 'Male only', FEMALE: 'Female only' }

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-primary">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e=>onChange(e.target.checked)}/>
      <span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500"><span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked?'translate-x-4':''}`}/></span>
      <span className="leading-5">{label}</span>
    </label>
  )
}

function FormSection({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  isEdit,
}: {
  form: typeof emptyForm
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isEdit: boolean
}) {
  const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border"
  const inputStyle = { background: '#f7f7f7', border: '1px solid #e2e8f0', color: 'var(--brand-primary)' }

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm"
      style={{ border: '2px solid var(--brand-highlight)', background: '#fff' }}
    >
      {/* Form header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-highlight)' }}>
            {isEdit ? <Edit2 className="w-3.5 h-3.5 text-white" /> : <Plus className="w-3.5 h-3.5 text-white" />}
          </div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>
            {isEdit ? 'Edit Leave Type' : 'New Leave Type'}
          </h3>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Row 1 — Name, Code, Days */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Name *</label>
            <input data-tour="lt-name"
              className={inputClass}
              style={inputStyle}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Service Incentive Leave"
              onFocus={e => { e.target.style.borderColor = 'var(--brand-highlight)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 89, 0,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#d4d4d4'; e.target.style.boxShadow = 'none' }}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Code *</label>
            <input
              className={inputClass}
              style={inputStyle}
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. SIL"
              maxLength={10}
              onFocus={e => { e.target.style.borderColor = 'var(--brand-highlight)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 89, 0,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#d4d4d4'; e.target.style.boxShadow = 'none' }}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Days / Year</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              style={inputStyle}
              value={form.daysEntitled}
              onChange={e => setForm(f => ({ ...f, daysEntitled: Number(e.target.value) }))}
              onFocus={e => { e.target.style.borderColor = 'var(--brand-highlight)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 89, 0,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#d4d4d4'; e.target.style.boxShadow = 'none' }}
            />
          </div>
        </div>

        {/* Row 2 — Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 px-4 rounded-xl" style={{ background: '#f7f7f7' }}>
          <Toggle label="Convertible to cash" checked={form.isPaidOut} onChange={v => setForm(f => ({ ...f, isPaidOut: v }))} />
          <Toggle label="With Pay" checked={form.isWithPay} onChange={v => setForm(f => ({ ...f, isWithPay: v }))} />
          <Toggle label="DOLE Mandatory" checked={form.isMandatory} onChange={v => setForm(f => ({ ...f, isMandatory: v }))} />
          <Toggle label="Carry Over" checked={form.carryOver} onChange={v => setForm(f => ({ ...f, carryOver: v }))} />
          <Toggle label="Requires Docs" checked={form.requiresDocuments} onChange={v => setForm(f => ({ ...f, requiresDocuments: v }))} />
        </div>

        {/* Row 3 — Conditional + Gender + Description */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {form.carryOver && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Max Carry-Over Days</label>
              <input
                type="number"
                min={0}
                className={inputClass}
                style={inputStyle}
                value={form.maxCarryOver}
                onChange={e => setForm(f => ({ ...f, maxCarryOver: e.target.value }))}
                onFocus={e => { e.target.style.borderColor = 'var(--brand-highlight)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 89, 0,0.08)' }}
                onBlur={e => { e.target.style.borderColor = '#d4d4d4'; e.target.style.boxShadow = 'none' }}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Gender Restriction</label>
            <select
              className={inputClass}
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.genderRestriction}
              onChange={e => setForm(f => ({ ...f, genderRestriction: e.target.value }))}
            >
              <option value="">None (all genders)</option>
              <option value="MALE">Male only</option>
              <option value="FEMALE">Female only</option>
            </select>
          </div>
          <div className={form.carryOver ? '' : 'md:col-span-2'}>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Description</label>
            <input data-tour="lt-desc"
              className={inputClass}
              style={inputStyle}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this leave type..."
              onFocus={e => { e.target.style.borderColor = 'var(--brand-highlight)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 89, 0,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#d4d4d4'; e.target.style.boxShadow = 'none' }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
            style={{ background: '#ff5900', boxShadow: '0 4px 12px rgba(255, 89, 0,0.3)' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : isEdit ? 'Update Leave Type' : 'Add Leave Type'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LeaveTypesPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [types, setTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ ...emptyForm })
  const [editForm, setEditForm] = useState({ ...emptyForm })

  async function load() {
    setLoading(true)
    const res = await fetch('/api/leaves/types')
    const data = await res.json().catch(() => ({}))
    setTypes(data.types ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(t: LeaveType) {
    setEditingId(t.id)
    setShowAddForm(false)
    setEditForm({
      name: t.name,
      code: t.code,
      daysEntitled: t.daysEntitled,
      isPaidOut: t.isPaidOut,
      isWithPay: t.isWithPay,
      isMandatory: t.isMandatory,
      carryOver: t.carryOver,
      maxCarryOver: t.maxCarryOver?.toString() ?? '',
      requiresDocuments: t.requiresDocuments,
      description: t.description ?? '',
      genderRestriction: t.genderRestriction ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({ ...emptyForm })
  }

  async function saveNew() {
    if (!addForm.name || !addForm.code) { toast.error('Name and code are required'); return }
    setSaving(true)
    const body = {
      ...addForm,
      daysEntitled: Number(addForm.daysEntitled),
      maxCarryOver: addForm.maxCarryOver ? Number(addForm.maxCarryOver) : null,
      genderRestriction: addForm.genderRestriction || null,
    }
    const res = await fetch('/api/leaves/types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      toast.success('Leave type added')
      setShowAddForm(false)
      setAddForm({ ...emptyForm })
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error?.toString() ?? 'Failed to add leave type')
    }
    setSaving(false)
  }

  async function saveEdit() {
    if (!editingId) return
    if (!editForm.name || !editForm.code) { toast.error('Name and code are required'); return }
    setSaving(true)
    const body = {
      id: editingId,
      ...editForm,
      daysEntitled: Number(editForm.daysEntitled),
      maxCarryOver: editForm.maxCarryOver ? Number(editForm.maxCarryOver) : null,
      genderRestriction: editForm.genderRestriction || null,
    }
    const res = await fetch('/api/leaves/types', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      toast.success('Leave type updated')
      setEditingId(null)
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error?.toString() ?? 'Failed to update leave type')
    }
    setSaving(false)
  }

  async function deleteType(id: string, name: string) {
    if (!confirm(`Archive "${name}"? It will no longer appear in leave requests.`)) return
    setDeletingId(id)
    // Soft-delete by setting isActive = false
    const res = await fetch('/api/leaves/types', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: false }),
    })
    if (res.ok) {
      toast.success(`"${name}" archived`)
      load()
    } else {
      toast.error('Failed to archive leave type')
    }
    setDeletingId(null)
  }

  const visible=types.filter(t=>`${t.name} ${t.code}`.toLowerCase().includes(search.trim().toLowerCase())&&(filter==='all'||filter==='paid'&&t.isWithPay||filter==='unpaid'&&!t.isWithPay||filter==='cash'&&t.isPaidOut||filter==='mandatory'&&t.isMandatory))
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-primary)' }}>Leave Types</h1>
          <p className="text-sm text-slate-400 mt-0.5 font-medium">
            Configure DOLE-mandated and company leave policies
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 shadow-md"
            style={{ background: '#ff5900', boxShadow: '0 4px 12px rgba(255, 89, 0,0.3)' }}
          >
            <Plus className="w-4 h-4" />
            Add Leave Type
          </button>
        )}
      </div>

      {!loading&&<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Leave types" value={types.length} icon={<CalendarDays className="h-4 w-4"/>} hint="Active company policies"/>
        <KpiCard label="Paid leave" value={types.filter(t=>t.isWithPay).length} icon={<Wallet className="h-4 w-4"/>} hint="Leave with pay" tone="accent"/>
        <KpiCard label="Cash convertible" value={types.filter(t=>t.isPaidOut).length} icon={<Wallet className="h-4 w-4"/>} hint="Eligible for encashment" tone="accent"/>
        <KpiCard label="Mandatory" value={types.filter(t=>t.isMandatory).length} icon={<ShieldCheck className="h-4 w-4"/>} hint="Marked as DOLE-mandated"/>
      </div>}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input aria-label="Search leave types" placeholder="Search name or code" value={search} onChange={e=>setSearch(e.target.value)} className="h-10 w-full rounded-xl border bg-slate-50 pl-9 pr-3 text-sm"/></div><select aria-label="Filter leave types" value={filter} onChange={e=>setFilter(e.target.value)} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">All policies</option><option value="paid">Paid leave</option><option value="unpaid">Unpaid leave</option><option value="cash">Cash convertible</option><option value="mandatory">Mandatory</option></select></div>
      {/* Add Form */}
      {showAddForm && (
        <FormSection
          form={addForm}
          setForm={setAddForm}
          onSave={saveNew}
          onCancel={() => { setShowAddForm(false); setAddForm({ ...emptyForm }) }}
          saving={saving}
          isEdit={false}
        />
      )}

      {/* Edit Modal */}
      {editingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) cancelEdit() }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
            <FormSection
              form={editForm}
              setForm={setEditForm}
              onSave={saveEdit}
              onCancel={cancelEdit}
              saving={saving}
              isEdit={true}
            />
          </div>
        </div>
      )}

      {/* Leave Types Grid */}
      {loading ? <AppSpinner size="md" message="Loading..." className="py-10" /> : types.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#f7f7f7' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255, 89, 0,0.1)' }}>
            <Plus className="w-6 h-6" style={{ color: 'var(--brand-highlight)' }} />
          </div>
          <p className="text-slate-400 font-semibold">No leave types configured</p>
          <p className="text-sm text-slate-300 mt-1">Click &quot;Add Leave Type&quot; to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map(t=><article key={t.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 p-5"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-bold text-primary">{t.code}</span>{t.isMandatory&&<span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-primary">DOLE mandatory</span>}</div><h2 className="break-words text-base font-semibold text-primary">{t.name}</h2><p className="mt-2 text-sm leading-5 text-slate-500">{t.description||'No description added.'}</p></div><div className="flex shrink-0 gap-1"><button aria-label={`Edit ${t.name}`} title="Edit leave type" onClick={()=>startEdit(t)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-primary hover:bg-orange-50"><Edit2 className="h-4 w-4"/></button><button aria-label={`Archive ${t.name}`} title="Archive leave type" disabled={deletingId===t.id} onClick={()=>deleteType(t.id,t.name)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-red-600 hover:bg-red-50 disabled:opacity-50">{deletingId===t.id?<Loader2 className="h-4 w-4 animate-spin"/>:<Trash2 className="h-4 w-4"/>}</button></div></div>
            <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"><div><strong className="text-2xl font-semibold tabular-nums text-primary">{t.daysEntitled}</strong><span className="ml-2 text-xs text-slate-500">days per year</span></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${t.isWithPay?'bg-blue-50 text-primary':'bg-slate-200 text-slate-600'}`}>{t.isWithPay?'With pay':'Unpaid'}</span></div>
            <div className="mt-auto grid grid-cols-2 gap-3 border-t px-5 py-4 text-xs"><div><p className="text-slate-400">Cash conversion</p><p className="mt-1 font-medium text-primary">{t.isPaidOut?'Convertible to cash':'Not convertible'}</p></div><div><p className="text-slate-400">Carry-over</p><p className="mt-1 font-medium text-primary">{t.carryOver?(t.maxCarryOver!==null?`Up to ${t.maxCarryOver} days`:'Allowed'):'Not allowed'}</p></div><div><p className="text-slate-400">Documents</p><p className="mt-1 font-medium text-primary">{t.requiresDocuments?'Required':'Not required'}</p></div><div><p className="text-slate-400">Eligibility</p><p className="mt-1 font-medium text-primary">{t.genderRestriction?GENDER_LABELS[t.genderRestriction]:'All employees'}</p></div></div>
          </article>)}
          {!visible.length&&<div className="col-span-full rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">No leave types match your search or filter.</div>}
        </div>
      )}
    </div>
  )
}

