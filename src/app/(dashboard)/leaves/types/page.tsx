'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, X, Save, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

interface LeaveType {
  id: string
  name: string
  code: string
  daysEntitled: number
  isWithPay: boolean
  isMandatory: boolean
  carryOver: boolean
  maxCarryOver: number | null
  requiresDocuments: boolean
  description: string | null
  genderRestriction: string | null
}

const emptyForm = {
  name: '', code: '', daysEntitled: 5, isWithPay: true, isMandatory: false,
  carryOver: false, maxCarryOver: '', requiresDocuments: false, description: '', genderRestriction: '',
}

const GENDER_LABELS: Record<string, string> = { MALE: 'Male only', FEMALE: 'Female only' }

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
      <div
        onClick={() => onChange(!checked)}
        className="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
        style={{ background: checked ? '#fa5e01' : '#e2e8f0' }}
      >
        <div
          className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
          style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </div>
      <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">{label}</span>
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
  const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2"
  const inputStyle = { background: '#f8fafc', border: '2px solid #e2e8f0', color: '#227f84' }

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm"
      style={{ border: '2px solid #fa5e01', background: '#fff' }}
    >
      {/* Form header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#fa5e01' }}>
            {isEdit ? <Edit2 className="w-3.5 h-3.5 text-white" /> : <Plus className="w-3.5 h-3.5 text-white" />}
          </div>
          <h3 className="text-sm font-bold" style={{ color: '#227f84' }}>
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
            <input
              className={inputClass}
              style={inputStyle}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Service Incentive Leave"
              onFocus={e => { e.target.style.borderColor = '#fa5e01'; e.target.style.boxShadow = '0 0 0 3px rgba(250,94,1,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
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
              onFocus={e => { e.target.style.borderColor = '#fa5e01'; e.target.style.boxShadow = '0 0 0 3px rgba(250,94,1,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
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
              onFocus={e => { e.target.style.borderColor = '#fa5e01'; e.target.style.boxShadow = '0 0 0 3px rgba(250,94,1,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
            />
          </div>
        </div>

        {/* Row 2 — Toggles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 py-3 px-4 rounded-xl" style={{ background: '#f8fafc' }}>
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
                onFocus={e => { e.target.style.borderColor = '#fa5e01'; e.target.style.boxShadow = '0 0 0 3px rgba(250,94,1,0.08)' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
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
            <input
              className={inputClass}
              style={inputStyle}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this leave type..."
              onFocus={e => { e.target.style.borderColor = '#fa5e01'; e.target.style.boxShadow = '0 0 0 3px rgba(250,94,1,0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #fa5e01, #e54f00)', boxShadow: '0 4px 12px rgba(250,94,1,0.3)' }}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#227f84' }}>Leave Types</h1>
          <p className="text-sm text-slate-400 mt-0.5 font-medium">
            Configure DOLE-mandated and company leave policies
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 shadow-md"
            style={{ background: 'linear-gradient(135deg, #fa5e01, #e54f00)', boxShadow: '0 4px 12px rgba(250,94,1,0.3)' }}
          >
            <Plus className="w-4 h-4" />
            Add Leave Type
          </button>
        )}
      </div>

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
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: '#f1f5f9' }} />
          ))}
        </div>
      ) : types.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#f8fafc' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(250,94,1,0.1)' }}>
            <Plus className="w-6 h-6" style={{ color: '#fa5e01' }} />
          </div>
          <p className="text-slate-400 font-semibold">No leave types configured</p>
          <p className="text-sm text-slate-300 mt-1">Click &quot;Add Leave Type&quot; to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {types.map(t => (
            <div key={t.id}>
              {/* Leave Type Card */}
              <div
                className="rounded-2xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow group"
                style={{ border: '1px solid #e2e8f0' }}
              >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className="text-xs font-black tracking-wider px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(67,168,218,0.1)', color: '#227f84' }}
                        >
                          {t.code}
                        </span>
                        {t.isMandatory && (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(250,94,1,0.1)', color: '#fa5e01' }}>
                            DOLE
                          </span>
                        )}
                        {t.genderRestriction && (
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded-lg"
                            style={{
                              background: t.genderRestriction === 'FEMALE' ? 'rgba(236,72,153,0.1)' : 'rgba(67,168,218,0.1)',
                              color: t.genderRestriction === 'FEMALE' ? '#db2777' : '#227f84',
                            }}
                          >
                            {GENDER_LABELS[t.genderRestriction]}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-sm" style={{ color: '#227f84' }}>{t.name}</h3>

                      {/* Stats row */}
                      <div className="flex flex-wrap gap-3 mt-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#227f84' }} />
                          <span className="text-xs font-bold" style={{ color: '#227f84' }}>{t.daysEntitled} days/yr</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.isWithPay ? '#10b981' : '#ef4444' }} />
                          <span className="text-xs font-semibold" style={{ color: t.isWithPay ? '#059669' : '#dc2626' }}>
                            {t.isWithPay ? 'With Pay' : 'No Pay'}
                          </span>
                        </div>
                        {t.carryOver && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#227f84' }} />
                            <span className="text-xs font-semibold" style={{ color: '#227f84' }}>
                              Carry Over{t.maxCarryOver ? ` (max ${t.maxCarryOver}d)` : ''}
                            </span>
                          </div>
                        )}
                        {t.requiresDocuments && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />
                            <span className="text-xs font-semibold text-amber-600">Docs Required</span>
                          </div>
                        )}
                      </div>

                      {t.description && (
                        <p className="text-xs text-slate-400 mt-2 line-clamp-1">{t.description}</p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(t)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                        style={{ background: 'rgba(67,168,218,0.1)', color: '#227f84' }}
                        title="Edit leave type"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteType(t.id, t.name)}
                        disabled={deletingId === t.id}
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                        title="Archive leave type"
                      >
                        {deletingId === t.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
