'use client'

/**
 * Workflow configuration: the company's task statuses and labels.
 *
 * Statuses are the Kanban axis, so this is where the board's shape is
 * defined. Each status carries a category (To do / In progress / Done) that
 * tells the app what the status *means* — that's what drives completion
 * dates, progress counts and the tracker's overdue logic without hardcoding
 * status names.
 */

import { useState } from 'react'
import { Trash2, Plus, Loader2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { LabelBrief, StatusCategory, TaskStatus } from './types'

const TABS = ['Statuses', 'Labels'] as const
type Tab = (typeof TABS)[number]

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}

export function StatusManagerDialog({
  statuses: initialStatuses,
  labels: initialLabels,
  onClose,
  onChanged,
}: {
  statuses: TaskStatus[]
  labels: LabelBrief[]
  onClose: () => void
  onChanged: () => void
}) {
  const [tab, setTab] = useState<Tab>('Statuses')
  const [statuses, setStatuses] = useState(initialStatuses)
  const [labels, setLabels] = useState(initialLabels)
  const [busy, setBusy] = useState(false)

  const [newStatus, setNewStatus] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#6366f1')

  const applyStatuses = async (init: RequestInit, url = '/api/task-statuses') => {
    setBusy(true)
    try {
      const res = await fetch(url, init)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Update failed')
      }
      const data = await res.json()
      if (data.statuses) setStatuses(data.statuses)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const addStatus = () => {
    if (!newStatus.trim()) return
    void applyStatuses({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStatus.trim() }),
    }).then(() => setNewStatus(''))
  }

  const updateStatus = (id: string, patch: Record<string, unknown>) =>
    applyStatuses({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update: { id, ...patch } }),
    })

  const deleteStatus = (id: string) => {
    if (!confirm('Delete this status? Its tasks move to the first remaining status.')) return
    void applyStatuses({ method: 'DELETE' }, `/api/task-statuses?statusId=${id}`)
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...statuses]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setStatuses(next)
    void applyStatuses({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(s => s.id) }),
    })
  }

  const refreshLabels = async () => {
    const res = await fetch('/api/task-labels')
    if (res.ok) setLabels((await res.json()).labels ?? [])
    onChanged()
  }

  const addLabel = async () => {
    if (!newLabel.trim()) return
    const res = await fetch('/api/task-labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newLabel.trim(), color: newLabelColor }),
    })
    if (res.ok) { setNewLabel(''); await refreshLabels() }
    else toast.error('Could not add the label')
  }

  const deleteLabel = async (id: string) => {
    const res = await fetch(`/api/task-labels?labelId=${id}`, { method: 'DELETE' })
    if (res.ok) await refreshLabels()
    else toast.error('Could not delete the label')
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Workflow settings</DialogTitle></DialogHeader>

        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-sm font-medium transition',
                tab === t ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Statuses' && (
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">
              The <strong>category</strong> tells the app what a status means. Tasks in a
              <strong> Done</strong> status get a completion date and drop out of the tracker.
            </p>

            {statuses.map((s, i) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-muted-foreground disabled:opacity-30" aria-label="Move up">▲</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === statuses.length - 1}
                    className="text-muted-foreground disabled:opacity-30" aria-label="Move down">▼</button>
                </div>
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                <input
                  type="color"
                  value={s.color}
                  onChange={e => void updateStatus(s.id, { color: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`Colour for ${s.name}`}
                />
                <Input
                  defaultValue={s.name}
                  onBlur={e => {
                    if (e.target.value.trim() && e.target.value !== s.name) {
                      void updateStatus(s.id, { name: e.target.value.trim() })
                    }
                  }}
                  className="h-8 w-36 text-sm"
                />
                <select
                  value={s.category}
                  onChange={e => void updateStatus(s.id, { category: e.target.value })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                >
                  {(Object.keys(CATEGORY_LABELS) as StatusCategory[]).map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    name="default-status"
                    checked={s.isDefault}
                    onChange={() => void updateStatus(s.id, { isDefault: true })}
                  />
                  Default
                </label>
                <label className="flex items-center gap-1 text-xs">
                  WIP
                  <Input
                    type="number" min="1"
                    defaultValue={s.wipLimit ?? ''}
                    onBlur={e => {
                      const v = e.target.value
                      void updateStatus(s.id, { wipLimit: v === '' ? null : Number(v) })
                    }}
                    className="h-7 w-16 text-xs"
                  />
                </label>
                <Button
                  variant="ghost" size="icon-sm" className="ml-auto"
                  onClick={() => deleteStatus(s.id)}
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <Input
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStatus() } }}
                placeholder="New status name…"
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={addStatus} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add
              </Button>
            </div>
          </div>
        )}

        {tab === 'Labels' && (
          <div className="space-y-2 py-2">
            {labels.length === 0 && <p className="text-sm text-muted-foreground">No labels yet.</p>}
            <div className="flex flex-wrap gap-2">
              {labels.map(l => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${l.color}22`, color: l.color }}
                >
                  {l.name}
                  <button type="button" onClick={() => void deleteLabel(l.id)} aria-label={`Delete ${l.name}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <input
                type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Label colour"
              />
              <Input
                value={newLabel} onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addLabel() } }}
                placeholder="New label…" className="h-8 text-sm"
              />
              <Button size="sm" onClick={() => void addLabel()}><Plus /> Add</Button>
            </div>
          </div>
        )}

        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
