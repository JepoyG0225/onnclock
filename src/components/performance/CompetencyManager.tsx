'use client'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export interface Competency {
  id: string
  key: string
  label: string
  description: string | null
  sortOrder: number
  isActive: boolean
}

const inputCls =
  'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition'

/**
 * Self-contained CRUD UI for a company's scorecard competencies. Used both on
 * the Settings page and in the "Manage Competencies" modal on Performance
 * Reviews. Fetches its own data; calls onChange after any mutation so callers
 * can refresh dependent views.
 */
export function CompetencyManager({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<Competency[]>([])
  // Snapshot of last-saved label/description per row, to detect unsaved edits.
  const [savedById, setSavedById] = useState<Record<string, { label: string; description: string | null }>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/performance-reviews/competencies')
    const data = await res.json().catch(() => ({}))
    const active = ((data.competencies ?? []) as Competency[]).filter(c => c.isActive)
    setItems(active)
    setSavedById(Object.fromEntries(active.map(c => [c.id, { label: c.label, description: c.description }])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function updateLocal(id: string, patch: Partial<Competency>) {
    setItems(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)))
  }

  async function addCompetency() {
    if (!newLabel.trim()) { toast.error('Enter a competency name'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/performance-reviews/competencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, description: newDesc }),
      })
      if (!res.ok) throw new Error()
      setNewLabel(''); setNewDesc('')
      toast.success('Competency added')
      await load(); onChange?.()
    } catch { toast.error('Failed to add competency') } finally { setBusy(false) }
  }

  function isDirty(c: Competency): boolean {
    const snap = savedById[c.id]
    if (!snap) return true
    return (c.label ?? '') !== (snap.label ?? '') || (c.description ?? '') !== (snap.description ?? '')
  }

  async function saveRow(c: Competency) {
    if (!c.label.trim()) { toast.error('Competency name cannot be empty'); return }
    setSavingId(c.id)
    try {
      const res = await fetch('/api/performance-reviews/competencies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, label: c.label, description: c.description }),
      })
      if (!res.ok) throw new Error()
      setSavedById(prev => ({ ...prev, [c.id]: { label: c.label, description: c.description } }))
      toast.success('Competency saved'); onChange?.()
    } catch { toast.error('Failed to save change') } finally { setSavingId(null) }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/performance-reviews/competencies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      setItems(prev => prev.filter(c => c.id !== id))
      toast.success('Competency removed'); onChange?.()
    } catch { toast.error('Failed to remove competency') } finally { setBusy(false) }
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setItems(next)
    try {
      await fetch('/api/performance-reviews/competencies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: next.map(c => c.id) }),
      })
      onChange?.()
    } catch { toast.error('Failed to reorder'); await load() }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-gray-400">No competencies yet. Add the first one below.</p>
      )}

      {items.map((c, idx) => {
        const dirty = isDirty(c)
        return (
        <div key={c.id} className={`flex items-start gap-2 rounded-xl border bg-white p-3 transition-colors ${dirty ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'}`}>
          <div className="flex flex-col items-center pt-1.5 text-gray-300"><GripVertical className="w-4 h-4" /></div>
          <div className="flex-1 min-w-0 space-y-2">
            <input
              value={c.label}
              onChange={e => updateLocal(c.id, { label: e.target.value })}
              placeholder="Competency name"
              className={`${inputCls} w-full font-semibold text-slate-800`}
            />
            <input
              value={c.description ?? ''}
              onChange={e => updateLocal(c.id, { description: e.target.value })}
              placeholder="Short description (optional)"
              className={`${inputCls} w-full text-slate-600`}
            />
            {dirty && (
              <Button
                size="sm"
                onClick={() => saveRow(c)}
                disabled={savingId === c.id}
                className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white"
              >
                {savingId === c.id
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                  : <><Save className="w-3.5 h-3.5" /> Save changes</>}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1 pt-1">
            <button onClick={() => move(idx, -1)} disabled={idx === 0 || busy} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
            <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1 || busy} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
            <button onClick={() => remove(c.id)} disabled={busy} className="p-1 text-gray-300 hover:text-red-500" title="Remove competency"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        )
      })}

      <div className="rounded-xl border border-dashed border-gray-300 bg-slate-50/50 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add competency</p>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Competency name (e.g. Leadership)" className={`${inputCls} w-full`} />
        <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Short description (optional)" className={`${inputCls} w-full`} />
        <Button size="sm" onClick={addCompetency} disabled={busy} className="gap-1.5 text-xs bg-[#000000] hover:bg-primary">
          <Plus className="w-3.5 h-3.5" /> Add competency
        </Button>
      </div>
    </div>
  )
}
