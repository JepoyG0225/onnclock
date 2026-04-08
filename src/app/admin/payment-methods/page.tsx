'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wallet, Plus, Save, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'

type PaymentMethodType = 'GCASH' | 'BANK_TRANSFER' | 'E_WALLET' | 'OTHER'

interface PaymentMethod {
  id: string
  code: string
  label: string
  type: PaymentMethodType
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  instructions: string | null
  qrImageUrl: string | null
  sortOrder: number
  isActive: boolean
}

const EMPTY: Omit<PaymentMethod, 'id'> = {
  code: '',
  label: '',
  type: 'OTHER',
  bankName: '',
  accountName: '',
  accountNumber: '',
  instructions: '',
  qrImageUrl: '',
  sortOrder: 100,
  isActive: true,
}

const TYPE_LABELS: Record<PaymentMethodType, string> = {
  GCASH: 'GCash',
  BANK_TRANSFER: 'Bank Transfer',
  E_WALLET: 'E-Wallet',
  OTHER: 'Other',
}

const TYPE_COLORS: Record<PaymentMethodType, string> = {
  GCASH: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  BANK_TRANSFER: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  E_WALLET: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  OTHER: 'bg-slate-700/50 text-slate-400 border-slate-600',
}

export default function AdminPaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newMethod, setNewMethod] = useState({ ...EMPTY })
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/payment-methods')
      if (!res.ok) throw new Error('Access denied')
      const data = await res.json()
      setMethods(data.methods ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function updateMethod(id: string, patch: Partial<PaymentMethod>) {
    setMethods(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  async function saveMethod(method: PaymentMethod) {
    setSavingId(method.id)
    try {
      const res = await fetch(`/api/admin/payment-methods/${method.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: method.label,
          type: method.type,
          bankName: method.bankName || null,
          accountName: method.accountName || null,
          accountNumber: method.accountNumber || null,
          instructions: method.instructions || null,
          qrImageUrl: method.qrImageUrl || null,
          sortOrder: method.sortOrder,
          isActive: method.isActive,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteMethod(id: string) {
    if (!window.confirm('Delete this payment method? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/payment-methods/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setMethods(prev => prev.filter(m => m.id !== id))
      toast.success('Deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  async function addMethod() {
    if (!newMethod.code.trim() || !newMethod.label.trim()) {
      toast.error('Code and label are required')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMethod,
          code: newMethod.code.trim().toUpperCase(),
          label: newMethod.label.trim(),
          bankName: newMethod.bankName || null,
          accountName: newMethod.accountName || null,
          accountNumber: newMethod.accountNumber || null,
          instructions: newMethod.instructions || null,
          qrImageUrl: newMethod.qrImageUrl || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to add')
      const payload = await res.json()
      setMethods(prev => [...prev, payload.method].sort((a, b) => a.sortOrder - b.sortOrder))
      setNewMethod({ ...EMPTY })
      setShowAdd(false)
      toast.success('Payment method added')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-400/70 font-semibold">System Admin</p>
          <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-cyan-400" /> Payment Methods
          </h1>
          <p className="text-sm text-slate-400 mt-1">Configure payment channels available to companies for billing</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          {showAdd ? 'Cancel' : 'Add Method'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border border-cyan-500/20 bg-slate-900 p-5 space-y-4">
          <p className="text-sm font-semibold text-cyan-300">New Payment Method</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Code *</label>
              <input
                value={newMethod.code}
                onChange={e => setNewMethod(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. GCASH_MAIN"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Label *</label>
              <input
                value={newMethod.label}
                onChange={e => setNewMethod(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. GCash (Main)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Type</label>
              <select
                value={newMethod.type}
                onChange={e => setNewMethod(p => ({ ...p, type: e.target.value as PaymentMethodType }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              >
                {(Object.keys(TYPE_LABELS) as PaymentMethodType[]).map(k => (
                  <option key={k} value={k}>{TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Bank Name</label>
              <input
                value={newMethod.bankName ?? ''}
                onChange={e => setNewMethod(p => ({ ...p, bankName: e.target.value }))}
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Account Name</label>
              <input
                value={newMethod.accountName ?? ''}
                onChange={e => setNewMethod(p => ({ ...p, accountName: e.target.value }))}
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Account Number</label>
              <input
                value={newMethod.accountNumber ?? ''}
                onChange={e => setNewMethod(p => ({ ...p, accountNumber: e.target.value }))}
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">QR Image URL</label>
              <input
                value={newMethod.qrImageUrl ?? ''}
                onChange={e => setNewMethod(p => ({ ...p, qrImageUrl: e.target.value }))}
                placeholder="https://…"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Sort Order</label>
              <input
                type="number"
                min={0}
                value={newMethod.sortOrder}
                onChange={e => setNewMethod(p => ({ ...p, sortOrder: Number(e.target.value) || 100 }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Instructions</label>
            <textarea
              rows={2}
              value={newMethod.instructions ?? ''}
              onChange={e => setNewMethod(p => ({ ...p, instructions: e.target.value }))}
              placeholder="Payment instructions shown to companies…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={addMethod}
              disabled={adding}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Method
            </button>
          </div>
        </div>
      )}

      {/* Methods list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : methods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-slate-500 text-sm">
          No payment methods configured. Add one above.
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map(method => (
            <div key={method.id} className={`rounded-2xl border bg-slate-900 p-5 transition-opacity ${method.isActive ? 'border-slate-800' : 'border-slate-800/40 opacity-60'}`}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${TYPE_COLORS[method.type]}`}>
                    {TYPE_LABELS[method.type]}
                  </span>
                  <div>
                    <p className="font-bold text-slate-100">{method.label}</p>
                    <p className="text-xs text-slate-500">{method.code}</p>
                  </div>
                </div>
                <button
                  onClick={() => updateMethod(method.id, { isActive: !method.isActive })}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${method.isActive ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {method.isActive
                    ? <><ToggleRight className="w-5 h-5" /> Active</>
                    : <><ToggleLeft className="w-5 h-5" /> Inactive</>
                  }
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Label</label>
                  <input
                    value={method.label}
                    onChange={e => updateMethod(method.id, { label: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Type</label>
                  <select
                    value={method.type}
                    onChange={e => updateMethod(method.id, { type: e.target.value as PaymentMethodType })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                  >
                    {(Object.keys(TYPE_LABELS) as PaymentMethodType[]).map(k => (
                      <option key={k} value={k}>{TYPE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Sort Order</label>
                  <input
                    type="number"
                    min={0}
                    value={method.sortOrder}
                    onChange={e => updateMethod(method.id, { sortOrder: Number(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Bank Name</label>
                  <input
                    value={method.bankName ?? ''}
                    onChange={e => updateMethod(method.id, { bankName: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Account Name</label>
                  <input
                    value={method.accountName ?? ''}
                    onChange={e => updateMethod(method.id, { accountName: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Account Number</label>
                  <input
                    value={method.accountNumber ?? ''}
                    onChange={e => updateMethod(method.id, { accountNumber: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                    placeholder="—"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">QR Image URL</label>
                  <input
                    value={method.qrImageUrl ?? ''}
                    onChange={e => updateMethod(method.id, { qrImageUrl: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                    placeholder="https://…"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Instructions</label>
                <textarea
                  rows={2}
                  value={method.instructions ?? ''}
                  onChange={e => updateMethod(method.id, { instructions: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                  placeholder="—"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => deleteMethod(method.id)}
                  disabled={deletingId === method.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-semibold disabled:opacity-60 transition-colors"
                >
                  {deletingId === method.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
                <button
                  onClick={() => saveMethod(method)}
                  disabled={savingId === method.id}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
                >
                  {savingId === method.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
